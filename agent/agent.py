#!/usr/bin/env python3
"""
EdgeHub EdgeAgent - 边缘设备客户端
用于在RK3588等设备上运行，建立与EdgeHub控制节点的连接
"""

import os
import sys
import signal
import subprocess
import time
import json
import socket
import platform

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from services.register import RegisterService
from services.heartbeat import HeartbeatService
from utils.logger import logger


class EdgeAgent:
    """EdgeAgent主程序"""
    
    def __init__(self, config_file='config.json'):
        self.config = Config(config_file)
        self.register_service = RegisterService(self.config)
        self.heartbeat_service = HeartbeatService(self.config)
        self.running = True
        self.frp_process = None
        
        # 注册信号处理
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
    
    def signal_handler(self, signum, frame):
        """处理退出信号"""
        logger.info(f"收到信号 {signum}，正在关闭...")
        self.running = False
    
    def get_device_info(self):
        """获取设备信息"""
        hostname = socket.gethostname()
        
        try:
            os_version = f"{platform.system()} {platform.release()}"
            architecture = platform.machine()
        except:
            os_version = "Unknown"
            architecture = "aarch64"
        
        return {
            'device_id': self.config.get('device_id'),
            'device_name': self.config.get('device_name', hostname),
            'device_type': 'RK3588',
            'os_version': os_version,
            'architecture': architecture,
            'frp_local_port': self.config.get('frp.local_port', 22)
        }
    
    def start_frp(self):
        """启动frp客户端"""
        logger.info("正在启动frp客户端...")
        
        # 生成frpc.ini配置
        frp_config = self.config.generate_frpc_ini()
        
        # frpc路径 - 尝试多个可能的位置
        frpc_paths = [
            os.path.join(os.path.dirname(__file__), 'frpc'),
            '/usr/local/bin/frpc',
            '/opt/edgeagent/frpc',
            '/usr/bin/frpc'
        ]
        
        frpc_path = None
        for path in frpc_paths:
            if os.path.exists(path):
                frpc_path = path
                break
        
        if not frpc_path:
            logger.warning("frpc未找到，尝试从系统PATH中查找...")
            import shutil
            frpc_path = shutil.which('frpc')
        
        if not frpc_path:
            logger.error("无法找到frpc程序，请手动安装frp客户端")
            logger.info("下载地址: https://github.com/fatedier/frp/releases")
            return False
        
        # 写入配置文件
        frpc_ini_path = os.path.join(os.path.dirname(__file__), 'frpc.ini')
        with open(frpc_ini_path, 'w') as f:
            f.write(frp_config)
        
        logger.info(f"frp配置已写入: {frpc_ini_path}")
        
        # 启动frp
        try:
            self.frp_process = subprocess.Popen(
                [frpc_path, '-c', frpc_ini_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            logger.info(f"frp客户端已启动 (PID: {self.frp_process.pid})")
            return True
        except Exception as e:
            logger.error(f"启动frp失败: {e}")
            return False
    
    def stop_frp(self):
        """停止frp客户端"""
        if self.frp_process:
            logger.info("正在停止frp客户端...")
            self.frp_process.terminate()
            try:
                self.frp_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.frp_process.kill()
            logger.info("frp客户端已停止")
    
    def start(self):
        """启动EdgeAgent"""
        logger.info("=" * 50)
        logger.info("EdgeAgent 启动中...")
        logger.info("=" * 50)
        
        # 1. 获取设备信息
        device_info = self.get_device_info()
        logger.info(f"设备信息: {device_info}")
        
        # 2. 注册设备
        try:
            result = self.register_service.register(device_info)
            logger.info(f"设备注册成功: {result}")
            
            # 如果返回了分配的端口，更新配置
            if 'frp_remote_port' in result:
                self.config.set('frp.remote_port', result['frp_remote_port'])
                self.config.save()
                
        except Exception as e:
            logger.error(f"设备注册失败: {e}")
            logger.info("将继续启动，但可能无法正常连接...")
        
        # 3. 启动frp客户端
        self.start_frp()
        
        # 4. 主循环 - 心跳
        logger.info("进入心跳循环...")
        consecutive_failures = 0
        max_failures = 3
        
        while self.running:
            try:
                success = self.heartbeat_service.send_heartbeat()
                
                if success:
                    consecutive_failures = 0
                    logger.debug("心跳发送成功")
                else:
                    consecutive_failures += 1
                    logger.warning(f"心跳发送失败 ({consecutive_failures}/{max_failures})")
                
                # 每30秒发送一次心跳
                for _ in range(30):
                    if not self.running:
                        break
                    time.sleep(1)
                
            except KeyboardInterrupt:
                logger.info("收到键盘中断...")
                self.running = False
            except Exception as e:
                logger.error(f"心跳循环异常: {e}")
                consecutive_failures += 1
                
                if consecutive_failures >= max_failures:
                    logger.error(f"连续{max_failures}次心跳失败，将重新尝试注册...")
                    try:
                        self.register_service.register(device_info)
                        consecutive_failures = 0
                    except Exception as ex:
                        logger.error(f"重新注册失败: {ex}")
                
                time.sleep(5)
        
        # 5. 清理
        self.stop_frp()
        logger.info("EdgeAgent已关闭")


def main():
    """主入口"""
    config_file = os.environ.get('EDGEAGENT_CONFIG', 'config.json')
    
    # 如果指定参数，使用参数中的配置文件
    if len(sys.argv) > 1:
        config_file = sys.argv[1]
    
    agent = EdgeAgent(config_file)
    agent.start()


if __name__ == '__main__':
    main()