# EdgeHub-test

**AgentLink框架的实地部署案例**

> 本仓库记录了基于AgentLink框架搭建的**极速科技实际部署系统**，包含完整的部署踩坑记录、定制修改和运维经验。

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
| **协议** | AgentLink v1.0 |

## 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 设备注册 | ✅ | M1-M4完成 |
| 命令下发 | ✅ | M5-M7完成，WebSocket闭环验证 |
| 心跳监控 | ✅ | M4完成 |
| WebSocket事件 | ✅ | M8完成 |
| Python EdgeAgent | ✅ | M9完成 |
| 多智能体拓扑 | ✅ | M15完成 |

**设备状态**：
| 设备 | 类型 | 状态 | 最后心跳 |
|------|------|------|---------|
| WEI-PC | Windows | ✅ online | 2026-06-15 |
| RK3588 | Linux ARM | ⚠️ 离线 | 2026-06-09 |

## 🔧 关键修改记录

### 2026-06-15 命令回环修复

**问题**：命令下发后服务器收不到执行结果

**根因**：
1. 命令格式：`type: "execute_command"` → `type: "command"`
2. 消息双重编码：Buffer对象被JSON序列化两次
3. 字段名：`msg.output` → `msg.stdout/stderr`

**修复**：`/opt/edgehub/src/utils/ws-server.js`

```javascript
// 双重解析处理 double-encoded JSON
let msg = JSON.parse(rawData);
if (typeof msg === 'string') {
  try { msg = JSON.parse(msg); } catch(e) {}
}

// 命令格式修正
ws.send(JSON.stringify({ 
  type: "command", 
  data: { command_id, command, timeout_ms }
}));
```

### 2026-05-28 WireGuard VPN打通

- 服务器私钥：`GM2qCaKmvppZlKZQIbNh7RkS+Rv39C6jmz76C6PCXk0=`
- 客户端私钥：`OC6f+2UZ4Jg0WV4Zl27DW6R9XVWkaO6a+ol/mSNeukA=`
- 配置文件：`edgehub-wireguard-client.conf`

## 📁 核心文件

```
edgehub-test/
├── edgeagent-win.py        # Windows EdgeAgent v4.1
├── Install-EdgeAgent.ps1   # Windows一键安装脚本
├── restart-weipc-agent.bat # WEI-PC重启脚本
└── README.md               # 本文档
```

## 🌐 API端点

```bash
# 基础信息
GET /api/v1/stats

# 设备管理
GET  /api/v1/devices
POST /api/v1/devices/register
POST /api/v1/devices/{id}/heartbeat

# 命令下发
POST /api/v1/devices/{id}/commands
GET  /api/v1/commands/{command_id}

# WebSocket
WS /ws
```

## 🔑 访问凭证

```bash
# API Key
X-API-Key: edgehub_secret_key

# SSH
用户: ubuntu
密码: Zzy2047840648
```

## 📖 部署经验

### 1. WebSocket消息格式
- 服务器发：`type: "command", data: {command_id, command, timeout_ms}`
- Agent回：`type: "command_result", command_id, stdout, stderr, exit_code`
- **必须双重JSON.parse** 处理Buffer序列化

### 2. SQLite时区问题
- 存储UTC时间
- 读取时需追加'Z'后缀转为JS Date

### 3. WireGuard与OpenVPN互斥
- WireGuard和OpenVPN不能同时运行
- 选择WireGuard作为首选

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
