# EdgeHub - 边缘设备管理系统

## 版本信息

| 项目 | 版本 | 说明 |
|------|------|------|
| EdgeHub Server | 3.0.x | 边缘设备管理核心服务 |
| EdgeAgent (RK3588) | 3.0.1 | 设备端 WebSocket 客户端 |
| 协议 | EHP v1.0 | EdgeHub Protocol |

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      EdgeHub Server                         │
│                   (1.13.247.173:8080)                       │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ REST API │  │ WebSocket    │  │ Command Queue      │   │
│  │ /api/v1  │  │ /ws          │  │ delivered_via_ws   │   │
│  └──────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
              ↑              ↑              ↑
              │ WebSocket    │              │ REST / callbacks
              │              │              │
┌─────────────┴──┐   ┌───────┴──────┐   ┌───┴──────────────┐
│   RK3588       │   │  Windows     │   │  Other Devices   │
│ EdgeAgent v3.0 │   │  Device      │   │                  │
└────────────────┘   └──────────────┘   └──────────────────┘
```

## 核心文件

### 服务端 (`/opt/edgehub/`)

| 文件路径 | 版本 | 功能说明 |
|---------|------|---------|
| `src/app.js` | 3.0.x | EdgeHub 主服务，global.db 挂载修复 |
| `src/models/database.js` | 3.0.x | 数据库模型，updateDeviceStatus + last_heartbeat 修复 |
| `src/services/commandQueueService.js` | 3.0.x | 命令队列，WS 优先推送逻辑 |
| `src/utils/ws-server.js` | 3.0.x | WebSocket 服务，支持 WS 命令推送 + device_status 处理 |
| `web/js/app.js` | 3.0.x | 前端渲染，loadDeviceDetail sysinfo JSON 解析修复 |

### 设备端 (`/var/www/html/`)

| 文件名 | 版本 | 说明 |
|-------|------|------|
| `edgeagent-ws-v3.py` | 3.0.1 | RK3588 EdgeAgent，WebSocket 原生模式 + SysInfo 上报 |
| `edgeagent-install.sh` | 3.0.x | RK3588 一键安装脚本 |

### 配置文件

| 文件 | 说明 |
|------|------|
| `/etc/nginx/sites-enabled/edgehub` | Nginx 反向代理 + WebSocket 支持 |
| `/etc/systemd/system/edgeagent.service` | RK3588 systemd 服务 |

## 功能特性

### 1. WebSocket 实时命令推送

- **优先模式**: WS 推送 → 设备执行 → 结果回调
- **备用模式**: HTTP Poll (设备拉取) → 执行 → HTTP 回调
- 状态: `pending` → `delivered_via_ws` → `completed`/`failed`

### 2. 设备状态监控

- WebSocket 心跳维持 `status: online`
- `last_heartbeat` 实时更新
- 5分钟超时检测

### 3. 系统信息上报 (SysInfo)

```json
{
  "cpu": {"model": "aarch64", "cores": 8, "usage": 12.5},
  "memory": {"total": 7916, "free": 4687, "used": 3229, "percent": 40.8},
  "disk": {"total": 56, "used": 24, "percent": 43.5},
  "load": {"1min": 5.97, "5min": 5.89, "15min": 5.87},
  "uptime": "2天 6小时 43分钟"
}
```

### 4. 命令执行闭环

```
用户下发命令 → EdgeHub 推送 WS → RK3588 执行 → 结果回传 → 数据库更新
```

## API 接口

### 设备管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/devices` | 获取所有设备 |
| GET | `/api/v1/devices/:id` | 获取设备详情 |
| POST | `/api/v1/devices/:id/commands` | 下发命令 |

### 命令下发示例

```bash
curl -X POST -H "X-API-Key: edgehub_secret_key" \
  -d '{"command":"echo OK","timeout":15}' \
  "http://1.13.247.173/api/v1/devices/82b2731d58533598/commands"

# 返回: {"status":"delivered_via_ws","mode":"ws"}
```

## 安装部署

### RK3588 设备端

```bash
curl -O http://1.13.247.173/edgeagent-install.sh
chmod +x edgeagent-install.sh
sudo ./edgeagent-install.sh
```

### 手动更新 EdgeAgent

```bash
curl -O http://1.13.247.173/edgeagent-ws-v3.py
sudo cp /opt/edgeagent/edgeagent.py /opt/edgeagent/edgeagent.py.bak
sudo cp edgeagent-ws-v3.py /opt/edgeagent/edgeagent.py
sudo systemctl restart edgeagent
```

### 服务器端重启 EdgeHub

```bash
sudo kill -9 <PID>
cd /opt/edgehub && node src/app.js &
```

## 调试命令

### 测试 WS 连接

```bash
curl -s -X POST -H "X-API-Key: edgehub_secret_key" \
  -d '{"command":"echo TEST","timeout":10}' \
  "http://1.13.247.173/api/v1/devices/82b2731d58533598/commands"
```

### 查看命令结果

```bash
cd /opt/edgehub && node -e "
const db = new (require('./src/models/database'))('./data/edgehub.db');
db.getCommandsByDevice('82b2731d58533598', null, 5).then(cs => {
  cs.forEach(c => console.log(c.command_id, c.status, c.stdout, c.exit_code));
});
"
```

## 版本历史

### v3.0.1 (2026-05-27)
- EdgeAgent 完整 sysinfo 上报 (CPU/内存/磁盘/负载/运行时间)
- 前端 loadDeviceDetail JSON.parse 修复
- 数据库 updateDeviceStatus 同时更新 last_heartbeat

### v3.0.0 (2026-05-26)
- WebSocket 原生命令推送
- 替代 SSH over VPN 方案
- device_status 定期上报

### v2.x (2026-05-18~25)
- EdgeHub 基础架构
- M1-M14 功能实现

## 已知问题

1. **设备状态 offline** - WebSocket 连接不稳定时状态会变 offline，但命令仍可通过 WS 推送
2. **CPU usage 显示 0** - 首次上报时无历史数据，下一个周期恢复正常

## 目录结构

```
/opt/edgehub/
├── src/
│   ├── app.js                  # 主服务入口
│   ├── models/database.js      # 数据模型
│   ├── services/commandQueueService.js  # 命令队列
│   └── utils/ws-server.js      # WebSocket服务
├── web/                        # 前端UI
├── logs/                       # 日志
└── data/edgehub.db             # 数据库

/var/www/html/
├── edgeagent-ws-v3.py          # 设备端Agent
└── edgeagent-install.sh         # 安装脚本
```

## 连接信息

- 服务器: 1.13.247.173
- API Key: `edgehub_secret_key`
- 设备ID (RK3588): `82b2731d58533598`