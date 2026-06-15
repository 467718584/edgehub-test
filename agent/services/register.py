#!/usr/bin/env python3
"""
设备注册服务
"""

import requests
from utils.logger import logger


class RegisterService:
    """设备注册服务"""
    
    def __init__(self, config):
        self.config = config
        self.edgehub_url = config.get('edgehub_url')
    
    def register(self, device_info):
        """
        向EdgeHub注册设备
        
        Args:
            device_info: 设备信息字典
            
        Returns:
            dict: 注册结果，包含分配的frp_remote_port
        """
        url = f"{self.edgehub_url}/api/v1/devices/register"
        
        try:
            logger.info(f"正在向EdgeHub注册设备: {device_info.get('device_id')}")
            logger.debug(f"注册URL: {url}")
            
            response = requests.post(
                url,
                json=device_info,
                timeout=10,
                headers={'Content-Type': 'application/json'}
            )
            
            response.raise_for_status()
            
            result = response.json()
            
            if result.get('success'):
                data = result.get('data', {})
                logger.info(f"设备注册成功!")
                logger.info(f"  - device_id: {data.get('device_id')}")
                logger.info(f"  - frp_remote_port: {data.get('frp_remote_port')}")
                logger.info(f"  - isNew: {data.get('isNew')}")
                
                return data
            else:
                error = result.get('error', {})
                logger.error(f"设备注册失败: {error.get('message', 'Unknown error')}")
                raise Exception(error.get('message', 'Registration failed'))
                
        except requests.exceptions.Timeout:
            logger.error("注册超时，无法连接到EdgeHub服务器")
            raise Exception("Connection timeout")
            
        except requests.exceptions.ConnectionError as e:
            logger.error(f"无法连接到EdgeHub服务器: {e}")
            raise Exception("Connection error")
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP错误: {e}")
            raise Exception(f"HTTP error: {e}")
            
        except Exception as e:
            logger.error(f"注册过程发生错误: {e}")
            raise