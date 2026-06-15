#!/usr/bin/env python3
"""
EdgeAgent配置管理
"""

import os
import json


class Config:
    """配置管理类"""
    
    def __init__(self, config_file='config.json'):
        self.config_file = config_file
        self._config = self._load()
    
    def _load(self):
        """加载配置文件"""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载配置文件失败: {e}")
        
        return self._default_config()
    
    def _default_config(self):
        """获取默认配置"""
        return {
            'edgehub_url': os.environ.get('EDGEHUB_URL', 'http://1.13.247.173:8080'),
            'device_id': os.environ.get('DEVICE_ID', 'rk3588-001'),
            'device_name': os.environ.get('DEVICE_NAME', 'RK3588 Device'),
            'ssh': {
                'host': '127.0.0.1',
                'port': 22,
                'username': os.environ.get('SSH_USERNAME', 'ubuntu'),
                'private_key_path': os.path.expanduser(os.environ.get('SSH_KEY', '~/.ssh/id_rsa'))
            },
            'heartbeat_interval': 30,
            'frp': {
                'server_addr': os.environ.get('FRP_SERVER_ADDR', '1.13.247.173'),
                'server_port': int(os.environ.get('FRP_SERVER_PORT', '7000')),
                'token': os.environ.get('FRP_TOKEN', 'edgehub_secret_token'),
                'local_port': 22,
                'remote_port': 10001
            }
        }
    
    def save(self):
        """保存配置到文件"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"保存配置失败: {e}")
            return False
    
    def get(self, key, default=None):
        """获取配置值，支持嵌套key用点号分隔"""
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def set(self, key, value):
        """设置配置值，支持嵌套key用点号分隔"""
        keys = key.split('.')
        config = self._config
        
        for i, k in enumerate(keys[:-1]):
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def generate_frpc_ini(self):
        """生成frpc.ini配置"""
        frp_config = self._config.get('frp', {})
        ssh_config = self._config.get('ssh', {})
        
        return f"""[common]
server_addr = {frp_config.get('server_addr', '1.13.247.173')}
server_port = {frp_config.get('server_port', 7000)}
token = {frp_config.get('token', 'edgehub_secret_token')}
protocol = tcp

[ssh]
type = tcp
local_ip = 127.0.0.1
local_port = {frp_config.get('local_port', 22)}
remote_port = {frp_config.get('remote_port', 10001)}
"""


if __name__ == '__main__':
    config = Config()
    print(json.dumps(config._config, indent=2))