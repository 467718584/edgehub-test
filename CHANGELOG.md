# Changelog - EdgeHub-test

所有版本更新记录。极速科技生产环境部署实例。

## [v1.3.0] - 2026-06-21

### 🆕 P0优化项 (Issue #1)

#### P0-1: WebSocket命令结果订阅机制
- **文件**：`server/src/utils/ws-server.js`
- **功能**：Agent可通过WebSocket订阅命令结果，结果完成后直接推送给订阅者而非广播
- **新增消息类型**：
  - `subscribe_result { command_id }` - 订阅命令结果
  - `subscribed { command_id }` - 订阅确认
- **订阅追踪**：`commandSubscriptions` Map管理订阅关系
- **向后兼容**：未订阅的命令结果仍广播给所有Agent

#### P0-2: 可配置命令超时
- **文件**：`server/src/services/commandQueueService.js`
- **修改**：`executeCommand()`现在使用命令存储的`timeout_ms`
- **API支持**：REST API `POST /devices/:id/commands` 支持`timeout_ms`参数
- **默认值**：30000ms (30秒)，可配置任意值

### 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| WebSocket结果订阅 | ✅ | P0-1完成 |
| 可配置超时 | ✅ | P0-2完成 |

### 🔄 优化前 vs 优化后

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 命令结果获取 | HTTP轮询 | WebSocket实时推送 |
| Docker构建超时 | 60-90s硬编码 | 可配置(timeout_ms) |
| 长时间任务 | 无法追踪进度 | 支持15分钟+任务 |

---

## [v1.2.2] - 2026-06-16

### 🐛 Bug修复

#### EdgeAgent v4.1.0 - WebSocket响应Bug修复
- **问题**：`AttributeError: 'WSClient' object has no attribute 'sock'`
- **原因**：异步线程中访问`self.ws.sock`，但`WebSocketApp`对象不暴露`sock`属性
- **修复**：移除`sock`检查，直接调用`send()`方法

#### EdgeAgent v4.1.0 - 缩进错误修复
- **问题**：`IndentationError: unindent does not match any outer indentation level`
- **原因**：sed替换时破坏了代码结构
- **修复**：修复`send()`方法的try-except结构

---

## [v1.2.1] - 2026-06-16

### 🐛 Bug修复

#### EdgeAgent v4.1 - 异步命令执行修复
- **文件**：`edgeagent-win.py`
- **问题**：交互式命令（如`copy con`）会导致EdgeAgent卡死
- **原因**：`handle_command()`在WebSocket主线程中执行命令，主线程阻塞导致心跳无法发送
- **修复**：
  1. **异步执行**：命令在独立线程中执行，不阻塞WebSocket主线程
  2. **交互式命令检测**：自动拒绝`copy con`、`more`、`edlin`、`edit`等交互式命令

- **核心代码变更**：
  ```python
  def handle_command(self, cmd):
      # 检测交互式命令
      if self._is_interactive_command(command):
          # 拒绝执行，返回错误
          return
      # 异步执行，不阻塞主线程
      thread = threading.Thread(target=self._execute_async, args=(...))
      thread.start()
  ```

- **交互式命令黑名单**：
  - `copy con` - 等待键盘输入
  - `more` - 分页显示等待回车
  - `edlin` - 行编辑器
  - `edit` - DOS编辑器
  - `qbasic` - QBasic解释器
  - `debug` - 调试工具

### 📊 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 异步命令执行 | ✅ | v4.1新增 |
| 交互式命令检测 | ✅ | v4.1新增 |

---

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