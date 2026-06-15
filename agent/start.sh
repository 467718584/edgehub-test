#!/bin/bash
# EdgeAgent启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "EdgeAgent 启动中..."

# 检查Python版本
python3 --version || { echo "Python3未安装"; exit 1; }

# 安装依赖
if [ ! -f "venv/bin/activate" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

# 启动
echo "启动EdgeAgent..."
python3 agent.py "$@"