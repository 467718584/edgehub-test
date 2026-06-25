#!/usr/bin/env python3
"""
EdgeHub EdgeAgent v4.1 for Linux - WebSocket版本 + 文件传输
支持分块传输、断点续传、进度追踪
"""

import os
import sys
import json
import time
import socket
import platform
import argparse
import threading
import subprocess
import hashlib
import base64
import shutil
import urllib.request
import urllib.error
import websocket

from datetime import datetime

# ========== 版本信息 ==========
VERSION = "4.1.1-Linux"

# ========== 日志 ==========
def log(msg, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}", flush=True)

# ========== 配置管理 ==========
class Config:
    def __init__(self, args):
        self.args = args
        self.config_file = os.environ.get('EDGEAGENT_CONFIG', 'config.json')
        self._config = self._load_config()
    
    def _load_config(self):
        # 默认配置
        config = {
            'edgehub_url': getattr(self.args, 'url', 'http://1.13.247.173:80/api/v1'),
            'ws_url': getattr(self.args, 'ws_url', 'ws://1.13.247.173:80/ws'),
            'api_key': getattr(self.args, 'api_key', 'edgehub_secret_key'),
            'device_id': getattr(self.args, 'device_id', None),
            'device_name': getattr(self.args, 'device_name', socket.gethostname()),
            'device_type': 'linux',
            'heartbeat_interval': 30,
            'file_storage_dir': '/tmp/edgehub_recv'
        }
        
        # 从配置文件加载
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    loaded = json.load(f)
                    config.update(loaded)
            except Exception as e:
                log(f"配置文件加载失败: {e}", "WARN")
        
        return config
    
    def g(self, *keys, default=None):
        """获取嵌套配置值"""
        value = self._config
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        return value
    
    def s(self, key, value):
        """设置配置值"""
        keys = key.split('.')
        config = self._config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value
    
    def save(self):
        """保存配置"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self._config, f, indent=2)
            return True
        except Exception as e:
            log(f"配置保存失败: {e}", "ERROR")
            return False


# ========== 系统信息收集 ==========
class SysInfo:
    @staticmethod
    def collect():
        """收集系统信息"""
        try:
            cpu_info = SysInfo.get_cpu_info()
            mem_info = SysInfo.get_memory()
            uptime = SysInfo.get_uptime()
            load = SysInfo.get_load_avg()
            
            return {
                'platform': platform.system(),
                'platform_release': platform.release(),
                'architecture': platform.machine(),
                'hostname': socket.gethostname(),
                'cpu': cpu_info,
                'memory': mem_info,
                'uptime': uptime,
                'load': load
            }
        except Exception as e:
            log(f"系统信息收集失败: {e}", "ERROR")
            return {}
    
    @staticmethod
    def get_cpu_info():
        """获取CPU信息"""
        try:
            with open('/proc/cpuinfo', 'r') as f:
                content = f.read()
            
            # 提取CPU型号
            model_name = ''
            cores = 0
            for line in content.split('\n'):
                if line.startswith('model name'):
                    model_name = line.split(':')[1].strip()
                    cores += 1
                elif line.startswith('processor'):
                    cores += 1
            
            if not model_name:
                # ARM平台
                if 'Hardware' in content:
                    for line in content.split('\n'):
                        if 'Hardware' in line:
                            model_name = line.split(':')[1].strip()
            
            usage = SysInfo.get_cpu_usage()
            
            return {
                'model': model_name or 'Unknown',
                'cores': cores or 1,
                'usage': usage
            }
        except Exception as e:
            return {'model': 'Unknown', 'cores': 1, 'usage': 0}
    
    @staticmethod
    def get_cpu_usage():
        """获取CPU使用率"""
        try:
            # 读取 /proc/stat
            with open('/proc/stat', 'r') as f:
                line = f.readline()
            
            fields = line.split()[1:]
            idle1 = int(fields[3])
            total1 = sum(int(x) for x in fields)
            
            time.sleep(0.1)
            
            with open('/proc/stat', 'r') as f:
                line = f.readline()
            
            fields = line.split()[1:]
            idle2 = int(fields[3])
            total2 = sum(int(x) for x in fields)
            
            idle_delta = idle2 - idle1
            total_delta = total2 - total1
            
            if total_delta == 0:
                return 0
            
            usage = 100 * (1 - idle_delta / total_delta)
            return round(usage, 1)
        except:
            return 0
    
    @staticmethod
    def get_memory():
        """获取内存信息"""
        try:
            with open('/proc/meminfo', 'r') as f:
                lines = f.readlines()
            
            mem_total = mem_available = 0
            for line in lines:
                if line.startswith('MemTotal:'):
                    mem_total = int(line.split()[1]) // 1024  # MB
                elif line.startswith('MemAvailable:'):
                    mem_available = int(line.split()[1]) // 1024  # MB
            
            mem_used = mem_total - mem_available
            percent = (mem_used / mem_total * 100) if mem_total > 0 else 0
            
            return {
                'total': mem_total,
                'used': mem_used,
                'available': mem_available,
                'percent': round(percent, 1)
            }
        except:
            return {'total': 0, 'used': 0, 'available': 0, 'percent': 0}
    
    @staticmethod
    def get_uptime():
        """获取运行时间"""
        try:
            with open('/proc/uptime', 'r') as f:
                uptime_seconds = float(f.readline().split()[0])
            return int(uptime_seconds)
        except:
            return 0
    
    @staticmethod
    def get_load_avg():
        """获取负载平均值"""
        try:
            load1, load5, load15 = os.getloadavg()
            return {
                '1min': round(load1, 2),
                '5min': round(load5, 2),
                '15min': round(load15, 2)
            }
        except:
            return {'1min': 0, '5min': 0, '15min': 0}


# ========== 命令执行器 ==========
class CommandExecutor:
    def __init__(self):
        self.encoding = 'utf-8'
        self.errors = 'replace'
    
    def execute(self, command, timeout=30000):
        """执行命令"""
        result = {
            'success': True,
            'stdout': '',
            'stderr': '',
            'exit_code': 0,
            'duration_ms': 0
        }
        
        start_time = time.time()
        
        try:
            # 判断是否是交互式命令
            if self._is_interactive(command):
                result['success'] = False
                result['stderr'] = 'Interactive commands are not allowed'
                result['exit_code'] = -1
                return result
            
            # 执行命令
            proc = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding=self.encoding,
                errors=self.errors
            )
            
            try:
                stdout, stderr = proc.communicate(timeout=timeout/1000)
                elapsed = (time.time() - start_time) * 1000
                
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
                result['stderr'] = f"Command timeout ({timeout/1000}s)"
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
    
    def _is_interactive(self, command):
        """检查是否是交互式命令"""
        interactive_commands = [
            'vim', 'nano', 'emacs', 'htop', 'top',
            'less', 'more', 'man', 'ssh', 'scp',
            'ftp', 'telnet', 'bash', 'sh'
        ]
        cmd_base = command.strip().split()[0] if command.strip() else ''
        return cmd_base in interactive_commands


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
    
    def get(self, path):
        return self._do('GET', path)


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
        """建立WebSocket连接"""
        try:
            ws_url = f"{self.url}?device_id={self.device_id}&api_key={self.api_key}&type=device"
            self.ws = websocket.WebSocketApp(
                ws_url,
                on_message=self._on_message,
                on_open=self._on_open,
                on_error=self._on_error,
                on_close=self._on_close
            )
            
            self.running = True
            self.ws.run_forever(ping_interval=30, ping_timeout=10)
            
            return True
        except Exception as e:
            log(f"WebSocket连接失败: {e}", "ERROR")
            return False
    
    def _on_message(self, ws, message):
        try:
            data = json.loads(message)
            if self.on_message:
                self.on_message(data)
        except Exception as e:
            log(f"消息解析失败: {e}", "ERROR")
    
    def _on_open(self, ws):
        log("[WS] 连接已建立")
        if self.on_connect:
            self.on_connect()
    
    def _on_error(self, ws, error):
        log(f"[WS] 错误: {error}", "ERROR")
    
    def _on_close(self, ws, close_status_code, close_msg):
        log(f"[WS] 连接关闭: {close_status_code} {close_msg}")
        self.running = False
    
    def send(self, data):
        """发送消息"""
        if self.ws and self.running:
            try:
                if isinstance(data, dict):
                    data = json.dumps(data)
                self.ws.send(data)
            except Exception as e:
                log(f"WebSocket发送失败: {e}", "ERROR")
    
    def close(self):
        """关闭连接"""
        self.running = False
        if self.ws:
            self.ws.close()


# ========== 文件传输 ==========
class FileReceiver:
    """文件接收器 - 接收分块数据并组装"""
    
    def __init__(self, storage_dir='/tmp/edgehub_recv'):
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
                raise ValueError(f"Chunk {chunk_index} hash mismatch")
            
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
        temp_final = final_path + '.tmp'
        
        try:
            with open(temp_final, 'wb') as out:
                for i in range(self.total_chunks):
                    chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{i}.chunk")
                    with open(chunk_path, 'rb') as inp:
                        out.write(inp.read())
                    os.remove(chunk_path)
            
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
    
    def calculate_hash(self, file_path):
        """计算SHA256"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
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


# ========== 设备注册 ==========
class Device:
    def __init__(self, cfg, http):
        self.cfg = cfg
        self.http = http
        self.device_id = cfg.g('device_id')
    
    def register(self):
        """注册设备"""
        hostname = socket.gethostname()
        try:
            os_version = f"{platform.system()} {platform.release()}"
            architecture = platform.machine()
        except:
            os_version = "Unknown"
            architecture = "aarch64"
        
        payload = {
            'device_id': self.device_id,
            'device_name': self.cfg.g('device_name', hostname),
            'device_type': self.cfg.g('device_type', 'linux'),
            'os_version': os_version,
            'architecture': architecture,
            'metadata': {'agent_version': VERSION, 'sysinfo': SysInfo.collect()}
        }
        
        log(f"[REG] Registering device: {payload['device_name']}")
        r = self.http.post('/devices/register', payload)
        
        if r and r.get('success'):
            data = r.get('data', {})
            self.device_id = data.get('device_id', self.device_id)
            self.cfg.s('device_id', self.device_id)
            self.cfg.save()
            log(f"[REG] Device registered: {self.device_id}")
            return True
        
        log("[REG] Registration failed", "ERROR")
        return False


# ========== EdgeAgent主程序 ==========
class EdgeAgent:
    def __init__(self, args):
        self.cfg = Config(args)
        self.http = HTTPClient(
            self.cfg.g('edgehub_url'),
            self.cfg.g('api_key')
        )
        self.device = Device(self.cfg, self.http)
        self.ws = None
        self.running = True
        self.executor = CommandExecutor()
        self.file_receiver = FileReceiver(self.cfg.g('file_storage_dir', '/tmp/edgehub_recv'))
    
    def start(self):
        """启动Agent"""
        log(f"=" * 50)
        log(f"EdgeHub EdgeAgent v{VERSION} 启动")
        log(f"=" * 50)
        log(f"设备ID: {self.device.device_id or '自动分配'}")
        log(f"设备名称: {self.cfg.g('device_name')}")
        log(f"API地址: {self.cfg.g('edgehub_url')}")
        log(f"WS地址: {self.cfg.g('ws_url')}")
        
        # 注册设备
        if not self.device.register():
            log("注册失败，退出", "ERROR")
            return False
        
        # 启动WebSocket
        self.start_websocket()
        return True
    
    def start_websocket(self):
        """启动WebSocket连接"""
        ws_url = self.cfg.g('ws_url')
        device_id = self.device.device_id
        api_key = self.cfg.g('api_key')
        
        self.ws = WSClient(ws_url, device_id, api_key)
        
        def on_message(data):
            self.handle_message(data)
        
        def on_connect():
            log("[WS] 连接已建立，等待命令...")
        
        self.ws.on_message = on_message
        self.ws.on_connect = on_connect
        
        heartbeat_interval = self.cfg.g('heartbeat_interval', 30)
        last_heartbeat = 0
        
        while self.running:
            if self.ws.connect():
                while self.running and self.ws.running:
                    time.sleep(1)
                    last_heartbeat += 1
                    if last_heartbeat >= heartbeat_interval:
                        self.send_heartbeat()
                        last_heartbeat = 0
            else:
                log(f"[WS] {self.ws.reconnect_delay}秒后重连...", "WARN")
                time.sleep(self.ws.reconnect_delay)
    
    def send_heartbeat(self):
        """发送心跳"""
        try:
            payload = {
                'timestamp': datetime.now().isoformat(),
                'status': 'online',
                'sysinfo': SysInfo.collect()
            }
            r = self.http.post(f'/devices/{self.device.device_id}/heartbeat', payload)
            if r and r.get('success'):
                log(f"[HB] Heartbeat OK")
        except Exception as e:
            log(f"[HB] Heartbeat failed: {e}", "WARN")
    
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
        """处理命令"""
        command_id = cmd.get('command_id')
        command = cmd.get('command', '')
        timeout = cmd.get('timeout_ms', 30000)
        
        log(f"[CMD] {command_id}: {command[:80]}...")
        
        # 检测Pull模式命令
        if command.startswith('__FILE_PULL__:'):
            # 格式: __FILE_PULL__:transfer_id:remote_path
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
        
        # 异步执行
        thread = threading.Thread(
            target=self._execute_async,
            args=(command_id, command, timeout)
        )
        thread.start()
    
    def _execute_async(self, command_id, command, timeout):
        """异步执行命令"""
        result = self.executor.execute(command, timeout)
        
        log(f"[CMD] Done: exit={result['exit_code']}, dur={result['duration_ms']}ms")
        
        try:
            self.ws.send(json.dumps({
                'type': 'command_result',
                'command_id': command_id,
                'success': result['success'],
                'stdout': result['stdout'],
                'stderr': result['stderr'],
                'exit_code': result['exit_code'],
                'duration_ms': result['duration_ms']
            }))
        except Exception as e:
            log(f"[WS] Send result failed: {e}", "ERROR")
    
    def _handle_pull_async(self, command_id, transfer_id, remote_path):
        """异步处理Pull请求: 读取本地文件并分块发送"""
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
                        'data': base64.b64encode(chunk_data).decode(),
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
        
        log(f"[FT] Start: {transfer_id} -> {remote_path}")
        
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
        """停止Agent"""
        self.running = False
        if self.ws:
            self.ws.close()
        log("Agent已停止")


# ========== 入口 ==========
def parse_args():
    parser = argparse.ArgumentParser(description='EdgeHub EdgeAgent v4.1')
    parser.add_argument('--url', default='http://1.13.247.173:80/api/v1', help='EdgeHub API地址')
    parser.add_argument('--ws-url', default='ws://1.13.247.173:80/ws', help='EdgeHub WebSocket地址')
    parser.add_argument('--api-key', default='edgehub_secret_key', help='API密钥')
    parser.add_argument('--device-id', default=None, help='设备ID')
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
