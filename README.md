# EdgeHub - 边缘设备管理平台

> 让AI智能体通过统一协议控制边缘设备

## 📋 项目概述

EdgeHub是一个通用的边缘设备管理协议，专为AI智能体设计。类似于HTTP是Web通信的通用协议，EdgeHub致力于成为**AI智能体硬件控制的通用协议**。

### 核心能力

| 能力 | 说明 |
|------|------|
| **EHP协议** | 统一的设备操作REST API |
| **WireGuard VPN** | 内置VPN隧道，实现安全设备通信 |
| **命令队列** | 异步命令执行，状态跟踪 |
| **项目追踪** | 自动开发日志记录 |
| **Web管理面板** | 专业的设备管理UI |
| **多语言SDK** | Python/JavaScript 开发工具包 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        AI 智能体层                           │
│         OpenClaw / LangChain / AutoGen / CrewAI            │
└──────────────────────────┬────────────────────────────────┘
                           │ EHP REST API / WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      EdgeHub API Server                      │
│                      (1.13.247.173:8080)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  设备管理  │  │  命令队列  │  │  项目追踪  │  │  实时事件  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                        │                                    │
│                        │ SSH / WireGuard                    │
└───────────┬────────────┼────────────┬─────────────────────┘
            │            │            │
            ▼            ▼            ▼
       ┌────────┐   ┌────────┐   ┌────────┐
       │ RK3588 │   │ Linux  │   │ Windows│
       │ 设备   │   │ 服务器  │   │  PC    │
       └────────┘   └────────┘   └────────┘
```

---

## 📁 项目结构

```
edgehub/
├── src/                      # API服务端核心
│   ├── app.js               # Express应用入口
│   ├── routes/              # API路由
│   │   ├── devices.js       # 设备管理API
│   │   ├── commands.js     # 命令队列API
│   │   ├── projects.js      # 项目追踪API
│   │   ├── agents.js        # 智能体API
│   │   └── files.js        # 文件传输API
│   ├── services/           # 业务服务
│   │   ├── deviceService.js
│   │   ├── commandQueueService.js
│   │   ├── developmentLogger.js
│   │   └── websocketService.js
│   ├── models/              # 数据模型
│   │   └── database.js     # SQLite数据库
│   └── middlewares/         # 中间件
│
├── web/                      # Web管理面板
│   ├── index.html           # 主页面
│   ├── js/                 # 前端JavaScript
│   │   ├── app.js          # 主应用逻辑
│   │   ├── api.js          # API客户端
│   │   └── agents.js       # 智能体页面
│   └── css/                # 样式文件
│
├── sdk/                      # 开发工具包
│   ├── python/             # Python SDK
│   └── js/                 # JavaScript SDK
│
├── agent/                    # EdgeAgent端
│   └── config.json         # Agent配置
│
├── docs/                    # 文档
│   ├── API.md             # API详细文档
│   ├── EHP_PROTOCOL.md    # 通信协议
│   ├── NETWORKING-GUIDE.md # 网络配置指南
│   └── PROJECT-TRACKING.md # 项目追踪文档
│
├── scripts/                 # 工具脚本
│
└── README.md               # 本文件
```

---

## 🚀 快速开始

### 1. 安装EdgeHub API服务器

```bash
# 克隆项目
git clone https://github.com/467718584/edgehub.git
cd edgehub

# 安装依赖
npm install

# 启动服务
node src/app.js
```

### 2. 注册边缘设备

**Linux/RK3588:**
```bash
curl -O http://1.13.247.173/edgehub-install.sh
chmod +x edgehub-install.sh
sudo bash edgehub-install.sh
```

**Windows 11:**
```powershell
# 以管理员身份运行PowerShell
irm http://1.13.247.173/edgehub-install-win.bat | iex
```

### 3. 访问Web管理面板

- **地址**: http://1.13.247.173/edgehub-web/
- **默认API Key**: `edgehub_secret_key`

---

## 📡 API 参考

### 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `http://1.13.247.173/edgehub-api/v1` |
| WebSocket | `ws://1.13.247.173:8080/ws` |
| API Key | `edgehub_secret_key` |

### 核心端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /devices/register` | POST | 注册新设备 |
| `POST /devices/:id/heartbeat` | POST | 发送心跳 |
| `GET /devices` | GET | 获取设备列表 |
| `GET /devices/:id` | GET | 获取设备详情 |
| `POST /devices/:id/commands` | POST | 下发命令 |
| `GET /devices/:id/commands` | GET | 设备拉取命令 |
| `POST /commands/:id/callback` | POST | 命令执行回调 |
| `GET /projects` | GET | 获取项目列表 |
| `GET /stats` | GET | 获取系统统计 |

### 设备详情响应示例

```json
{
  "success": true,
  "data": {
    "device_id": "82b2731d58533598",
    "device_name": "RK3588",
    "vpn_ip": "10.0.0.14",
    "status": "online",
    "architecture": "aarch64",
    "os_version": "Linux 6.1.118",
    "sysinfo": {
      "cpu": {"model": "ARM Cortex-A76", "cores": 4, "usage": 35.2},
      "memory": {"total": 7.6, "used": 3.2, "percent": 42.1},
      "disk": {"total": 58.0, "used": 12.5, "percent": 21},
      "load": {"1min": 0.85, "5min": 0.92, "15min": 0.78},
      "uptime": "5天3小时22分钟"
    }
  }
}
```

---

## 🔧 功能模块

### M1-M4: 设备基础管理 ✅

- [x] 设备注册与认证
- [x] 心跳保活机制
- [x] 命令下发接口
- [x] 项目追踪系统

### M5-M7: 命令队列闭环 ✅

- [x] 命令下发→设备拉取→执行→回调
- [x] 命令状态跟踪
- [x] 执行结果记录

### M8: WebSocket实时事件 ✅

- [x] 设备上下线事件
- [x] 命令状态变更事件
- [x] 项目活动事件

### M9: Python EdgeAgent ✅

- [x] 跨平台支持 (Linux/RK3588/Windows)
- [x] 命令执行与回调
- [x] 心跳保活
- [x] 系统信息采集 (v2.10+)

### M10-M11: SDK支持 ✅

- [x] JavaScript SDK
- [x] Python SDK
- [x] OpenClaw Skill

### M12-M14: 扩展功能 ✅

- [x] MCP Server
- [x] OpenAPI文档
- [x] 自动化测试

---

## 🌐 网络拓扑

### WireGuard VPN

| 节点 | VPN IP | 类型 |
|------|--------|------|
| 服务器 | 10.0.0.1 | Gateway |
| RK3588 | 10.0.0.14 | EdgeDevice |
| Windows | 10.0.0.x | EdgeDevice (待加入) |

### UDP2RAW TCP方案

对于移动网络等UDP受限环境，提供TCP封装：

```
客户端 --(UDP)--> udp2raw --> 服务器:443 --> WireGuard
```

---

## 📊 当前状态

| 指标 | 值 |
|------|-----|
| 在线设备 | 1 (RK3588) |
| 总设备 | 13 |
| 项目数 | 2 |
| Agent版本 | v2.10 |

---

## 🔗 相关链接

- **GitHub**: https://github.com/467718584/edgehub
- **Web管理面板**: http://1.13.247.173/edgehub-web/
- **API文档**: /docs/API.md

---

## 📄 许可证

MIT License
