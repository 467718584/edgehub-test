# EdgeHub-test | 实地部署实例 | 极速科技的生产环境

**关系**:EdgeHub-test 是 AgentLink 框架在极速科技的**具体部署实现**。

## 🏠 部署信息

| 属性 | 值 |
|------|-----|
| **服务器** | 1.13.247.173 (Ubuntu) |
| **域名** | speedonline.online |
| **API端口** | 8081 (Docker) |
| **Web面板** | http://1.13.247.173/edgehub-web/ |
| **VPN** | WireGuard UDP 51820 |
| **部署方式** | Docker 容器化部署 ✅ |

## 📁 仓库结构

```
edgehub-test/
├── server/                      # EdgeHub 服务端源码
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
├── deployments/
│   └── docker/                  # Docker 部署配置 ⭐
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── nginx/
│       └── scripts/
├── docs/
│   └── EDGEHUB_FILE_TRANSFER.md  # 文件传输系统说明书
├── CHANGELOG.md                # ⭐ 版本更新记录
└── README.md
```

## 📡 文件传输

EdgeHub 支持两种文件传输模式：

### Push 模式 (服务器→设备)
```bash
curl -X POST http://1.13.247.173/api/v1/transfers \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "82785476b5753520",
    "direction": "push",
    "local_path": "/tmp/test.bin",
    "remote_path": "C:\\Users\\Public\\test.bin"
  }'
```

### Pull 模式 (设备→服务器)
```bash
curl -X POST http://1.13.247.173/api/v1/transfers/pull \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "82785476b5753520",
    "remote_path": "C:\\Users\\Public\\test.bin",
    "local_path": "/tmp/download.bin"
  }'
```

详细文档: [EDGEHUB_FILE_TRANSFER.md](docs/EDGEHUB_FILE_TRANSFER.md)

---

## 🚀 Docker 部署 (推荐)

### 快速启动

```bash
cd deployments/docker
docker compose up -d
```

### 手动构建

```bash
cd deployments/docker
docker build -t edgehub-api .
docker run -d -p 127.0.0.1:8081:8080 \
  -v /opt/edgehub/data:/app/data \
  --name edgehub-api \
  edgehub-api
```

### 数据迁移

如果从传统部署迁移:

```bash
# 1. 备份现有数据
cp -r /opt/edgehub/data /opt/edgehub/data.backup-$(date +%Y%m%d)

# 2. 启动 Docker 容器(自动使用现有数据)
docker run -d -p 127.0.0.1:8081:8080 \
  -v /opt/edgehub/data:/app/data \
  --name edgehub-api \
  edgehub-api
```

## 🔧 传统部署 (Node.js)

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
# 管理员:可给任意设备下发命令
curl -X POST http://1.13.247.173/api/v1/devices/82b2731d58533598/commands \
  -H "X-API-Key: edgehub_secret_key" \
  -d '{"command": "ls -la"}'

# Agent:只能给已绑定设备下发命令
curl -X POST http://1.13.247.173/api/v1/devices/82785476b5753520/commands \
  -H "X-API-Key: eh_key_ivp_agent_001_6747f7824d09c6d091128b360fa43831" \
  -d '{"command": "python detect.py"}'
```

## 📊 功能状态

| 功能 | 状态 | 版本 |
|------|------|------|
| 设备注册 | ✅ | M1-M4 |
| 命令下发 | ✅ | M5-M7 |
| 心跳监控 | ✅ | M4 |
| WebSocket事件 | ✅ | M8 |
| Python EdgeAgent | ✅ | M9 |
| JavaScript SDK | ✅ | M10 |
| OpenClaw Skill | ✅ | M11 |
| MCP Server | ✅ | M12 |
| OpenAPI文档 | ✅ | M13 |
| 自动化测试 | ✅ | M14 |
| 多智能体拓扑 | ✅ | M15 |
| Sysinfo轮询 | ✅ | v1.1.0 |
| Agent API Key权限体系 | ✅ | v1.2.0 |
| **WebSocket结果订阅** | ✅ | **v1.3.0** |
| **Docker容器化部署** | ✅ | **v1.3.0** |
| **文件传输协议 v2.0** | ✅ | **v1.3.2** |
| **项目文件传输集成** | ✅ | **v1.3.3** |

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

## 📁 文件传输协议 v2.0

### 功能特性
- **Push模式**: Server → 设备 (支持大文件分块)
- **Pull模式**: 设备 → Server
- **多块传输**: 文件 >2MB 自动分块
- **断点续传**: 支持 resume 接口
- **并行传输**: 最多3个并发传输任务
- **队列管理**: 优先级调度 (1-5级)
- **项目集成**: 自动关联 project_id,记录到开发日志

### API端点

#### 传输管理
```bash
# 获取传输状态
GET /api/v1/transfers/:transferId

# 获取传输队列
GET /api/v1/files/queue

# 修改传输优先级
POST /api/v1/files/queue/priority

# 取消传输
DELETE /api/v1/files/queue/:transferId

# 断点续传
GET /api/v1/transfers/:id/resume
```

#### 项目文件传输
```bash
# 获取项目的传输历史
GET /api/v1/projects/:id/transfers

# 获取项目传输统计
GET /api/v1/projects/:id/transfers/stats
```

#### 文件推送/拉取
```bash
# Push文件到设备 (multipart)
POST /api/v1/:deviceId/files/push
  -H "X-API-Key: edgehub_secret_key"
  -F "file=@/path/to/file"
  -F "remote_path=C:\\temp\\file.txt"
  -F "project_id=8"  # 可选

# Pull文件从设备
GET /api/v1/:deviceId/files/pull?remote_path=/path/file.txt&project_id=8
```

### EdgeAgent文件接收
EdgeAgent 内置 `FileReceiver` 类处理文件接收:
- `transfer_start` - 初始化接收
- `transfer_chunk` - 接收数据块
- 自动MD5校验

**版本要求**: EdgeAgent v4.1.1+

## 🔗 相关链接

| 资源 | 地址 |
|------|------|
| 框架仓库 | https://github.com/467718584/agentlink |
| 主站 | http://speedonline.online |
| Web面板 | http://1.13.247.173/edgehub-web/ |
| API端点 | http://1.13.247.173/api/v1/ |
| 接入说明书 | http://1.13.247.173/edgehub-agent-manual.html |

---

**部署版本**: EdgeHub v1.3.3 + EdgeAgent v4.1.1
**Docker镜像**: `edgehub-docker-edgehub-api:latest`
**最后更新**: 2026-06-26
**维护者**: 极速科技
