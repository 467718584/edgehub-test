#!/bin/bash
# EdgeHub 数据迁移脚本
# 从现有部署迁移到 Docker 环境

set -e

echo "============================================"
echo "  EdgeHub 数据迁移脚本"
echo "============================================"

# 配置
SOURCE_DIR="${1:-/opt/edgehub}"  # 默认源目录
BACKUP_DIR="./backup-$(date +%Y%m%d-%H%M%S)"
DOCKER_VOLUME="./docker-data"

echo "[1/5] 创建备份目录: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

echo "[2/5] 备份现有数据..."
if [ -d "$SOURCE_DIR/data" ]; then
    cp -r "$SOURCE_DIR/data" "$BACKUP_DIR/"
    echo "  ✓ 数据库已备份"
fi

if [ -d "$SOURCE_DIR/src/config" ]; then
    cp -r "$SOURCE_DIR/src/config" "$BACKUP_DIR/"
    echo "  ✓ 配置文件已备份"
fi

echo "[3/5] 创建 Docker 数据目录..."
mkdir -p "$DOCKER_VOLUME"

echo "[4/5] 迁移数据库..."
if [ -f "$BACKUP_DIR/data/edgehub.db" ]; then
    cp "$BACKUP_DIR/data/edgehub.db" "$DOCKER_VOLUME/"
    echo "  ✓ 数据库文件已复制到 $DOCKER_VOLUME"
else
    echo "  ⚠ 未找到现有数据库，将创建新数据库"
fi

echo "[5/5] 迁移配置（如果需要）..."
if [ -d "$BACKUP_DIR/config" ]; then
    echo "  配置文件位于: $BACKUP_DIR/config"
    echo "  请手动检查并复制需要的配置到 docker-compose.yml 中"
fi

echo ""
echo "============================================"
echo "  迁移完成！"
echo "============================================"
echo ""
echo "下一步操作："
echo "1. 确保 Docker 服务运行中: sudo systemctl start docker"
echo "2. 启动 EdgeHub 容器: docker-compose up -d"
echo "3. 检查服务状态: docker-compose ps"
echo "4. 查看日志: docker-compose logs -f edgehub-api"
echo "5. 验证 API: curl http://localhost/api/v1/stats"
echo ""
echo "如需回滚："
echo "  cp -r $BACKUP_DIR/data/* $SOURCE_DIR/data/"
echo ""
