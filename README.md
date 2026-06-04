# EdgeHub - 边缘设备管理系统

## 版本信息

| 项目 | 版本 | 说明 |
|------|------|------|
| EdgeHub Server | 3.1.x | 边缘设备管理核心服务 |
| EdgeAgent (RK3588) | 3.0.2 | 设备端 WebSocket 客户端 |
| EdgeAgent (Windows) | 4.1 | Windows 设备端 WebSocket 客户端 |
| 协议 | EHP v1.0 | EdgeHub Protocol |
| **最后更新** | **2026-06-04** | Windows 适配 + 双进程Bug修复 |

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      EdgeHub Server                         │
│                   (1.13.247.173:8080)                       │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ REST API │  │ WebSocket   │  │ Command Queue      │   │
│  │ /api/v1  │  │ /ws          │  │ delivered_via_ws    │   │
│  └──────────┘  └──────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
              ↑              ↑              ↑
              │ WebSocket    │              │ REST / callbacks
              │              │              │
┌─────────────┴──┐   ┌───────┴──────┐   ┌───┴──────────────┐
│   RK3588       │   │  Windows     │   │  Other Devices  │
│ EdgeAgent v3.0 │   │  EdgeAgent   │   │                 │
│ ✅ ONLINE       │   │  v4.1 ✅     │   │                 │
└────────────────┘   └──────────────┘   └──────────────────┘
```

## 核心文件

### 服务端 (`/opt/edgehub/`)

| 文件路径 | 版本 | 功能说明 |
|---------|------|---------|
| `src/app.js` | 3.1.x | EdgeHub 主服务 |
| `src/models/database.js` | 3.1.x | 数据库模型 |
| `src/services/commandQueueService.js` | 3.1.x | 命令队列，WS 优先推送逻辑 |
| `src/utils/ws-server.js` | 3.1.x | WebSocket 服务，路径 `/ws` |
| `web/` | 3.1.x | 前端 UI |

### 设备端 (`/var/www/html/edgeagent/`)

| 文件名 | 版本 | 说明 |
|-------|------|------|
| `edgeagent-ws-v3.py` | 3.0.2 | RK3588 EdgeAgent，WebSocket 原生模式 |
| `edgeagent-win.py` | 4.1 | Windows EdgeAgent，psutil 替代 wmic |
| `Install-EdgeAgent.ps1` | 4.1 | Windows 一键安装脚本 |

## 一键部署

### RK3588 设备端

```bash
curl -s http://1.13.247.173/edgeagent-full-start-rk3588.sh | sudo bash
```

### Windows 设备端

PowerShell（管理员）运行：

```powershell
irm http://1.13.247.173/edgeagent/Install-EdgeAgent.ps1 -OutFile C:\Install-EdgeAgent.ps1
powershell -ExecutionPolicy Bypass -File C:\Install-EdgeAgent.ps1
```

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
  "cpu": {"model": "aarch64/AMD64", "cores": 8, "usage": 12.5},
  "memory": {"total": 7916, "free": 4687, "used": 3229, "percent": 40.8},
  "disk": {"total": 56, "used": 24, "percent": 43.5},
  "load": {"1min": 5.97, "5min": 5.89, "15min": 5.87},
  "uptime": "2天 6小时 43分钟"
}
```

### 4. 命令执行闭环

```
用户下发命令 → EdgeHub 推送 WS → 设备执行 → 结果回传 → 数据库更新
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

## 版本历史

### v4.1 (2026-06-04) - Windows EdgeAgent 大版本更新
- **psutil 替代 wmic**：解决 Windows 11/Server 2022 上 wmic 已弃用的问题
- **完整 SysInfo**：CPU/内存/磁盘/运行时间全支持
- **安装脚本重写**：使用 schtasks 替代 nssm，修复兼容性问题
- **心跳无阻塞**：使用 `cpu_percent(interval=None)` 无需 sleep
- **命令类型修复**：`execute_command` 和 `command` 两种消息类型都支持

### v3.0.2 (2026-06-04) - RK3588 EdgeAgent 修复
- **双进程问题修复**：确保单实例运行
- **WebSocket 消息处理优化**：命令接收更稳定
- **systemd 服务优化**：防止重复启动

### v3.0.1 (2026-05-28) 🎉
- **WireGuard + EdgeAgent 完全打通**
- RK3588 设备状态: **online**
- WebSocket 路径修正: `/ws` 而非 `/ws/device`
- 一键启动脚本: `edgeagent-full-start-rk3588.sh`

### v3.0.0 (2026-05-27)
- WebSocket 原生命令推送
- 替代 SSH over VPN 方案
- device_status 定期上报

## 已知问题与修复

### 2026-06-04 修复：Windows EdgeAgent 问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `wmic` 命令失败 | Windows 11 已弃用 | 使用 psutil 替代 |
| 安装脚本报错 | `Join-String` PowerShell 5.1 不支持 | 改用 `-join` 拼接 |
| nssm 下载失败 | C:\ 路径格式问题 | 回退到 schtasks |
| SysInfo 返回 null | 首次 cpu_percent() 返回累积值 | 启动时初始化，后续无阻塞获取 |

### 2026-06-04 修复：RK3588 双进程问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 两个 EdgeAgent 进程 | systemd 重复启动或残留进程 | 停止服务，杀掉进程，重新启动 |
| 命令卡在 pending | 消息处理被两个进程瓜分 | 确保单实例运行 |

### 排查命令

```bash
# 检查进程数量（正常应该只有1个）
ps aux | grep edgeagent

# 检查服务状态
systemctl status edgeagent

# 查看日志
tail -30 /opt/edgeagent/logs/edgeagent.log

# 重启服务
sudo systemctl restart edgeagent
```

## 经验教训 (2026-06-04)

### Windows EdgeAgent 适配要点

1. **wmic 已弃用**
   - Windows 11/Server 2022 不再包含 wmic
   - 必须使用 PowerShell 或 psutil 获取系统信息

2. **PowerShell 版本兼容性**
   - `Join-String` 是 PowerShell 7+ 特性
   - PowerShell 5.1 使用 `-join` 拼接字符串

3. **路径分隔符**
   - PowerShell 中字符串拼接 `\"` 可能导致问题
   - 使用单引号或 here-string 更安全

4. **psutil 优于 wmic**
   - psutil 是跨平台的系统信息库
   - 无需关心 Windows 版本差异

### RK3588 服务稳定性

1. **单实例运行**
   - EdgeAgent 必须是单进程
   - 多进程会导致 WebSocket 消息处理混乱

2. **systemd 抑制重复启动**
   ```bash
   sudo systemctl edit edgeagent
   ```
   添加：
   ```ini
   [Service]
   RuntimeMaxSec=3600
   ```

3. **日志监控**
   - 定期检查日志是否有异常
   - "SysInfo上报完成" 说明心跳正常
   - "收到命令" 说明命令推送正常

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

/var/www/html/edgeagent/
├── edgeagent-ws-v3.py          # RK3588 EdgeAgent (Linux)
├── edgeagent-win.py            # Windows EdgeAgent
├── Install-EdgeAgent.ps1       # Windows 一键安装脚本
└── edgeagent-full-start-rk3588.sh  # RK3588 一键启动脚本
```

## 连接信息

| 属性 | 值 |
|------|-----|
| 服务器 | 1.13.247.173 |
| API Key | `edgehub_secret_key` |
| RK3588 设备ID | `82b2731d58533598` |
| WEI-PC 设备ID | `82785476b5753520` |
| WebSocket URL | `ws://1.13.247.173/ws` |
| Web 面板 | http://1.13.247.173/edgehub-web/ |

## GitHub

- EdgeHub: https://github.com/467718584/edgehub
- AgentLink: https://github.com/467718584/agentlink