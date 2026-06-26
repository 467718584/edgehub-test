#!/usr/bin/env python3
"""
EdgeHub EdgeAgent v4.1 for Windows - WebSocket版本 + 文件传输
使用WebSocket与EdgeHub通信

v4.1 更新：
- 异步命令执行：命令在独立线程中执行，不阻塞WebSocket主线程
- 交互式命令检测：自动拒绝可能卡死的交互式命令
- 文件分块传输：支持大文件推送、分块接收、断点续传
"""
import os, sys, time, json, socket, platform, signal, subprocess, hashlib, urllib.request, re, threading, websocket, psutil, base64
from datetime import datetime
from urllib.error import URLError, HTTPError
import argparse
from queue import Queue

VERSION = "4.1.1-Windows"
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
            'log_level': 'info',
            'file_storage_dir': os.path.join(AGENT_DIR, 'recv')
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
        # 自动检测Windows默认编码，优先使用GBK/GB2312
        import locale
        self.default_encoding = locale.getpreferredencoding(False) or 'gbk'
    
    def _preprocess_command(self, command):
        """预处理命令，解决Windows特定命令兼容性问题"""
        # Windows date 命令在中文环境下会等待输入，自动替换为PowerShell版本
        if command.strip().lower() == 'date':
            return 'powershell -Command "Get-Date -Format yyyy/MM/dd HH:mm:ss"'
        # 如果命令包含 && date，在PowerShell中执行
        if '&&' in command and 'date' in command.lower():
            # 替换命令中的 date 为 PowerShell Get-Date
            import re
            # 匹配独立的 date 命令
            command = re.sub(r'\bdate\b', 'powershell -Command "Get-Date -Format \'yyyy/MM/dd HH:mm:ss\'"', command, flags=re.IGNORECASE)
        return command
    
    def _decode_output(self, data):
        """智能解码输出，自动尝试多种编码"""
        if not data:
            return ''
        if isinstance(data, str):
            return data
        # 尝试多种编码
        encodings = [self.default_encoding, 'gbk', 'gb2312', 'utf-8', 'latin-1']
        for enc in encodings:
            try:
                return data.decode(enc)
            except (UnicodeDecodeError, AttributeError):
                continue
        # 最后使用errors='replace'防止崩溃
        return data.decode('utf-8', errors='replace')
    
    def execute(self, command, timeout=30000):
        start_time = time.time()
        result = {'success': False, 'stdout': '', 'stderr': '', 'exit_code': -1, 'duration_ms': 0}
        
        # 预处理命令
        command = self._preprocess_command(command)
        
        try:
            # 使用二进制模式，手动解码解决编码问题
            proc = subprocess.Popen(
                command, shell=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=self.workdir
            )
            
            try:
                stdout, stderr = proc.communicate(timeout=timeout/1000)
                elapsed = (time.time() - start_time) * 1000
                result['success'] = proc.returncode == 0
                result['stdout'] = self._decode_output(stdout)
                result['stderr'] = self._decode_output(stderr)
                result['exit_code'] = proc.returncode
                result['duration_ms'] = int(elapsed)
            except subprocess.TimeoutExpired:
                proc.kill()
                stdout, stderr = proc.communicate()
                elapsed = (time.time() - start_time) * 1000
                result['success'] = False
                result['stdout'] = self._decode_output(stdout)
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
        try:
            self.ws.send(json.dumps(data, ensure_ascii=False))
            return True
        except Exception:
            return False
    
    def close(self):
        self.running = False
        if self.ws:
            self.ws.close()

# ========== 文件传输 - 接收器 ==========
class FileReceiver:
    """文件接收器 - 接收分块数据并组装"""
    
    def __init__(self, storage_dir=None):
        if storage_dir is None:
            storage_dir = os.path.join(AGENT_DIR, 'recv')
        self.storage_dir = storage_dir
        self.temp_dir = os.path.join(storage_dir, '.tmp')
        self.transfers = {}
        
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.storage_dir, exist_ok=True)
    
    def start_transfer(self, transfer_id, file_name, file_size, total_chunks, remote_path):
        """开始传输任务"""
        transfer = TransferState(
            transfer_id, file_name, file_size, total_chunks, remote_path, self.temp_dir
        )
        self.transfers[transfer_id] = transfer
        log(f"[FT] Transfer {transfer_id} started: {file_name} ({total_chunks} chunks)")
        return transfer
    
    def receive_chunk(self, transfer_id, chunk_index, data, hash_value):
        """接收分块"""
        if transfer_id not in self.transfers:
            raise ValueError(f"Transfer {transfer_id} not found")
        return self.transfers[transfer_id].write_chunk(chunk_index, data, hash_value)
    
    def assemble_transfer(self, transfer_id):
        """组装文件"""
        if transfer_id not in self.transfers:
            raise ValueError(f"Transfer {transfer_id} not found")
        
        result = self.transfers[transfer_id].assemble()
        del self.transfers[transfer_id]
        log(f"[FT] Transfer {transfer_id} completed: {result['file_path']}")
        return result
    
    def cancel_transfer(self, transfer_id):
        """取消传输"""
        if transfer_id in self.transfers:
            self.transfers[transfer_id].cleanup()
            del self.transfers[transfer_id]
            log(f"[FT] Transfer {transfer_id} cancelled")
    
    def get_progress(self, transfer_id):
        """获取进度"""
        if transfer_id not in self.transfers:
            return None
        return self.transfers[transfer_id].get_progress()


class TransferState:
    """传输状态"""
    
    def __init__(self, transfer_id, file_name, file_size, total_chunks, remote_path, temp_dir):
        self.transfer_id = transfer_id
        self.file_name = file_name
        self.file_size = file_size
        self.total_chunks = total_chunks
        self.remote_path = remote_path
        self.temp_dir = temp_dir
        self.received_chunks = {}
        self.lock = threading.Lock()
        self.start_time = time.time()
    
    def write_chunk(self, chunk_index, data, hash_value):
        """写入分块"""
        with self.lock:
            if chunk_index < 0 or chunk_index >= self.total_chunks:
                raise ValueError(f"Invalid chunk index: {chunk_index}")
            
            # 解码base64
            if isinstance(data, str):
                chunk_data = base64.b64decode(data)
            else:
                chunk_data = data
            
            # 验证MD5
            actual_hash = hashlib.md5(chunk_data).hexdigest()
            if actual_hash != hash_value:
                raise ValueError(f"Chunk {chunk_index} hash mismatch: expected {hash_value}, got {actual_hash}")
            
            # 写入临时文件
            chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{chunk_index}.chunk")
            with open(chunk_path, 'wb') as f:
                f.write(chunk_data)
            
            self.received_chunks[chunk_index] = hash_value
            
            progress = len(self.received_chunks) / self.total_chunks * 100
            return {
                'chunk_index': chunk_index,
                'received': len(self.received_chunks),
                'total': self.total_chunks,
                'progress': round(progress, 2)
            }
    
    def assemble(self):
        """组装文件"""
        if len(self.received_chunks) != self.total_chunks:
            missing = set(range(self.total_chunks)) - set(self.received_chunks.keys())
            raise ValueError(f"Missing chunks: {missing}")
        
        final_path = self.remote_path
        
        # 确保目录存在
        final_dir = os.path.dirname(final_path)
        if final_dir:
            os.makedirs(final_dir, exist_ok=True)
        
        temp_final = final_path + '.tmp'
        
        try:
            with open(temp_final, 'wb') as out:
                for i in range(self.total_chunks):
                    chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{i}.chunk")
                    with open(chunk_path, 'rb') as inp:
                        out.write(inp.read())
                    os.remove(chunk_path)  # 删除已组装的块
            
            # 原子重命名
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(temp_final, final_path)
            
            return {
                'success': True,
                'file_path': final_path,
                'file_size': os.path.getsize(final_path),
                'duration_ms': int((time.time() - self.start_time) * 1000)
            }
        except Exception as e:
            if os.path.exists(temp_final):
                os.remove(temp_final)
            raise e
    
    def get_progress(self):
        received = len(self.received_chunks)
        return {
            'transfer_id': self.transfer_id,
            'received_chunks': received,
            'total_chunks': self.total_chunks,
            'progress': round(received / self.total_chunks * 100, 2) if self.total_chunks > 0 else 0
        }
    
    def cleanup(self):
        """清理临时文件"""
        for i in range(self.total_chunks):
            chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{i}.chunk")
            if os.path.exists(chunk_path):
                os.remove(chunk_path)


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
        self.file_receiver = FileReceiver(self.cfg.g('file_storage_dir'))
        # 交互式命令黑名单
        self._interactive_commands = ['copy con', 'more', 'edlin', 'edit', 'qbasic', 'debug']
    
    def _is_interactive_command(self, command):
        """检测交互式命令（会等待用户输入，不适合自动化）"""
        cmd_lower = command.lower()
        return any(dangerous in cmd_lower for dangerous in self._interactive_commands)
    
    def start(self):
        self.running = True
        log(f"=" * 50)
        log(f"EdgeHub EdgeAgent v{VERSION} 启动")
        log(f"设备ID: {self.device.device_id}")
        log(f"设备名: {self.cfg.g('device_name')}")
        log(f"API地址: {self.cfg.g('edgehub_url')}")
        log(f"WS地址: {self.cfg.g('ws_url')}")
        log(f"文件存储: {self.cfg.g('file_storage_dir')}")
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
        elif msg_type and msg_type.startswith('transfer_'):
            self.handle_transfer(data)
        else:
            log(f"[WS] Unknown message type: {msg_type}")
    
    def handle_command(self, cmd):
        """执行命令（异步，不阻塞WebSocket主线程）"""
        command_id = cmd.get('command_id')
        command = cmd.get('command', '')
        timeout = cmd.get('timeout_ms', 30000)
        
        log(f"[CMD] {command_id}: {command[:80]}...")
        
        # 检测Pull模式命令
        if command.startswith('__FILE_PULL__:'):
            parts = command.split(':', 2)
            if len(parts) >= 3:
                transfer_id = parts[1]
                remote_path = parts[2]
                thread = threading.Thread(
                    target=self._handle_pull_async,
                    args=(command_id, transfer_id, remote_path)
                )
                thread.start()
                return
        
        # 检测交互式命令
        if self._is_interactive_command(command):
            log(f"[CMD] 拒绝交互式命令: {command[:50]}...", "WARN")
            self.ws.send({
                'type': 'command_result',
                'command_id': command_id,
                'success': False,
                'stdout': '',
                'stderr': f'交互式命令可能被卡死，已拒绝执行: {command[:50]}',
                'exit_code': -1,
                'duration_ms': 0
            })
            return
        
        # 异步执行命令，不阻塞主线程
        thread = threading.Thread(
            target=self._execute_async,
            args=(command_id, command, timeout)
        )
        thread.start()
    
    def _execute_async(self, command_id, command, timeout):
        """异步执行命令（在线程中）"""
        result = self.executor.execute(command, timeout)
        
        log(f"[CMD] Done: exit={result['exit_code']}, duration={result['duration_ms']}ms")
        
        # 通过WebSocket发送结果
        try:
            self.ws.send(json.dumps({
                'type': 'command_result',
                'command_id': command_id,
                'success': result['success'],
                'stdout': result['stdout'],
                'stderr': result['stderr'],
                'exit_code': result['exit_code'],
                'duration_ms': result['duration_ms']
            }, ensure_ascii=False))
        except Exception as e:
            log(f"[WS] Send result failed: {e}", "ERROR")
    
    def _handle_pull_async(self, command_id, transfer_id, remote_path):
        """异步处理Pull请求: 读取本地文件并分块发送"""
        import base64 as b64
        log(f"[FT] Pull: {transfer_id} <- {remote_path}")
        
        try:
            # 检查文件是否存在
            if not os.path.exists(remote_path):
                self.ws.send({
                    'type': 'command_result',
                    'command_id': command_id,
                    'success': False,
                    'stdout': '',
                    'stderr': f'File not found: {remote_path}',
                    'exit_code': -1,
                    'duration_ms': 0
                })
                return
            
            file_size = os.path.getsize(remote_path)
            chunk_size = 2 * 1024 * 1024  # 2MB
            total_chunks = (file_size + chunk_size - 1) // chunk_size
            
            # 计算文件哈希
            file_hash = self._calculate_sha256(remote_path)
            
            # 发送文件信息给EdgeHub
            self.ws.send({
                'type': 'transfer_pull_info',
                'transfer_id': transfer_id,
                'command_id': command_id,
                'file_name': os.path.basename(remote_path),
                'file_size': file_size,
                'file_hash': file_hash,
                'total_chunks': total_chunks
            })
            
            # 分块读取并发送
            with open(remote_path, 'rb') as f:
                for i in range(total_chunks):
                    chunk_data = f.read(chunk_size)
                    chunk_hash = hashlib.md5(chunk_data).hexdigest()
                    
                    # 发送分块
                    self.ws.send({
                        'type': 'transfer_pull_chunk',
                        'transfer_id': transfer_id,
                        'chunk_index': i,
                        'data': b64.b64encode(chunk_data).decode(),
                        'hash': chunk_hash,
                        'is_last': i == total_chunks - 1
                    })
                    
                    log(f"[FT] Chunk {i+1}/{total_chunks} sent")
            
            # 发送完成结果
            self.ws.send({
                'type': 'command_result',
                'command_id': command_id,
                'success': True,
                'stdout': f'Pull complete: {file_size} bytes',
                'stderr': '',
                'exit_code': 0,
                'duration_ms': 0
            })
            
            log(f"[FT] Pull complete: {file_size} bytes")
            
        except Exception as e:
            log(f"[FT] Pull error: {e}", "ERROR")
            self.ws.send({
                'type': 'command_result',
                'command_id': command_id,
                'success': False,
                'stdout': '',
                'stderr': str(e),
                'exit_code': -1,
                'duration_ms': 0
            })
    
    def _calculate_sha256(self, file_path):
        """计算文件SHA256"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    # ========== 文件传输处理 ==========
    
    def handle_transfer(self, data):
        """处理文件传输消息"""
        msg_type = data.get('type')
        
        try:
            if msg_type == 'transfer_start':
                self.handle_transfer_start(data)
            elif msg_type == 'transfer_chunk':
                self.handle_transfer_chunk(data)
            elif msg_type == 'transfer_cancel':
                self.handle_transfer_cancel(data)
            else:
                log(f"[FT] Unknown transfer type: {msg_type}")
        except Exception as e:
            log(f"[FT] Error: {e}", "ERROR")
            self.ws.send({'type': 'transfer_error', 'error': str(e)})
    
    def handle_transfer_start(self, data):
        """开始传输"""
        transfer_id = data.get('transfer_id')
        file_name = data.get('file_name')
        file_size = data.get('file_size')
        total_chunks = data.get('total_chunks')
        remote_path = data.get('remote_path')
        
        log(f"[FT] Start: {transfer_id} -> {remote_path} ({total_chunks} chunks)")
        
        self.file_receiver.start_transfer(transfer_id, file_name, file_size, total_chunks, remote_path)
        
        self.ws.send({
            'type': 'transfer_started',
            'transfer_id': transfer_id
        })
    
    def handle_transfer_chunk(self, data):
        """接收分块"""
        transfer_id = data.get('transfer_id')
        chunk_index = data.get('chunk_index')
        chunk_data = data.get('data')
        hash_value = data.get('hash')
        is_last = data.get('is_last', False)
        
        try:
            result = self.file_receiver.receive_chunk(transfer_id, chunk_index, chunk_data, hash_value)
            
            log(f"[FT] Chunk {chunk_index}/{result['received']} ({result['progress']}%)")
            
            if is_last:
                assemble_result = self.file_receiver.assemble_transfer(transfer_id)
                log(f"[FT] Complete: {assemble_result['file_path']}")
                self.ws.send({
                    'type': 'transfer_complete',
                    'transfer_id': transfer_id,
                    'file_path': assemble_result['file_path'],
                    'file_size': assemble_result['file_size']
                })
            else:
                self.ws.send({
                    'type': 'chunk_received',
                    'transfer_id': transfer_id,
                    'chunk_index': chunk_index,
                    'progress': result['progress']
                })
        except Exception as e:
            log(f"[FT] Chunk error: {e}", "ERROR")
            self.ws.send({
                'type': 'transfer_error',
                'transfer_id': transfer_id,
                'chunk_index': chunk_index,
                'error': str(e)
            })
    
    def handle_transfer_cancel(self, data):
        """取消传输"""
        transfer_id = data.get('transfer_id')
        log(f"[FT] Cancel: {transfer_id}")
        self.file_receiver.cancel_transfer(transfer_id)
        self.ws.send({
            'type': 'transfer_cancelled',
            'transfer_id': transfer_id
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
