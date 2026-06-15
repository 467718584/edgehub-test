#!/usr/bin/env python3
"""EdgeHub服务器HTTP Agent"""
import requests
import time
import socket

SERVER = "http://localhost:8080"
API_KEY = "edgehub_secret_key"
DEVICE_ID = f"server-{socket.gethostname()}"

def register():
    try:
        resp = requests.post(f"{SERVER}/api/v1/devices/register", 
            headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
            json={
                "device_id": DEVICE_ID,
                "device_name": "EdgeHub-Server",
                "device_type": "linux",
                "os": "Linux",
                "vpn_ip": "10.0.0.1",
                "status": "online",
                "capabilities": ["shell", "file_transfer"]
            }, timeout=10)
        print(f"[{time.strftime('%H:%M:%S')}] 注册: {resp.status_code}")
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] 注册失败: {e}")

if __name__ == "__main__":
    print(f"EdgeHub Server Agent")
    register()
    while True:
        try:
            requests.post(f"{SERVER}/api/v1/devices/{DEVICE_ID}/heartbeat",
                headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
                json={"status": "online", "vpn_ip": "10.0.0.1"},
                timeout=5)
        except:
            pass
        time.sleep(30)
