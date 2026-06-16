# EdgeHub-test | 实地部署实例 | 极速科技的生产环境

**关系**：EdgeHub-test 是 AgentLink 框架在极速科技的**具体部署实现**。

## 🏠 部署信息

| 属性 | 值 |
|------|-----|
| **服务器** | 1.13.247.173 (Ubuntu) |
| **域名** | speedonline.online |
| **API端口** | 8080 (Node.js) |
| **Web面板** | http://1.13.247.173/edgehub-web/ |
| **VPN** | WireGuard UDP 51820 |

## 📁 仓库结构

```
edgehub-test/
├── server/                      # EdgeHub 服务端 (部署在云服务器)
│   ├── src/
│   │   ├── app.js              # 主入口
│   │   ├── routes/             # REST API 路由
│   │   │   ├── devices.js      # 设备注册/管理
│   │   │   ├── commands.js     # 命令下发 (含设备绑定校验)
│   │   │   ├── agents.js       # 智能体管理
│   │   │   ├── projects.js     # 项目追踪
│   │   │   └── exec.js         # 执行服务
│   │   ├── services/           # 核心服务
│   │   │   ├── commandQueueService.js  # 命令队列
│   │   │   ├── deviceService.js        # 设备服务
│   │   │   ├── execService.js          # 执行服务
│   │   │   └── sysinfoPolling.js       # Sysinfo定时轮询
│   │   ├── middlewares/
│   │   │   └── auth.js         # ⭐ API Key认证 + 设备绑定校验
│   │   └── utils/
│   │       └── ws-server.js    # WebSocket服务
│   ├── web/                     # Web管理面板
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js          # 前端路由+sysinfo展示
│   │       ├── api.js
│   │       └── agents.js
│   └── package.json
│
├── agent/                       # EdgeAgent 客户端 (部署在设备上)
│   ├── agent.py                # Python Agent核心
│   ├── server-agent.py         # 服务端代理
│   ├── config.py               # 配置
│   ├── requirements.txt
│   ├── services/
│   │   ├── heartbeat.py
│   │   └── register.py
│   └── start.sh
│
├── edgeagent-win.py            # Windows EdgeAgent v4.1
├── Install-EdgeAgent.ps1        # Windows一键安装脚本
├── restart-weipc-agent.bat      # WEI-PC重启脚本
├── EDGEHUB-DEPLOYMENT.md       # 部署案例详细文档
├── CHANGELOG.md                # ⭐ 版本更新记录
└── README.md
```

## 🔧 服务部署

### 启动服务端

```bash
cd server
npm install
npm start
```

### 启动EdgeAgent (Linux/RK3588)

```bash
cd agent
pip install -r requirements.txt
python agent.py
```

### 启动EdgeAgent (Windows)

```powershell
# 使用管理员权限PowerShell
.\Install-EdgeAgent.ps1
```

## 🔑 API Key体系

### 两种Key类型

| Key类型 | 格式 | 权限范围 |
|---------|------|----------|
| **管理员Key** | `edgehub_secret_key` | 可操作任意设备 |
| **Agent Key** | `eh_key_{agent_id}_xxxxxx` | 只能操作绑定项目关联的设备 |

### 权限校验流程

```
┌─────────────────────────────────────────────────────────────┐
│                     API请求                                  │
│         -H "X-API-Key: eh_key_ivp_agent_001_xxx"            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  auth.js 认证中间件                                          │
│  1. 检查是否是管理员Key → 直接通过                          │
│  2. 检查是否是Agent Key → 查询数据库验证                    │
│  3. 都无效 → 返回401                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  commands.js 设备绑定校验                                   │
│  如果是普通Agent:                                            │
│    checkDeviceBond(agent_id, device_id)                      │
│    → 查询agent_projects + project_devices                   │
│    → 设备未绑定 → 返回403 DEVICE_NOT_BINDED                  │
└─────────────────────────────────────────────────────────────┘
```

### Agent Key生成记录

| Agent | API Key | 可管辖设备 |
|-------|---------|-----------|
| ivp-agent-001 | `eh_key_ivp_agent_001_6747f782...` | WEI-PC |
| jisu-admin | `eh_key_jisu_admin_04352f81...` | RK3588 |

### 使用示例

```bash
# 管理员：可给任意设备下发命令
curl -X POST http://1.13.247.173/api/v1/devices/82b2731d58533598/commands \
  -H "X-API-Key: edgehub_secret_key" \
  -d '{"command": "ls -la"}'

# Agent：只能给已绑定设备下发命令
curl -X POST http://1.13.247.173/api/v1/devices/82785476b5753520/commands \
  -H "X-API-Key: eh_key_ivp_agent_001_6747f7824d09c6d091128b360fa43831" \
  -d '{"command": "python detect.py"}'
```

## 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 设备注册 | ✅ | M1-M4完成 |
| 命令下发 | ✅ | M5-M7完成，WebSocket闭环验证 |
| 心跳监控 | ✅ | M4完成，TCP pong机制 |
| WebSocket事件 | ✅ | M8完成 |
| Python EdgeAgent | ✅ | M9完成 |
| JavaScript SDK | ✅ | M10完成 |
| OpenClaw Skill | ✅ | M11完成 |
| MCP Server | ✅ | M12完成 |
| OpenAPI文档 | ✅ | M13完成 |
| 自动化测试 | ✅ | M14完成 |
| 多智能体拓扑 | ✅ | M15完成 |
| Sysinfo轮询 | ✅ | 每60秒自动采集 |
| **Agent API Key权限体系** | ✅ | **v1.2.0新增** |

## 🖥️ Sysinfo轮询功能

### 功能说明
- 每60秒自动向所有在线设备发送`systeminfo`(Windows)或`/proc/cpuinfo`(Linux)命令
- 自动解析系统信息并更新数据库
- 前端Web面板实时展示CPU型号、核心数、内存使用率

### 数据格式
```json
{
  "cpu": { "model": "Intel64 Family 6 Model 85 Stepping 7 GenuineIntel", "cores": 2, "usage": 0 },
  "memory": { "total": 65193, "free": 55642, "percent": 15 },
  "platform": "Windows",
  "python": "-",
  "uptime": 452761
}
```

## 🔗 相关链接

| 资源 | 地址 |
|------|------|
| 框架仓库 | https://github.com/467718584/agentlink |
| 主站 | http://speedonline.online |
| Web面板 | http://1.13.247.173/edgehub-web/ |
| 接入说明书 | http://1.13.247.173/edgehub-agent-manual.html |

---

**部署版本**: EdgeHub v1.2.1 + EdgeAgent v4.1  
**最后更新**: 2026-06-16  
**维护者**: 极速科技