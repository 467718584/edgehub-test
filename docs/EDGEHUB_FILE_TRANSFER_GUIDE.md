# EdgeHub 文件传输使用指南

**版本**: v1.3.3  
**更新日期**: 2026-06-26  
**适用**: 所有 Agent 管理员

---

## 📋 概述

EdgeHub 文件传输协议 v2.0 提供了高效的文件分发能力，**Agent 应使用文件传输代替命令行操作来分发脚本**，效率提升 10 倍以上。

### 传统方式 vs 文件传输

| 方式 | 操作 | 效率 | 适用场景 |
|------|------|------|----------|
| ❌ 命令行 | SSH/终端执行 sed/awk/cat | 低，每次修改一行 | 不推荐 |
| ✅ 文件传输 | Push 文件到设备 | 高，整文件替换 | **推荐** |

---

## 🚀 快速开始

### 1. 文件传输 API

#### Push: Server → 设备 (推送脚本)

```bash
# 推送脚本到设备
curl -X POST "http://1.13.247.173/api/v1/<device_id>/files/push" \
  -H "X-API-Key: edgehub_secret_key" \
  -F "file=@/path/to/script.sh" \
  -F "remote_path=/opt/scripts/script.sh" \
  -F "project_id=8"  # 可选，关联项目
```

#### Pull: 设备 → Server (收集结果)

```bash
# 从设备拉取文件
curl -X GET "http://1.13.247.173/api/v1/<device_id>/files/pull?remote_path=/opt/scripts/output.log&project_id=8"
```

### 2. 项目文件管理 API

```bash
# 获取项目的传输历史
curl "http://1.13.247.173/api/v1/projects/<project_id>/transfers" \
  -H "X-API-Key: edgehub_secret_key"

# 获取项目的传输统计
curl "http://1.13.247.173/api/v1/projects/<project_id>/transfers/stats" \
  -H "X-API-Key: edgehub_secret_key"
```

---

## 📁 典型工作流

### 场景: 批量更新设备上的监控脚本

#### Step 1: 准备脚本文件

```bash
# 本地准备更新脚本
cat > /tmp/monitor.sh << 'EOF'
#!/bin/bash
while true; do
  echo "$(date): System OK" >> /var/log/monitor.log
  sleep 60
done
EOF
```

#### Step 2: 推送到所有设备

```bash
# 批量推送到多设备
for device_id in "82785476b5753520" "2ec0e6a3ed48a837"; do
  curl -X POST "http://1.13.247.173/api/v1/${device_id}/files/push" \
    -H "X-API-Key: edgehub_secret_key" \
    -F "file=@/tmp/monitor.sh" \
    -F "remote_path=/opt/scripts/monitor.sh"
  echo "Pushed to ${device_id}"
done
```

#### Step 3: 下发执行命令

```bash
# 让设备执行新脚本 (不用重启Agent)
curl -X POST "http://1.13.247.173/api/v1/<device_id>/commands" \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "pkill -f monitor.sh; nohup /opt/scripts/monitor.sh > /dev/null 2>&1 &",
    "timeout_ms": 10000
  }'
```

#### Step 4: 收集执行结果

```bash
# 拉取日志文件
curl "http://1.13.247.173/api/v1/<device_id>/files/pull?remote_path=/var/log/monitor.log"
```

---

## 🔧 Agent 自动化示例

### Python Agent 使用文件传输

```python
import requests
import os

EDGEHUB_URL = "http://1.13.247.173"
API_KEY = "edgehub_secret_key"

def push_script(device_id, local_file, remote_path, project_id=None):
    """推送脚本到设备"""
    with open(local_file, 'rb') as f:
        files = {'file': f}
        data = {'remote_path': remote_path}
        if project_id:
            data['project_id'] = project_id
        
        response = requests.post(
            f"{EDGEHUB_URL}/api/v1/{device_id}/files/push",
            files=files,
            data=data,
            headers={'X-API-Key': API_KEY}
        )
    return response.json()

def execute_on_device(device_id, command):
    """在设备上执行命令"""
    response = requests.post(
        f"{EDGEHUB_URL}/api/v1/{device_id}/commands",
        json={'command': command, 'timeout_ms': 30000},
        headers={'X-API-Key': API_KEY}
    )
    return response.json()

def pull_result(device_id, remote_path, local_path):
    """从设备拉取结果"""
    response = requests.get(
        f"{EDGEHUB_URL}/api/v1/{device_id}/files/pull",
        params={'remote_path': remote_path},
        headers={'X-API-Key': API_KEY}
    )
    with open(local_path, 'wb') as f:
        f.write(response.content)
    return True

# 使用示例
script = "/tmp/deploy.sh"
device = "82785476b5753520"

# 1. 推送脚本
result = push_script(device, script, "/opt/deploy.sh", project_id=8)
print(f"推送结果: {result}")

# 2. 执行脚本
cmd_result = execute_on_device(device, "chmod +x /opt/deploy.sh && /opt/deploy.sh")
print(f"执行结果: {cmd_result}")

# 3. 拉取日志
pull_result(device, "/var/log/deploy.log", "/tmp/deploy.log")
```

---

## 📊 文件传输项目关联

所有文件传输可以关联到项目，自动记录到开发日志：

```bash
# 创建带项目关联的传输
curl -X POST "http://1.13.247.173/api/v1/transfers" \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 8,
    "device_id": "82785476b5753520",
    "direction": "push",
    "local_path": "/tmp/update.sh",
    "remote_path": "/opt/update.sh",
    "file_name": "update.sh",
    "priority": 5
  }'
```

### 查看项目的传输历史

```bash
curl "http://1.13.247.173/api/v1/projects/8/transfers" \
  -H "X-API-Key: edgehub_secret_key"
```

---

## ⚙️ 大文件传输

### 多块传输 (>2MB)

EdgeHub 自动分块传输：

```
文件大小: 10 MB
分块大小: 2 MB (默认)
分块数量: 5
```

### 断点续传

如果传输中断，可使用 resume：

```bash
curl "http://1.13.247.173/api/v1/transfers/<transfer_id>/resume" \
  -H "X-API-Key: edgehub_secret_key"
```

---

## 🔍 监控传输状态

### 查看传输队列

```bash
curl "http://1.13.247.173/api/v1/files/queue" \
  -H "X-API-Key: edgehub_secret_key"
```

### 查看单个传输详情

```bash
curl "http://1.13.247.173/api/v1/transfers/<transfer_id>" \
  -H "X-API-Key: edgehub_secret_key"
```

---

## ⚠️ 注意事项

1. **文件路径**: Windows 路径用 `\\`，Linux 用 `/`
2. **文件大小**: nginx 已配置无限制 (之前 5MB 限制已修复)
3. **并发控制**: 最多 3 个并发传输任务
4. **权限**: 确保推送的文件有执行权限 (`chmod +x`)
5. **项目关联**: 推荐传入 `project_id` 以便追踪

---

## 📞 技术支持

- **API 文档**: http://1.13.247.173/edgehub-agent-manual.html
- **GitHub**: https://github.com/467718584/edgehub-test
- **框架**: https://github.com/467718584/agentlink

---

**作者**: 极速科技 EdgeHub Admin  
**版本**: EdgeHub v1.3.3 + EdgeAgent v4.1.1
