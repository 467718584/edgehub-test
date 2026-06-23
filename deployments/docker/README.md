# EdgeHub Docker 部署指南

## 📋 概述

本文档描述如何使用 Docker 和 Docker Compose 部署 EdgeHub 边缘设备管理系统。

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────┐
│                      用户浏览器                          │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/HTTPS
                  ▼
┌─────────────────────────────────────────────────────────┐
│                    Nginx (反向代理)                       │
│                  edgehub-nginx:80                        │
│         ┌─────────────────┬─────────────────┐           │
│         │  /edgehub-api/* │  /edgehub-web/* │           │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │
          ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│  EdgeHub API    │  │   Web UI        │
│ edgehub-api     │  │ (静态文件)       │
│   :8080         │  │                 │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│  SQLite DB      │
│ (持久化卷)       │
└─────────────────┘
```

## 🚀 快速开始

### 前提条件

- Docker >= 20.10
- Docker Compose >= 2.0
- 服务器端口 80 可用

### 1. 准备代码

```bash
# 克隆或更新代码
cd ~/workspace/edgehub-test

# 拉取最新代码
git pull origin main
```

### 2. 现有数据迁移（如有）

```bash
cd deployments/docker

# 运行迁移脚本（会自动备份现有数据）
./scripts/migrate-data.sh /opt/edgehub

# 或手动指定源目录
./scripts/migrate-data.sh /path/to/your/edgehub
```

### 3. 构建并启动

```bash
cd deployments/docker

# 构建镜像（首次运行或代码更新后）
docker-compose build

# 启动服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f edgehub-api
```

### 4. 验证部署

```bash
# 检查 API 健康
curl http://localhost/api/v1/stats

# 检查 Web UI
curl http://localhost/edgehub-web/

# 检查 WebSocket
wscat -c ws://localhost/v1/ws/events
```

## 📁 目录结构

```
deployments/docker/
├── Dockerfile              # API 服务镜像定义
├── docker-compose.yml      # 完整服务编排
├── nginx/
│   ├── nginx.conf          # Nginx 主配置
│   └── conf.d/
│       └── edgehub.conf    # EdgeHub 站点配置
├── scripts/
│   └── migrate-data.sh     # 数据迁移脚本
├── .dockerignore
└── README.md（本文件）
```

## 🔧 配置说明

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | production | 运行环境 |
| `PORT` | 8080 | API 服务端口 |

### 端口映射

| 主机端口 | 容器端口 | 服务 |
|----------|----------|------|
| 80 | 80 | Nginx（HTTP） |
| 443 | 443 | Nginx（HTTPS，可选） |
| 8080 | 8080 | EdgeHub API（开发调试用） |

### 数据持久化

- **数据库**: Docker volume `edgehub-data` → `/app/data/`
- **配置文件**: 建议通过环境变量或挂载 `src/config`

## 🔄 日常运维

### 更新版本

```bash
# 1. 拉取新代码
git pull origin main

# 2. 重新构建
docker-compose build

# 3. 重启服务（自动滚动更新）
docker-compose up -d --force-recreate

# 4. 检查状态
docker-compose ps
docker-compose logs -f edgehub-api
```

### 备份数据

```bash
# 备份数据库
docker exec edgehub-api tar -czf /tmp/backup.tar.gz /app/data
docker cp edgehub-api:/tmp/backup.tar.gz ./edgehub-backup-$(date +%Y%m%d).tar.gz

# 或直接拷贝 volume
docker run --rm -v edgehub/docker-edgehub-data:/data -v $(pwd):/backup alpine tar czf /backup/edgehub-data.tar.gz -C /data .
```

### 回滚版本

```bash
# 停止服务
docker-compose down

# 恢复数据库
cp backup-YYYYMMDD-HHMMSS/data/edgehub.db ./docker-data/

# 重新启动
docker-compose up -d
```

### 停止服务

```bash
docker-compose down

# 完全删除（包括数据卷）
docker-compose down -v
```

## 🌐 访问地址

| 服务 | 地址 |
|------|------|
| Web UI | http://你的服务器/edgehub-web/ |
| API 端点 | http://你的服务器/edgehub-api/v1/ |
| WebSocket | ws://你的服务器/v1/ws/events |
| 健康检查 | http://你的服务器/health |

## 🔐 安全建议

### 生产环境必做

1. **启用 HTTPS**
   ```bash
   # 复制证书到 deployments/docker/nginx/ssl/
   # 取消 nginx/conf.d/edgehub.conf 中 HTTPS server 块的注释
   ```

2. **修改默认 API Key**
   ```yaml
   # 在 docker-compose.yml 中添加环境变量
   environment:
     - API_KEY=your_new_secret_key
   ```

3. **限制端口访问**
   ```bash
   # 只开放 80/443
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 8080/tcp
   ```

4. **定期更新镜像**
   ```bash
   # 定期执行
   docker-compose pull
   docker-compose up -d
   ```

## 🐛 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker-compose logs --tail=100 edgehub-api

# 检查容器内部
docker exec -it edgehub-api /bin/sh
```

### API 返回 502

```bash
# 检查 API 是否健康
docker exec edgehub-api curl -s http://localhost:8080/api/v1/stats

# 检查网络连接
docker network inspect edgehub-docker_edgehub-network
```

### 数据库连接错误

```bash
# 检查 volume 挂载
docker exec edgehub-api ls -la /app/data/

# 重建数据库（如需）
docker exec edgehub-api node -e "const db = require('./src/models/database'); db.init();"
```

## 📞 获取帮助

- 官方文档: https://github.com/467718584/edgehub-test
- 问题反馈: https://github.com/467718584/edgehub-test/issues
