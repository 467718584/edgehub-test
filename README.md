# EdgeHub-test

**AgentLink框架的实地部署案例**

> 本仓库是**极速科技基于AgentLink框架的实际部署系统**，包含完整的EdgeHub服务端和EdgeAgent客户端代码。

## 🎯 定位说明

| 项目 | 定位 | 性质 |
|------|------|------|
| **AgentLink** | 框架代码 | 通用可复刻的开源架构 |
| **EdgeHub-test** | 实地部署实例 | 极速科技的生产环境 |

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
│   │   │   └── execService.js          # 执行服务
│   │   └── utils/
│   │       └── ws-server.js    # WebSocket服务 ⭐(已修复命令回环)
│   ├── web/                     # Web管理面板
│   │   ├── index.html
│   │   ├── css/style.css
│   │   └── js/
│   │       ├── app.js
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

## 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 设备注册 | ✅ | M1-M4完成 |
| 命令下发 | ✅ | M5-M7完成，WebSocket闭环验证 |
| 心跳监控 | ✅ | M4完成 |
| WebSocket事件 | ✅ | M8完成 |
| Python EdgeAgent | ✅ | M9完成 |
| 多智能体拓扑 | ✅ | M15完成 |

## 🔗 相关链接

| 资源 | 地址 |
|------|------|
| 框架仓库 | https://github.com/467718584/agentlink |
| 主站 | http://speedonline.online |
| Web面板 | http://1.13.247.173/edgehub-web/ |

---

**部署版本**: EdgeHub v1.0.0 + EdgeAgent v4.1  
**最后更新**: 2026-06-15  
**维护者**: 极速科技
