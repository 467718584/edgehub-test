#!/usr/bin/env python3
"""
EdgeAgent File Transfer Module v2.0
支持分块传输、断点续传、进度追踪
"""

import os
import sys
import json
import time
import hashlib
import threading
import.makedirs
from datetime import datetime

# ========== 文件传输服务 ==========

class FileReceiver:
    """文件接收器 - 接收分块数据并组装"""
    
    def __init__(self, storage_dir='/tmp/edgehub_recv'):
        self.storage_dir = storage_dir
        self.temp_dir = os.path.join(storage_dir, '.tmp')
        self.transfers = {}  # transfer_id -> TransferState
        
        # 确保目录存在
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.storage_dir, exist_ok=True)
    
    def start_transfer(self, transfer_id, file_name, file_size, total_chunks, remote_path):
        """开始新的传输任务"""
        transfer = TransferState(
            transfer_id=transfer_id,
            file_name=file_name,
            file_size=file_size,
            total_chunks=total_chunks,
            remote_path=remote_path,
            temp_dir=self.temp_dir
        )
        self.transfers[transfer_id] = transfer
        return transfer
    
    def receive_chunk(self, transfer_id, chunk_index, data, hash_value):
        """接收单个分块"""
        if transfer_id not in self.transfers:
            raise ValueError(f"Transfer {transfer_id} not found")
        
        transfer = self.transfers[transfer_id]
        return transfer.write_chunk(chunk_index, data, hash_value)
    
    def assemble_transfer(self, transfer_id):
        """组装传输任务"""
        if transfer_id not in self.transfers:
            raise ValueError(f"Transfer {transfer_id} not found")
        
        transfer = self.transfers[transfer_id]
        result = transfer.assemble()
        
        # 清理传输状态
        if transfer_id in self.transfers:
            del self.transfers[transfer_id]
        
        return result
    
    def cancel_transfer(self, transfer_id):
        """取消传输"""
        if transfer_id not in self.transfers:
            return
        
        transfer = self.transfers[transfer_id]
        transfer.cleanup()
        del self.transfers[transfer_id]
    
    def get_progress(self, transfer_id):
        """获取传输进度"""
        if transfer_id not in self.transfers:
            return None
        
        return self.transfers[transfer_id].get_progress()


class TransferState:
    """传输状态管理"""
    
    def __init__(self, transfer_id, file_name, file_size, total_chunks, remote_path, temp_dir):
        self.transfer_id = transfer_id
        self.file_name = file_name
        self.file_size = file_size
        self.total_chunks = total_chunks
        self.remote_path = remote_path
        self.temp_dir = temp_dir
        
        self.received_chunks = {}  # chunk_index -> hash
        self.lock = threading.Lock()
        self.start_time = time.time()
    
    def write_chunk(self, chunk_index, data, hash_value):
        """写入分块数据"""
        with self.lock:
            # 验证chunk_index
            if chunk_index < 0 or chunk_index >= self.total_chunks:
                raise ValueError(f"Invalid chunk index: {chunk_index}")
            
            # 解码base64数据
            if isinstance(data, str):
                chunk_data = base64.b64decode(data)
            else:
                chunk_data = data
            
            # 验证哈希
            actual_hash = hashlib.md5(chunk_data).hexdigest()
            if actual_hash != hash_value:
                raise ValueError(f"Chunk {chunk_index} hash mismatch: expected {hash_value}, got {actual_hash}")
            
            # 写入临时文件
            chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{chunk_index}.chunk")
            with open(chunk_path, 'wb') as f:
                f.write(chunk_data)
            
            self.received_chunks[chunk_index] = hash_value
            
            # 计算进度
            progress = len(self.received_chunks) / self.total_chunks
            speed = len(self.received_chunks) * chunk_data.__len__() / (time.time() - self.start_time)
            
            return {
                'chunk_index': chunk_index,
                'received': len(self.received_chunks),
                'total': self.total_chunks,
                'progress': round(progress * 100, 2),
                'speed': round(speed, 0)
            }
    
    def assemble(self):
        """组装文件"""
        # 检查是否所有块都已接收
        if len(self.received_chunks) != self.total_chunks:
            missing = set(range(self.total_chunks)) - set(self.received_chunks.keys())
            raise ValueError(f"Missing chunks: {missing}")
        
        # 确定最终路径
        final_path = self.remote_path
        
        # 创建临时文件
        temp_final = final_path + '.tmp assembling'
        
        try:
            # 按顺序合并所有块
            with open(temp_final, 'wb') as out:
                for i in range(self.total_chunks):
                    chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{i}.chunk")
                    if not os.path.exists(chunk_path):
                        raise ValueError(f"Chunk file not found: {chunk_path}")
                    
                    with open(chunk_path, 'rb') as inp:
                        out.write(inp.read())
                    
                    # 删除已组装的块
                    os.remove(chunk_path)
            
            # 原子重命名
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(temp_final, final_path)
            
            # 计算文件哈希
            file_hash = self.calculate_file_hash(final_path)
            
            return {
                'success': True,
                'file_path': final_path,
                'file_size': os.path.getsize(final_path),
                'file_hash': file_hash,
                'duration_ms': int((time.time() - self.start_time) * 1000)
            }
            
        except Exception as e:
            # 清理临时文件
            if os.path.exists(temp_final):
                os.remove(temp_final)
            raise e
    
    def calculate_file_hash(self, file_path):
        """计算文件SHA256哈希"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def get_progress(self):
        """获取传输进度"""
        received = len(self.received_chunks)
        progress = (received / self.total_chunks * 100) if self.total_chunks > 0 else 0
        elapsed = time.time() - self.start_time
        avg_speed = (received * (self.file_size / self.total_chunks)) / elapsed if elapsed > 0 else 0
        
        return {
            'transfer_id': self.transfer_id,
            'received_chunks': received,
            'total_chunks': self.total_chunks,
            'progress': round(progress, 2),
            'speed_bps': round(avg_speed, 0),
            'elapsed_ms': int(elapsed * 1000)
        }
    
    def cleanup(self):
        """清理临时文件"""
        for i in range(self.total_chunks):
            chunk_path = os.path.join(self.temp_dir, f"{self.transfer_id}.{i}.chunk")
            if os.path.exists(chunk_path):
                os.remove(chunk_path)


class FileSender:
    """文件发送器 - 从设备拉取文件并分块发送"""
    
    def __init__(self, http_client):
        self.http = http_client
        self.chunk_size = 2 * 1024 * 1024  # 2MB default
    
    def pull_file(self, transfer_id, remote_path, local_path=None):
        """从远程设备拉取文件"""
        # 如果没有指定本地路径，生成一个
        if not local_path:
            import uuid
            filename = os.path.basename(remote_path)
            local_path = os.path.join('/tmp', f"{transfer_id}_{filename}")
        
        # 检查文件是否存在
        if not os.path.exists(remote_path):
            raise FileNotFoundError(f"Remote file not found: {remote_path}")
        
        file_size = os.path.getsize(remote_path)
        total_chunks = (file_size + self.chunk_size - 1) // self.chunk_size
        
        # 计算文件哈希
        file_hash = self.calculate_file_hash(remote_path)
        
        # 分块读取并发送
        for i in range(total_chunks):
            with open(remote_path, 'rb') as f:
                f.seek(i * self.chunk_size)
                chunk_data = f.read(self.chunk_size)
            
            chunk_hash = hashlib.md5(chunk_data).digest()
            
            # 通过HTTP发送分块
            result = self.http.post(f'/transfers/{transfer_id}/chunks', {
                'chunk_index': i,
                'data': chunk_data,
                'hash': chunk_hash,
                'is_last': i == total_chunks - 1
            })
            
            if not result or not result.get('success'):
                raise Exception(f"Failed to send chunk {i}")
        
        return {
            'success': True,
            'file_size': file_size,
            'file_hash': file_hash,
            'total_chunks': total_chunks
        }
    
    def calculate_file_hash(self, file_path):
        """计算文件SHA256哈希"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha256.update(chunk)
        return sha256.hexdigest()


# ========== 消息处理 ==========

def handle_transfer_message(agent, msg):
    """处理文件传输相关消息"""
    msg_type = msg.get('type')
    data = msg.get('data', msg)
    
    if msg_type == 'transfer_start':
        # 开始传输
        return handle_transfer_start(agent, data)
    elif msg_type == 'transfer_chunk':
        # 分块数据
        return handle_transfer_chunk(agent, data)
    elif msg_type == 'transfer_resume':
        # 断点续传请求
        return handle_transfer_resume(agent, data)
    elif msg_type == 'transfer_cancel':
        # 取消传输
        return handle_transfer_cancel(agent, data)
    else:
        return {'success': False, 'error': f'Unknown transfer type: {msg_type}'}


def handle_transfer_start(agent, data):
    """处理传输开始"""
    transfer_id = data.get('transfer_id')
    file_name = data.get('file_name')
    file_size = data.get('file_size')
    total_chunks = data.get('total_chunks')
    remote_path = data.get('remote_path')
    direction = data.get('direction', 'push')  # push or pull
    
    if not all([transfer_id, file_name, file_size, total_chunks, remote_path]):
        return {'success': False, 'error': 'Missing required fields'}
    
    try:
        if direction == 'push':
            # 接收文件
            agent.file_receiver.start_transfer(transfer_id, file_name, file_size, total_chunks, remote_path)
            
            return {
                'success': True,
                'type': 'transfer_started',
                'transfer_id': transfer_id,
                'direction': 'push'
            }
        else:
            # 拉取文件 - 不在这里处理，由Agent主动拉取
            return {
                'success': True,
                'type': 'transfer_started',
                'transfer_id': transfer_id,
                'direction': 'pull'
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def handle_transfer_chunk(agent, data):
    """处理分块数据"""
    transfer_id = data.get('transfer_id')
    chunk_index = data.get('chunk_index')
    chunk_data = data.get('data')
    hash_value = data.get('hash')
    is_last = data.get('is_last', False)
    
    if not all([transfer_id, chunk_index is not None, chunk_data, hash_value]):
        return {'success': False, 'error': 'Missing required fields'}
    
    try:
        # 接收分块
        result = agent.file_receiver.receive_chunk(transfer_id, chunk_index, chunk_data, hash_value)
        
        # 如果是最后一块，组装文件
        if is_last:
            assemble_result = agent.file_receiver.assemble_transfer(transfer_id)
            return {
                'success': True,
                'type': 'transfer_complete',
                'transfer_id': transfer_id,
                'file_path': assemble_result['file_path'],
                'file_size': assemble_result['file_size'],
                'file_hash': assemble_result['file_hash'],
                'duration_ms': assemble_result['duration_ms']
            }
        
        return {
            'success': True,
            'type': 'chunk_received',
            'transfer_id': transfer_id,
            'chunk_index': chunk_index,
            'progress': result['progress']
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def handle_transfer_resume(agent, data):
    """处理断点续传请求"""
    transfer_id = data.get('transfer_id')
    
    if not transfer_id:
        return {'success': False, 'error': 'Missing transfer_id'}
    
    try:
        # 获取当前进度
        progress = agent.file_receiver.get_progress(transfer_id)
        
        if not progress:
            return {'success': False, 'error': 'Transfer not found'}
        
        # 获取已传输的块列表
        transfer = agent.file_receiver.transfers.get(transfer_id)
        if not transfer:
            return {'success': False, 'error': 'Transfer not found'}
        
        received_chunks = list(transfer.received_chunks.keys())
        
        return {
            'success': True,
            'type': 'transfer_resume_info',
            'transfer_id': transfer_id,
            'received_chunks': received_chunks,
            'missing_chunks': [i for i in range(transfer.total_chunks) if i not in received_chunks],
            'progress': progress
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def handle_transfer_cancel(agent, data):
    """处理取消传输"""
    transfer_id = data.get('transfer_id')
    
    if not transfer_id:
        return {'success': False, 'error': 'Missing transfer_id'}
    
    try:
        agent.file_receiver.cancel_transfer(transfer_id)
        
        return {
            'success': True,
            'type': 'transfer_cancelled',
            'transfer_id': transfer_id
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ========== 集成辅助 ==========

def integrate_file_transfer(agent_class):
    """将文件传输功能集成到EdgeAgent类"""
    
    # 保存原始__init__
    original_init = agent_class.__init__
    
    def new_init(self, *args, **kwargs):
        # 调用原始__init__
        original_init(self, *args, **kwargs)
        # 初始化文件传输
        self.file_receiver = FileReceiver()
        self.file_sender = FileSender(self.http)
    
    # 保存原始handle_message
    original_handle_message = getattr(agent_class, 'handle_message', None)
    
    def new_handle_message(self, data):
        msg_type = data.get('type', '')
        
        # 处理文件传输消息
        if msg_type.startswith('transfer_'):
            result = handle_transfer_message(self, data)
            if result:
                self.ws.send(json.dumps(result))
            return
        
        # 调用原始handle_message
        if original_handle_message:
            original_handle_message(self, data)
    
    # 应用补丁
    agent_class.__init__ = new_init
    agent_class.handle_message = new_handle_message
    
    return agent_class
