# Changelog - EdgeHub-test

所有版本更新记录。极速科技生产环境部署实例。

## [v1.2.0] - 2026-06-16

### 🆕 新增功能

#### Agent API Key权限体系
- **auth.js改造**：支持Agent独立API Key认证
  - 位置：`server/src/middlewares/auth.js`
  - 新增`checkDeviceBond()`函数校验设备绑定
  - 区分管理员Key和普通Agent Key
  
- **commands.js改造**：下发命令时设备绑定校验
  - 位置：`server/src/routes/commands.js`
  - 非管理员Agent必须绑定设备才能下发命令
  - 返回403错误：`DEVICE_NOT_BINDED`

- **app.js改造**：注入db到auth中间件
  - 第23行：import `setAuthDatabase`
  - 第60行：调用`setAuthDatabase(db)`

#### API Key生成
| Agent | API Key格式 |
|-------|------------|
| ivp-agent-001 | `eh_key_ivp_agent_001_xxxxxxxxxxxxxxxx` |
| jisu-admin | `eh_key_jisu_admin_xxxxxxxxxxxxxxxx` |

### 🔒 权限体系说明

| Key类型 | 权限范围 |
|--------|----------|
| 管理员Key (`edgehub_secret_key`) | 可操作任意设备 |
| 普通Agent Key (`eh_key_xxx`) | 只能操作自己绑定项目关联的设备 |

### ✅ 测试验证

| 测试场景 | 结果 |
|---------|------|
| ivp-agent用自己的Key给WEI-PC下发命令（已绑定） | ✅ 成功 |
| jisu-admin用自己的Key给WEI-PC下发命令（未绑定） | ✅ 403拦截 |
| jisu-admin用自己的Key给RK3588下发命令（已绑定） | ✅ 成功 |

---

## [v1.1.0] - 2026-06-15

### 🆕 新增功能

#### Sysinfo定时轮询服务
- **文件**：`server/src/services/sysinfoPolling.js`
- **功能**：每60秒自动向在线设备发送sysinfo命令
- **解析**：Windows `systeminfo` / Linux `/proc/cpuinfo` + `free -m`
- **更新**：自动写入数据库`devices.sysinfo`字段

#### WebSocket修复
- **文件**：`server/src/utils/ws-server.js`
- **修改**：第2行添加`handleSysinfoResult`导入
- **问题修复**：`msg.device_id`未定义导致sysinfo更新失败

#### 前端sysinfo展示
- **文件**：`server/web/js/app.js`
- **修改**：设备卡片显示CPU型号+核心数、内存使用率
- **格式**：兼容前后端数据格式

### 📊 功能状态

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
| Sysinfo轮询 | ✅ | 2026-06-15新增 |
| Agent API Key | ✅ | 2026-06-16新增 |

---

## [v1.0.0] - 2026-06-08

### 🎉 初始版本

- EdgeHub核心API服务
- Web管理面板
- Windows EdgeAgent v4.1
- 基础设备管理功能
- 命令下发与回调机制

---

## 📝 版本规范

- **[major.minor.patch]**
  - major: 架构重大变更
  - minor: 新功能添加
  - patch: bug修复和优化