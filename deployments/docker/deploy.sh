#!/bin/bash
# EdgeHub Docker 一键部署脚本
# Usage: ./deploy.sh [--migrate] [--skip-build]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认参数
DO_MIGRATE=false
SKIP_BUILD=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --migrate)
            DO_MIGRATE=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            log_error "未知参数: $1"
            exit 1
            ;;
    esac
done

echo "============================================"
echo "  EdgeHub Docker 部署脚本"
echo "============================================"

# 1. 检查 Docker
log_info "检查 Docker 环境..."
if ! command -v docker &> /dev/null; then
    log_error "Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_error "Docker Compose 未安装"
    exit 1
fi

DOCKER_COMPOSE="docker-compose"
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
fi

log_info "Docker: $(docker --version)"
log_info "Docker Compose: $($DOCKER_COMPOSE --version)"

# 2. 数据迁移
if [ "$DO_MIGRATE" = true ]; then
    log_info "执行数据迁移..."
    ./scripts/migrate-data.sh /opt/edgehub
fi

# 3. 构建镜像
if [ "$SKIP_BUILD" = false ]; then
    log_info "构建 Docker 镜像..."
    $DOCKER_COMPOSE build --no-cache
fi

# 4. 启动服务
log_info "启动 EdgeHub 服务..."
$DOCKER_COMPOSE up -d

# 5. 等待服务健康
log_info "等待服务启动..."
sleep 5

# 6. 检查状态
log_info "检查服务状态..."
$DOCKER_COMPOSE ps

# 7. 验证 API
log_info "验证 API 健康..."
sleep 3
if curl -s http://localhost/api/v1/stats > /dev/null 2>&1; then
    log_info "✓ API 服务正常"
else
    log_warn "API 响应异常，请检查日志: $DOCKER_COMPOSE logs edgehub-api"
fi

# 8. 显示访问信息
echo ""
echo "============================================"
echo "  部署完成！"
echo "============================================"
echo ""
echo "访问地址："
echo "  Web UI:   http://localhost/edgehub-web/"
echo "  API:     http://localhost/edgehub-api/v1/"
echo "  Health:  http://localhost/health"
echo ""
echo "常用命令："
echo "  查看日志:   $DOCKER_COMPOSE logs -f edgehub-api"
echo "  重启服务:   $DOCKER_COMPOSE restart"
echo "  停止服务:   $DOCKER_COMPOSE down"
echo "  更新版本:   git pull && $DOCKER_COMPOSE up -d --force-recreate"
echo ""
