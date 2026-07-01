# EdgeHub 文件传输系统说明书

> 版本: v2.4 | 更新日期: 2026-07-01 | 状态: ✅ 已验证

---

## 1. 概述

EdgeHub 文件传输系统支持两种模式：
- **Push 模式**：服务器主动下发文件到边缘设备
- **Pull 模式**：服务器从边缘设备拉取文件

文件传输基于分块机制，支持断点续传、大文件分片、进度跟踪。

---

## 2. 系统架构

### 2.1 组件架构

```
┌─────────────────────────────────────────────────────────────┐
│                      EdgeHub Server                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ REST API    │  │ WebSocket    │  │ TransferService    │  │
│  │ /transfers  │  │ ws-server.js │  │ - Push处理          │  │
│  │ /transfers/ │  │              │  │ - Pull处理          │  │
│  │   pull      │  │              │  │ - Chunk管理         │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│                          │                    │              │
│                   ┌──────┴────────────────────┴──────┐       │
│                   │     Database (SQLite)            │       │
│                   │  - file_transfers 表             │       │
│                   │  - transfer_chunks 表            │       │
│                   └─────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
          │                              │
          │ WebSocket                    │ REST API
          ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│   EdgeAgent (Python)│      │   客户端/其他Agent           │
│   - push模式: 接收   │      │   - 发起传输请求             │
│   - pull模式: 发送   │      │   - 查询传输状态             │
└─────────────────────┘      └─────────────────────────────┘
```

### 2.2 数据库表结构

#### file_transfers 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (PK) | 传输ID，格式: tf_{随机}_{随机} |
| project_id | TEXT | 项目ID（可选） |
| device_id | TEXT | 目标设备ID |
| direction | TEXT | 'push' 或 'pull' |
| local_path | TEXT | 本地存储路径 |
| remote_path | TEXT | 远端文件路径 |
| file_name | TEXT | 文件名 |
| file_size | INTEGER | 文件大小（字节） |
| file_hash | TEXT | SHA256 哈希值 |
| status | TEXT | pending/initiating/transferring/completed/failed |
| chunk_size | INTEGER | 分块大小（默认2MB） |
| total_chunks | INTEGER | 总块数 |
| transferred_chunks | INTEGER | 已传输块数 |
| created_at | TEXT | 创建时间 |

#### transfer_chunks 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER (PK) | 自增ID |
| transfer_id | TEXT (FK) | 关联传输ID |
| chunk_index | INTEGER | 块索引（从0开始） |
| chunk_size | INTEGER | 块大小 |
| chunk_hash | TEXT | MD5校验值 |
| status | TEXT | pending/transferred/failed |
| retry_count | INTEGER | 重试次数 |
| transferred_at | TEXT | 传输完成时间 |

---

## 3. API 接口

### 3.1 Push 模式：下发文件到设备

**接口**: `POST /api/v1/transfers`

**请求体**:
```json
{
  "device_id": "82785476b5753520",
  "direction": "push",
  "local_path": "/path/to/local/file.bin",
  "remote_path": "C:\\Users\\Public\\uploaded.bin",
  "description": "固件更新包"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "transfer_id": "tf_mr0t9cee_u32r8df6",
    "status": "initiating",
    "total_chunks": 3
  }
}
```

### 3.2 Pull 模式：从设备拉取文件

**接口**: `POST /api/v1/transfers/pull`

**请求体**:
```json
{
  "device_id": "82785476b5753520",
  "remote_path": "C:\\Users\\Public\\test.bin",
  "local_path": "/tmp/downloaded.bin",
  "description": "日志拉取"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "transfer_id": "tf_mr1q2slm_8aafhrz2",
    "status": "initiating",
    "command_id": "tf_cmd_1782888999759"
  },
  "command_id": "tf_cmd_1782888999759"
}
```

### 3.3 查询传输状态

**接口**: `GET /api/v1/transfers/{transfer_id}`

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "tf_mr1q2slm_8aafhrz2",
    "status": "completed",
    "direction": "pull",
    "file_size": 5242880,
    "total_chunks": 3,
    "transferred_chunks": 3,
    "progress": {
      "transferred_chunks": 3,
      "total_chunks": 3,
      "percentage": 100
    },
    "chunks": [
      {"chunk_index": 0, "status": "transferred", "chunk_hash": "a129fcee..."},
      {"chunk_index": 1, "status": "transferred", "chunk_hash": "8b91790c..."},
      {"chunk_index": 2, "status": "transferred", "chunk_hash": "45ce401c..."}
    ]
  }
}
```

### 3.4 查询所有传输

**接口**: `GET /api/v1/transfers`

**查询参数**:
- `status`: 过滤状态 (pending/transferring/completed/failed)
- `device_id`: 过滤设备

---

## 4. WebSocket 消息协议

### 4.1 Push 模式消息流

```
服务器                          设备(EdgeAgent)
  │                                │
  │──── transfer_start ──────────▶│  开始接收
  │                                │
  │──── transfer_chunk (0) ──────▶│  接收第1块
  │◀─── chunk_ack ────────────────│  确认
  │                                │
  │──── transfer_chunk (1) ──────▶│  接收第2块
  │◀─── chunk_ack ────────────────│  确认
  │                                │
  │──── transfer_complete ───────▶│  传输完成
```

### 4.2 Pull 模式消息流

```
服务器                          设备(EdgeAgent)
  │                                │
  │◀─── transfer_pull_info ───────│  发送文件信息
  │     (file_size, total_chunks)  │
  │                                │
  │◀─── transfer_pull_chunk (0) ──│  发送第1块
  │                                │
  │◀─── transfer_pull_chunk (1) ──│  发送第2块
  │                                │
  │◀─── transfer_pull_chunk (2) ──│  发送最后块 (is_last=true)
  │                                │
  │◀─── command_result ───────────│  完成报告
```

### 4.3 消息类型定义

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| transfer_start | Server→Agent | 开始传输 |
| transfer_chunk | Server→Agent | 数据块（Push） |
| chunk_ack | Agent→Server | 块确认 |
| transfer_complete | Server→Agent | 传输完成 |
| transfer_pull_info | Agent→Server | Pull模式文件信息 |
| transfer_pull_chunk | Agent→Server | Pull模式数据块 |
| command_result | Agent→Server | 命令执行结果 |

### 4.4 消息格式示例

**transfer_pull_info**:
```json
{
  "type": "transfer_pull_info",
  "transfer_id": "tf_mr1q2slm_8aafhrz2",
  "command_id": "tf_cmd_xxx",
  "file_name": "test.bin",
  "file_size": 5242880,
  "file_hash": "3be66e9e33b8e55feeb4b69af33b055559b257c450b7321557b1fef9513b5547",
  "total_chunks": 3
}
```

**transfer_pull_chunk**:
```json
{
  "type": "transfer_pull_chunk",
  "transfer_id": "tf_mr1q2slm_8aafhrz2",
  "chunk_index": 0,
  "data": "<base64编码数据>",
  "hash": "a129fcee821e65bed9cf479a5a0f1353",
  "is_last": false
}
```

---

## 5. 传输流程详解

### 5.1 Push 流程（服务器→设备）

1. 客户端调用 `POST /api/v1/transfers` 发起传输
2. 服务器创建传输记录，状态设为 `initiating`
3. 服务器通过 WebSocket 发送 `transfer_start` 到设备
4. 设备回复 `transfer_started` 确认
5. 服务器分块发送 `transfer_chunk`，每块等待 `chunk_ack`
6. 所有块发送完毕后，服务器发送 `transfer_complete`
7. 设备保存文件并回复 `command_result`
8. 服务器更新传输状态为 `completed`

### 5.2 Pull 流程（设备→服务器）

1. 客户端调用 `POST /api/v1/transfers/pull` 发起传输
2. 服务器创建传输记录，状态设为 `initiating`
3. 服务器通过 WebSocket 发送命令 `__FILE_PULL__:transfer_id:remote_path` 到设备
4. 设备收到命令，读取本地文件，发送 `transfer_pull_info`（文件元数据）
5. 设备分块发送 `transfer_pull_chunk`
6. 服务器的 `receivePullChunk` 异步处理每个块（加锁保证顺序）
7. 最后一块发送后，设备发送 `command_result`
8. 服务器调用 `completePullTransfer` 组装文件，状态设为 `completed`

---

## 6. 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| chunk_size | 2097152 (2MB) | 分块大小 |
| tempDir | ./data/transfer_temp/ | 临时文件目录 |
| transfer_timeout | 300000 (5分钟) | 传输超时时间 |
| max_retries | 3 | 最大重试次数 |

---

## 7. 错误处理

### 7.1 错误码

| 错误码 | 说明 |
|--------|------|
| DEVICE_NOT_FOUND | 设备不存在 |
| DEVICE_OFFLINE | 设备离线 |
| TRANSFER_NOT_FOUND | 传输任务不存在 |
| CHUNK_MISSING | 分块缺失 |
| FILE_HASH_MISMATCH | 文件哈希校验失败 |
| TIMEOUT | 传输超时 |

### 7.2 断点续传

传输中断后，客户端可以重新发起相同 `remote_path` 的传输，系统会：
1. 查询已传输的块
2. 从缺失的块继续传输
3. 已传输的块不会重新发送

---

## 8. 安全考虑

1. **API认证**: 所有API请求需要 `X-API-Key: edgehub_secret_key` 头部
2. **WebSocket认证**: 连接时需要 `api_key` 和 `device_id` 参数
3. **文件校验**: 传输前后对比 SHA256 哈希值
4. **路径限制**: 建议限制可访问的文件路径范围

---

## 9. 已知限制

1. **目录传输**: 暂不支持目录传输，需自行打包
2. **符号链接**: 不会跟随符号链接
3. **大文件**: 单文件大小建议不超过 1GB
4. **并发限制**: 同一设备同时只能有一个传输任务

---

## 10. 测试验证

### 10.1 Push 模式测试
```bash
# 发起传输
curl -X POST http://1.13.247.173/api/v1/transfers \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"82785476b5753520","direction":"push","local_path":"/tmp/test.bin","remote_path":"C:\\Users\\Public\\test.bin"}'

# 查询状态
curl http://1.13.247.173/api/v1/transfers/tf_xxx -H "X-API-Key: edgehub_secret_key"
```

### 10.2 Pull 模式测试
```bash
# 发起传输
curl -X POST http://1.13.247.173/api/v1/transfers/pull \
  -H "X-API-Key: edgehub_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"82785476b5753520","remote_path":"C:\\Users\\Public\\test.bin","local_path":"/tmp/download.bin"}'
```

---

## 11. 变更日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v2.4 | 2026-07-01 | 修复 Pull 模式并发处理问题，添加 per-transfer 锁 |
| v2.3 | 2026-07-01 | 添加 transfer_pull_chunk 消息队列机制 |
| v2.2 | 2026-07-01 | 重建镜像，修复 global.transferService 未定义问题 |
| v2.1 | 2026-06-30 | 添加 Push/Pull 双向传输支持 |
| v2.0 | 2026-06-29 | 初始版本，基础文件传输功能 |

---

_文档生成时间: 2026-07-01 20:10 (Asia/Shanghai)_