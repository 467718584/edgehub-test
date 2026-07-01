# Changelog - EdgeHub-test

所有版本更新记录。极速科技生产环境部署实例。

## [v1.4.0] - 2026-07-01

### 🐛 Pull模式并发处理修复

#### 问题
Pull模式传输大文件时，只收到chunk 0，后续chunk丢失，导致传输卡住。

#### 根因
- `ws-server.js` 的 `receivePullChunk` 处理没有加锁
- 当EdgeAgent快速发送多个chunk时，服务器端出现竞争条件

#### 修复
- **文件**: `server/src/utils/ws-server.js`
- 添加 `transferProcessingLocks` per-transfer锁机制
- 确保每个传输的chunk串行处理，防止并发处理混乱

- **文件**: `server/src/services/transferService.js`
- 添加详细调试日志 (`[Transfer] receivePullChunk called`, `Decoded buffer len`, `Chunk written`)
- 便于问题诊断和监控

#### Docker镜像
- 重建镜像版本: `edgehub-api:v2.4`
- 修复 `global.transferService` 未定义问题

---

### 📚 新增文档

#### EdgeHub文件传输系统说明书
- **文件**: `docs/EDGEHUB_FILE_TRANSFER.md`
- 完整API接口说明
- WebSocket消息协议
- Push/Pull传输流程
- 配置参数和错误处理

---

## [v1.3.3] - 2026-06-26

### 🆕 项目文件传输集成

#### 项目文件传输端点
- **新增端点**:
  - `GET /api/v1/projects/:id/transfers` - 获取项目的传输历史
  - `GET /api/v1/projects/:id/transfers/stats` - 获取项目传输统计
- **文件**：`server/src/routes/projects.js`

#### 自动开发日志记录
- **文件**：`server/src/routes/files.js`
- DevelopmentLogger 集成到文件传输路由
- 文件传输完成后自动记录到项目开发日志

#### Multipart上传支持project_id
- **修复**：`pushFileLegacy()` 和 `pullFileLegacy()` 支持 `project_id` 参数
- **文件**：`server/src/services/transferService.js`

---

## [v1.3.2] - 2026-06-25

### 🆕 文件传输协议 v2.0 Phase 2

#### 并行分块传输
- **文件**：`server/src/services/transferService.js`
- TransferQueue 类实现传输队列管理
- 优先级调度 (1-5级)
- 最多3个并发传输任务
- 每传输最多3个并发chunk

#### 新增API端点
- `GET /api/v1/files/queue` - 获取传输队列状态
- `POST /api/v1/files/queue/priority` - 修改传输优先级
- `DELETE /api/v1/files/queue/:transferId` - 取消传输
- `GET /api/v1/transfers/:id/resume` - 断点续传

#### nginx配置修复
- `/api/v1/` location 添加 `client_max_body_size 0`
- 支持大文件上传 (无限制)

### 🐛 Bug修复

#### EdgeAgent Windows编码问题
- 添加 `_decode_output()` fallback 链
- 支持 GBK/GB2312/UTF-8/UTF-16LE 自动检测
- **文件**: `agent/edgeagent.py`

#### 命令超时处理
- 修复命令执行超时后状态不一致问题
- 超时后自动标记为 `timeout` 状态

#### 项目详情数据源问题
- 修复项目详情页使用开发记录而非API数据的问题
- **文件**: `server/src/routes/projects.js`