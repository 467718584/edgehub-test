#!/usr/bin/env python3
"""
EdgeHub EdgeAgent v4.0 for Windows - WebSocket版本
使用WebSocket与EdgeHub通信
"""
import os, sys, time, json, socket, platform, signal, subprocess, hashlib, urllib.request, re, threading, websocket, psutil
from datetime import datetime
from urllib.error import URLError, HTTPError
import argparse

VERSION = "4.0.0"
AGENT_DIR = "C:\\EdgeAgent"
CONFIG_FILE = os.path.join(AGENT_DIR, "config.json")
LOG_FILE = os.path.join(AGENT_DIR, "logs", "edgeagent.log")

# ========== 日志 ==========
def log(msg, level="INFO"):
    os.makedirs(os.path.join(AGENT_DIR, "logs"), exist_ok=True)
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"{ts} [{level}] {msg}\n"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line)
    except:
        pass
    print(line.rstrip())

# ========== 配置 ==========
class Config:
    def __init__(self, args):
        self._ = {
            'edgehub_url': args.url.rstrip('/'),
            'ws_url': args.url.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api/v1', '') + '/ws',
            'device_id': hashlib.md5(args.device_name.encode()).hexdigest()[:16],
            'device_name': args.device_name,
            'device_type': 'windows',
            'api_key': args.api_key,
            'heartbeat_interval': 30,
            'log_level': 'info'
        }
        self._save_config()
    
    def _save_config(self):
        try:
            os.makedirs(AGENT_DIR, exist_ok=True)
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self._, f, indent=2)
        except Exception as e:
            log(f"配置保存失败: {e}", "ERROR")
    
    def g(self, *keys, default=None):
        v = self._
        for k in keys:
            if isinstance(v, dict) and k in v:
                v = v[k]
            else:
                return default
        return v

# ========== 系统信息 ==========
class SysInfo:
    _cpu_usage_init = False
    
    @staticmethod
    def get_cpu_info():
        try:
            return platform.processor() or 'Unknown'
        except:
            return 'Unknown'
    
    @staticmethod
    def get_memory():
        try:
            mem = psutil.virtual_memory()
            return {
                'total': mem.total // (1024**2),  # MB
                'free': mem.free // (1024**2),
                'available': mem.available // (1024**2),
                'used': mem.used // (1024**2),
                'percent': mem.percent
            }
        except:
            return None
    
    @staticmethod
    def collect():
        # Init cpu_percent on first call (discard initial high value)
        if not SysInfo._cpu_usage_init:
            psutil.cpu_percent(interval=None)
            SysInfo._cpu_usage_init = True
        
        try:
            disk = psutil.disk_usage('C:\\')
            boot_time = psutil.boot_time()
            uptime_seconds = time.time() - boot_time
            days = int(uptime_seconds // 86400)
            hours = int((uptime_seconds % 86400) // 3600)
            minutes = int((uptime_seconds % 3600) // 60)
            uptime = f"{days}天 {hours}小时 {minutes}分钟"
        except:
            uptime = 'Unknown'
        
        return {
            'cpu': {
                'model': SysInfo.get_cpu_info(),
                'cores': psutil.cpu_count() or 1,
                'usage': psutil.cpu_percent(interval=None)
            },
            'memory': SysInfo.get_memory(),
            'disk': {
                'total': disk.total // (1024**3),  # GB
                'used': disk.used // (1024**3),
                'percent': disk.percent
            },
            'platform': f"{platform.system()} {platform.release()}",
            'uptime': uptime
        }
    
    @staticmethod
    def get_cpu_usage():
        return psutil.cpu_percent(interval=None)

# ========== 命令执行器 ==========
class CommandExecutor:
    def __init__(self):
        self.workdir = os.environ.get('TEMP', 'C:\\Temp')
    
    def execute(self, command, timeout=30000):
        start_time = time.time()
        result = {'success': False, 'stdout': '', 'stderr': '', 'exit_code': -1, 'duration_ms': 0}
        
        try:
            proc = subprocess.Popen(
                command, shell=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=self.workdir, text=True
            )
            
            try:
                stdout, stderr = proc.communicate(timeout=timeout/1000)
                elapsed = (time.time() - start_time) * 1000
                result['success'] = proc.returncode == 0
                result['stdout'] = stdout
                result['stderr'] = stderr
                result['exit_code'] = proc.returncode
                result['duration_ms'] = int(elapsed)
            except subprocess.TimeoutExpired:
                proc.kill()
                stdout, stderr = proc.communicate()
                elapsed = (time.time() - start_time) * 1000
                result['success'] = False
                result['stdout'] = stdout
                result['stderr'] = f"命令执行超时 ({timeout/1000}秒)"
                result['exit_code'] = -1
                result['duration_ms'] = int(elapsed)
                
        except Exception as e:
            elapsed = (time.time() - start_time) * 1000
            result['success'] = False
            result['stderr'] = str(e)
            result['exit_code'] = -1
            result['duration_ms'] = int(elapsed)
            log(f"命令执行异常: {e}", "ERROR")
        
        return result

# ========== HTTP客户端 ==========
class HTTPClient:
    def __init__(self, url, key, timeout=30):
        self.base_url = url.rstrip('/')
        self.api_key = key
        self.timeout = timeout
    
    def _do(self, method, path, data=None):
        url = f"{self.base_url}{path}"
        try:
            data_bytes = json.dumps(data).encode() if data else None
            req = urllib.request.Request(url, data=data_bytes, method=method)
            req.add_header('X-API-Key', self.api_key)
            req.add_header('Content-Type', 'application/json')
            req.add_header('User-Agent', f'EdgeAgent/{VERSION}')
            
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            log(f"HTTP {method} {path}: {e}", "ERROR")
            return None
    
    def post(self, path, data=None):
        return self._do('POST', path, data)

# ========== WebSocket客户端 ==========
class WSClient:
    def __init__(self, url, device_id, api_key):
        self.url = url
        self.device_id = device_id
        self.api_key = api_key
        self.ws = None
        self.running = False
        self.reconnect_delay = 5
        self.on_message = None
        self.on_connect = None
    
    def connect(self):
        full_url = f"{self.url}?device_id={self.device_id}&api_key={self.api_key}&type=device"
        log(f"[WS] Connecting to {full_url}")
        
        try:
            self.ws = websocket.WebSocketApp(
                full_url,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
                on_open=self._on_open
            )
            self.running = True
            self.ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            log(f"[WS] Connection failed: {e}", "ERROR")
            return False
        return True
    
    def _on_open(self, ws):
        log("[WS] Connected!")
        if self.on_connect:
            self.on_connect()
    
    def _on_message(self, ws, message):
        try:
            data = json.loads(message)
            log(f"[WS] Received: {json.dumps(data)[:100]}")
            if self.on_message:
                self.on_message(data)
        except Exception as e:
            log(f"[WS] Message parse error: {e}", "ERROR")
    
    def _on_error(self, ws, error):
        log(f"[WS] Error: {error}", "ERROR")
    
    def _on_close(self, ws, close_status_code, close_msg):
        log(f"[WS] Closed: {close_status_code} {close_msg}")
        self.running = False
    
    def send(self, data):
        if self.ws and self.ws.sock and self.ws.sock.connected:
            self.ws.send(json.dumps(data))
            return True
        return False
    
    def close(self):
        self.running = False
        if self.ws:
            self.ws.close()

# ========== 设备管理 ==========
class Device:
    def __init__(self, cfg, http):
        self.cfg = cfg
        self.http = http
        self.device_id = cfg.g('device_id')
        self.status = 'offline'
    
    def register(self):
        payload = {
            'device_id': self.device_id,
            'device_name': self.cfg.g('device_name'),
            'device_type': self.cfg.g('device_type'),
            'os_version': f"{platform.system()} {platform.release()}",
            'architecture': platform.machine(),
            'metadata': {'agent_version': VERSION, 'sysinfo': SysInfo.collect()}
        }
        
        r = self.http.post('/devices/register', payload)
        if r and r.get('success'):
            self.status = 'online'
            log(f"注册成功 (device_id={self.device_id})")
            return True
        
        log(f"注册失败: {r}", "ERROR")
        return False

# ========== 主程序 ==========
class EdgeAgent:
    def __init__(self, args):
        self.args = args
        self.cfg = Config(args)
        self.http = HTTPClient(self.cfg.g('edgehub_url'), self.cfg.g('api_key'))
        self.device = Device(self.cfg, self.http)
        self.executor = CommandExecutor()
        self.running = False
        self.ws = None
    
    def start(self):
        self.running = True
        log(f"=" * 50)
        log(f"EdgeHub EdgeAgent v{VERSION} 启动")
        log(f"设备ID: {self.device.device_id}")
        log(f"设备名: {self.cfg.g('device_name')}")
        log(f"API地址: {self.cfg.g('edgehub_url')}")
        log(f"WS地址: {self.cfg.g('ws_url')}")
        log(f"=" * 50)
        
        # 注册设备
        if not self.device.register():
            log("注册失败，退出", "ERROR")
            return False
        
        # 启动WebSocket
        self.start_websocket()
        return True
    
    def start_websocket(self):
        ws_url = self.cfg.g('ws_url')
        device_id = self.device.device_id
        api_key = self.cfg.g('api_key')
        
        self.ws = WSClient(ws_url, device_id, api_key)
        
        def on_message(data):
            self.handle_message(data)
        
        def on_connect():
            log("[WS] Connection established, ready for commands")
        
        self.ws.on_message = on_message
        self.ws.on_connect = on_connect
        
        log("[WS] Starting WebSocket connection...")
        
        heartbeat_interval = self.cfg.g('heartbeat_interval', 30)
        last_heartbeat = 0
        
        while self.running:
            if self.ws.connect():
                # 连接成功后保持运行，同时处理心跳
                while self.running and self.ws.running:
                    time.sleep(1)
                    last_heartbeat += 1
                    if last_heartbeat >= heartbeat_interval:
                        self.send_heartbeat()
                        last_heartbeat = 0
            else:
                log(f"[WS] Reconnecting in {self.ws.reconnect_delay}s...", "WARN")
                time.sleep(self.ws.reconnect_delay)
    
    def send_heartbeat(self):
        """发送心跳，包含系统信息"""
        try:
            payload = {
                'timestamp': datetime.now().isoformat(),
                'status': 'online',
                'sysinfo': SysInfo.collect()
            }
            r = self.http.post(f'/devices/{self.device.device_id}/heartbeat', payload)
            if r and r.get('success'):
                log(f"[HB] Heartbeat OK (CPU: {payload['sysinfo']['cpu']['usage']}%)")
            else:
                log(f"[HB] Heartbeat failed", "WARN")
        except Exception as e:
            log(f"[HB] Heartbeat error: {e}", "ERROR")
    
    def handle_message(self, data):
        """处理WebSocket消息"""
        msg_type = data.get('type')
        
        if msg_type in ('command', 'execute_command'):
            self.handle_command(data)
        elif msg_type == 'ping':
            self.ws.send({'type': 'pong'})
        else:
            log(f"[WS] Unknown message type: {msg_type}")
    
    def handle_command(self, cmd):
        """执行命令"""
        command_id = cmd.get('command_id')
        command = cmd.get('command', '')
        timeout = cmd.get('timeout_ms', 30000)
        
        log(f"[CMD] {command_id}: {command[:80]}...")
        
        result = self.executor.execute(command, timeout)
        
        log(f"[CMD] Done: exit={result['exit_code']}, duration={result['duration_ms']}ms")
        
        # 通过WebSocket发送结果
        self.ws.send({
            'type': 'command_result',
            'command_id': command_id,
            'success': result['success'],
            'stdout': result['stdout'],
            'stderr': result['stderr'],
            'exit_code': result['exit_code'],
            'duration_ms': result['duration_ms']
        })
    
    def stop(self):
        self.running = False
        if self.ws:
            self.ws.close()
        log("Agent已停止")

# ========== 入口 ==========
def parse_args():
    parser = argparse.ArgumentParser(description='EdgeHub EdgeAgent')
    parser.add_argument('--url', default='http://1.13.247.173:80/api/v1', help='EdgeHub地址')
    parser.add_argument('--api-key', default='edgehub_secret_key', help='API密钥')
    parser.add_argument('--device-name', default=socket.gethostname(), help='设备名称')
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_args()
    agent = EdgeAgent(args)
    
    def signal_handler(sig, frame):
        print()
        log("收到停止信号")
        agent.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        agent.start()
    except KeyboardInterrupt:
        agent.stop()
    except Exception as e:
        log(f"启动异常: {e}", "ERROR")
        sys.exit(1)
