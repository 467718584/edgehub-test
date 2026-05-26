# EdgeHub - 边缘设备与AI智能体管理系统

[English](README_EN.md) | 中文

## 🎯 项目概述

EdgeHub 是一款专为边缘计算场景设计的统一管理平台，实现 **AI智能体 → 项目 → 边缘设备** 的多拓扑关联管理。

### 核心特性

- 🤖 **AI智能体管理** - 支持 OpenClaw、Claude Code、Codex 等多种AI Agent
- 📡 **边缘设备管控** - 通过 WireGuard VPN 实现安全的设备远程控制
- 📁 **项目追踪** - 跨设备的项目部署与变体管理
- 🔄 **命令下发闭环** - 命令下发 → 执行 → 结果回调完整链路
- 📊 **实时监控** - 设备 sysinfo 心跳上报 (CPU/内存/磁盘/网络)

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      EdgeHub Server                      │
│                     (1.13.247.173)                       │
│                                                          │
│   ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│   │  Web UI     │  │  REST API    │  │  WebSocket      │ │
│   │  (管理面板)  │  │  (8080)     │  │  (实时事件)     │ │
│   └─────────────┘  └──────────────┘  └─────────────────┘ │
│          │                │                    │          │
│   ┌──────┴────────────────┴────────────────────────┘ │
│   │              SQLite Database                        │
│   │   agents / projects / devices / commands           │
│   └─────────────────────────────────────────────────── │
└───────────────────────┬─────────────────────────────────┘
                        │ WireGuard VPN (UDP 51820)
                        │
┌───────────────────────┴─────────────────────────────────┐
│                   EdgeAgent (RK3588)                     │
│                                                          │
│   - 设备注册/心跳                                        │
│   - 命令拉取/执行                                        │
│   - sysinfo 上报                                         │
│   - 项目管理                                             │
└─────────────────────────────────────────────────────────┘
```

## 📂 目录结构

```
edgehub/
├── src/                    # Node.js API 服务源码
│   ├── app.js             # 主入口
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   └── models/            # 数据库模型
├── web/                   # Web 管理面板
│   ├── index.html         # 主页面
│   └── js/css/            # 前端资源
├── agent/                 # EdgeAgent 源码
├── docs/                  # EHP 协议文档
├── releases/              # 发布版本
└── data/                  # SQLite 数据库
```

## 🚀 快速开始

### 1. 安装 EdgeHub Server

```bash
# 在服务器上执行
curl -s http://1.13.247.173/edgehub-install.sh | bash

# 或手动安装
git clone https://github.com/467718584/edgehub.git
cd edgehub && npm install
node src/app.js
```

### 2. 安装 EdgeAgent (RK3588)

```bash
# 在 RK3588 设备上执行
curl -s http://1.13.247.173/edgeagent-install.sh | bash

# 验证连接
curl -H "X-API-Key: edgehub_secret_key" \
     http://1.13.247.173/edgehub-api/v1/devices
```

### 3. 访问 Web 管理面板

- **地址**: http://1.13.247.173/edgehub-web/
- **API**: http://1.13.247.173/edgehub-api/v1/

## 📊 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/agents` | GET | 获取所有AI智能体 |
| `/api/v1/agents/:id` | GET | 获取智能体详情 |
| `/api/v1/devices` | GET | 获取所有设备 |
| `/api/v1/devices/:id/commands` | GET/POST | 设备命令管理 |
| `/api/v1/projects` | GET/POST | 项目管理 |
| `/api/v1/stats` | GET | 系统统计 |

## 🗂️ 数据模型

### 四层拓扑结构

```
AI Agent (智能体)
     ↕ (多对多)
 Project (项目)
     ↕ (多对多)
 Device (设备)
     ↕ (多对多)
Project Variant (变体)
```

### 核心表

| 表名 | 说明 |
|------|------|
| `agents` | AI智能体注册表 |
| `projects` | 项目表 |
| `devices` | 边缘设备表 |
| `agent_projects` | 智能体-项目关联 |
| `project_devices` | 项目-设备关联 |
| `commands` | 命令队列表 |

## 🔐 安全配置

- **API Key认证**: 所有API请求需携带 `X-API-Key: edgehub_secret_key`
- **VPN加密**: WireGuard UDP 51820，设备间加密通信
- **命令隔离**: EdgeAgent 以普通用户运行，根命令需sudo

## 📜 安装脚本

| 脚本 | 用途 |
|------|------|
| `edgehub-install.sh` | Server 安装脚本 |
| `edgeagent-install.sh` | EdgeAgent 安装脚本 (RK3588) |
| `install-rk3588-udp2raw.sh` | RK3588 VPN 加速配置 |
| `install-server-udp2raw.sh` | Server UDP 加速配置 |

## 🧪 测试命令

```bash
# 检查设备列表
curl -H "X-API-Key: edgehub_secret_key" \
     http://1.13.247.173/edgehub-api/v1/devices

# 检查智能体列表
curl -H "X-API-Key: edgehub_secret_key" \
     http://1.13.247.173/edgehub-api/v1/agents

# 下发命令
curl -X POST -H "X-API-Key: edgehub_secret_key" \
     -d '{"command":"echo test","timeout":30}' \
     http://1.13.247.173/edgehub-api/v1/devices/{device_id}/commands
```

## 📝 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v2.10 | 2026-05-26 | EdgeAgent v2.10 + sysinfo支持 |
| v2.9 | 2026-05-25 | 多拓扑架构 (Agent/Project/Device) |
| v2.0 | 2026-05-18 | 完整API + Web面板 |

## 📧 联系方式

- **网站**: http://speedonline.online/
- **GitHub**: https://github.com/467718584/edgehub

---

*© 2026 极速科技 EdgeHub*