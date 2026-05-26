#!/usr/bin/env python3
"""EdgeHub Agent v2.10 - Windows/Anaconda版本"""
import os,sys,time,json,socket,platform,signal,subprocess,hashlib,urllib.request,re
from datetime import datetime

VERSION="2.10.0"
AGENT_DIR="C:\\EdgeAgent"
CONFIG_FILE=os.path.join(AGENT_DIR, "config.json")
LOG_FILE=os.path.join(AGENT_DIR, "logs", "edgeagent.log")

def log(msg):
    os.makedirs(os.path.join(AGENT_DIR, "logs"), exist_ok=True)
    ts=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line=f"{ts} [INFO] {msg}\n"
    with open(LOG_FILE,'a',encoding='utf-8') as f:f.write(line)
    print(line.rstrip())

class SysInfo:
    """系统信息采集"""
    @staticmethod
    def get_cpu_info():
        try:
            result = subprocess.run(['wmic', 'cpu', 'get', 'name'], capture_output=True, text=True, timeout=5)
            lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip()]
            if len(lines) > 1:
                return lines[1]
        except:
            pass
        return platform.processor() or 'Unknown'
    
    @staticmethod
    def get_cpu_count():
        return os.cpu_count() or 1
    
    @staticmethod
    def get_memory():
        try:
            result = subprocess.run(['wmic', 'OS', 'get', 'TotalVisibleMemorySize,FreePhysicalMemory', '/format:list'], capture_output=True, text=True, timeout=5)
            lines = result.stdout.strip().split('\n')
            mem = {}
            for line in lines:
                if '=' in line:
                    key,val = line.split('=',1)
                    if 'Total' in key:
                        mem['total'] = int(val.strip()) // 1024
                    elif 'Free' in key:
                        mem['free'] = int(val.strip()) // 1024
            if 'total' in mem and 'free' in mem:
                mem['used'] = mem['total'] - mem['free']
                mem['percent'] = round((mem['used'] / mem['total']) * 100, 1)
                return mem
        except:
            pass
        return None
    
    @staticmethod
    def get_disk():
        try:
            result = subprocess.run(['wmic', 'logicaldisk', 'where', 'DeviceID="C:"', 'get', 'Size,FreeSpace', '/format:list'], capture_output=True, text=True, timeout=5)
            for line in result.stdout.strip().split('\n'):
                if '=' in line:
                    key,val = line.split('=',1)
                    total = free = None
                    if 'Size' in key and val.strip():
                        total = int(val.strip()) // (1024*1024*1024)
                    if 'FreeSpace' in key and val.strip():
                        free = int(val.strip()) // (1024*1024*1024)
            if total and free:
                used = total - free
                return {'total': total, 'used': used, 'free': free, 'percent': round((used/total)*100)}
        except:
            pass
        return None
    
    @staticmethod
    def get_uptime():
        try:
            result = subprocess.run(['wmic', 'os', 'get', 'LastBootUpTime'], capture_output=True, text=True, timeout=5)
            lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip() and 'LastBootUpTime' not in l]
            if lines:
                return lines[0][:19]
        except:
            pass
        return "Unknown"
    
    @staticmethod
    def collect():
        return {
            'cpu': {'model': SysInfo.get_cpu_info(), 'cores': SysInfo.get_cpu_count()},
            'memory': SysInfo.get_memory(),
            'disk': SysInfo.get_disk(),
            'uptime': SysInfo.get_uptime()
        }

class Cfg:
    def __init__(self):
        self._ = self._load_config()
        if not self._.get('device_id'):
            hostname = socket.gethostname()
            self._['device_id'] = hashlib.md5(hostname.encode()).hexdigest()[:16]
            self._save_config()
        self._['os_version'] = f"{platform.system()} {platform.release()}"
        self._['architecture'] = platform.machine()
    
    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            'edgehub_url': 'http://1.13.247.173:80/edgehub-api/v1',
            'device_id': '',
            'device_name': socket.gethostname(),
            'device_type': 'windows',
            'api_key': 'edgehub_secret_key',
            'heartbeat_interval': 30
        }
    
    def _save_config(self):
        try:
            os.makedirs(AGENT_DIR, exist_ok=True)
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self._, f, indent=2)
        except Exception as e:
            log(f"Config save failed: {e}")
    
    def g(self,*k,default=None):
        v=self._
        for k in k:
            if isinstance(v,dict) and k in v:v=v[k]
            else:return default
        return v

class HC:
    def __init__(self,url,key,timeout=30):
        self.base_url=url.rstrip('/')
        self.api_key=key
        self.timeout=timeout
    
    def _do(self,m,path,data=None):
        url=f"{self.base_url}{path}"
        req=urllib.request.Request(url,data=json.dumps(data).encode() if data else None,method=m)
        req.add_header('X-API-Key',self.api_key)
        req.add_header('Content-Type','application/json')
        req.add_header('User-Agent',f'EdgeAgent/{VERSION}')
        try:
            with urllib.request.urlopen(req,timeout=self.timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            log(f"{m} {path}: {e}")
            return None
    
    def post(self,path,data=None):
        return self._do('POST',path,data)
    
    def get(self,path):
        return self._do('GET',path)

class DS:
    def __init__(self,cfg,http):
        self.cfg=cfg
        self.http=http
        self.device_id=cfg.g('device_id')
        self.status='offline'
        self.heartbeat_count=0
    
    def register(self):
        sysinfo = SysInfo.collect()
        r=self.http.post('/devices/register',{
            'device_id': self.device_id,
            'device_name': self.cfg.g('device_name'),
            'device_type': self.cfg.g('device_type'),
            'os_version': self.cfg.g('os_version'),
            'architecture': self.cfg.g('architecture'),
            'metadata': {'agent_version': VERSION, 'sysinfo': sysinfo}
        })
        if r and r.get('success'):
            self.status='online'
            log(f"注册成功 (device_id={self.device_id})")
            return True
        log(f"注册失败: {r}")
        return False
    
    def heartbeat(self):
        self.heartbeat_count += 1
        payload = {
            'timestamp': datetime.now().isoformat(),
            'status': self.status
        }
        r=self.http.post(f'/devices/{self.device_id}/heartbeat', payload)
        if not r:
            log("心跳失败")
        return r is not None

class EA:
    def __init__(self):
        self.cfg=Cfg()
        self.http=HC(self.cfg.g('edgehub_url'),self.cfg.g('api_key'))
        self.device=DS(self.cfg,self.http)
        self.running=False
        self.interval = self.cfg.g('heartbeat_interval', 30)
    
    def start(self):
        self.running=True
        log(f"EdgeHub Agent v{VERSION} 启动...")
        log(f"设备ID: {self.device.device_id}")
        log(f"API地址: {self.cfg.g('edgehub_url')}")
        log(f"心跳间隔: {self.interval}秒")
        
        if not self.device.register():
            log("注册失败")
            return
        
        log("运行中...")
        while self.running:
            self.device.heartbeat()
            if self.device.heartbeat_count % 10 == 0:
                log(f"心跳 #{self.device.heartbeat_count}")
            time.sleep(self.interval)
    
    def stop(self):
        self.running=False
        log("已停止")

if __name__=='__main__':
    agent=EA()
    try:
        agent.start()
    except KeyboardInterrupt:
        agent.stop()
