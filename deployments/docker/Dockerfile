# EdgeHub API Server Docker Image
# Node.js 18 + SQLite3

FROM node:18-bullseye

# 安装构建sqlite3所需的依赖
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY server/package*.json ./

# 安装依赖（生产环境）
RUN npm ci --only=production

# 复制源代码
COPY server/src/ ./src/

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/v1/stats', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 启动命令
CMD ["node", "src/app.js"]
