#!/usr/bin/env python3
"""
心跳服务
"""

import time
import psutil
from utils.logger import logger


class HeartbeatService:
    """心跳服务"""
    
    def __init__(self, config):
        self.config = config
        self.edgehub_url = config.get('edgehub_url')
        self.device_id = config.get('device_id')
        self.interval = config.get('heartbeat_interval', 30)
        self.start_time = time.time()
    
    def get_heartbeat_data(self):
        """
        获取心跳数据
        
        Returns:
            dict: 包含设备状态信息的心跳数据
        """
        try:
            # CPU使用率
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # 内存使用率
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            
            # 磁盘使用率
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent
            
            # 网络IO
            net_io = psutil.net_io_counters()
            
            # 运行时长
            uptime = int(time.time() - self.start_time)
            
            return {
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'uptime': uptime,
                'cpu_percent': round(cpu_percent, 1),
                'memory_percent': round(memory_percent, 1),
                'disk_percent': round(disk_percent, 1),
                'network_in': net_io.bytes_recv,
                'network_out': net_io.bytes_sent,
                'tunnel_status': 'connected'
            }
            
        except Exception as e:
            logger.error(f"获取心跳数据失败: {e}")
            return {
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'uptime': int(time.time() - self.start_time),
                'cpu_percent': 0,
                'memory_percent': 0,
                'disk_percent': 0,
                'network_in': 0,
                'network_out': 0,
                'tunnel_status': 'error'
            }
    
    def send_heartbeat(self):
        """
        发送心跳到EdgeHub
        
        Returns:
            bool: 是否发送成功
        """
        heartbeat_data = self.get_heartbeat_data()
        url = f"{self.edgehub_url}/api/v1/devices/{self.device_id}/heartbeat"
        
        try:
            response = requests.post(
                url,
                json=heartbeat_data,
                timeout=5,
                headers={'Content-Type': 'application/json'}
            )
            
            response.raise_for_status()
            
            result = response.json()
            
            if result.get('success'):
                logger.debug(f"心跳发送成功: CPU {heartbeat_data['cpu_percent']}% | 内存 {heartbeat_data['memory_percent']}%")
                return True
            else:
                logger.warning(f"心跳发送失败: {result.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"心跳发送异常: {e}")
            return False


# 需要requests模块
import requests