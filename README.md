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
│   │   │   ├── commands.js     # 命令下发
│   │   │   ├── agents.js       # 智能体管理
│   │   │   ├── projects.js     # 项目追踪
│   │   │   └── exec.js         # 执行服务
│   │   ├── services/           # 核心服务
│   │   │   ├── commandQueueService.js  # 命令队列
│   │   │   ├── deviceService.js        # 设备服务
│   │   │   ├── execService.js          # 执行服务
│   │   │   └── sysinfoPolling.js       # ⭐ Sysinfo定时轮询
│   │   └── utils/
│   │       └── ws-server.js    # WebSocket服务 (支持sysinfo处理)
│   ├── web/                     # Web管理面板
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js          # (sysinfo展示已更新)
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

## 🔑 关键配置

| 配置项 | 值 |
|--------|-----|
| API Key | `edgehub_secret_key` |
| WebSocket端口 | 8080 |
| 心跳间隔 | 30秒 |
| Sysinfo轮询 | 60秒 |

## 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 设备注册 | ✅ | M1-M4完成 |
| 命令下发 | ✅ | M5-M7完成，WebSocket闭环验证 |
| 心跳监控 | ✅ | M4完成，TCP pong机制 |
| WebSocket事件 | ✅ | M8完成 |
| Python EdgeAgent | ✅ | M9完成 |
| 多智能体拓扑 | ✅ | M15完成 |
| **Sysinfo轮询** | ✅ | **2026-06-15新增** |
| **前端sysinfo展示** | ✅ | **2026-06-15更新** |

## 🖥️ Sysinfo轮询功能 (2026-06-15)

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

### 相关文件
| 文件 | 修改内容 |
|------|---------|
| `server/src/services/sysinfoPolling.js` | 定时轮询服务 |
| `server/src/utils/ws-server.js` | 添加handleSysinfoResult调用 |
| `server/src/models/database.js` | 添加updateDeviceSysinfo方法 |
| `server/web/js/app.js` | 前端sysinfo展示格式更新 |

## 🔗 相关链接

| 资源 | 地址 |
|------|------|
| 框架仓库 | https://github.com/467718584/agentlink |
| 主站 | http://speedonline.online |
| Web面板 | http://1.13.247.173/edgehub-web/ |

---

**部署版本**: EdgeHub v1.1.0 + EdgeAgent v4.1  
**最后更新**: 2026-06-15  
**维护者**: 极速科技