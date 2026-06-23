#!/bin/bash
# EdgeAgent RK3588 一键安装脚本 (WebSocket模式，无需VPN)
# 适用设备: RK3588 / Linux ARM64
# EdgeHub服务器: http://1.13.247.173

set -e

echo "=============================================="
echo "  EdgeAgent RK3588 一键安装脚本"
echo "  (WebSocket模式，无需VPN)"
echo "=============================================="

# 配置
EDGEHUB_URL="http://1.13.247.173/api/v1"
DEVICE_ID="82b2731d58533598"
DEVICE_NAME="RK3588"
INSTALL_DIR="/opt/edgeagent"

# 检查root权限
if [ "$EUID" -ne 0 ]; then
    echo "请使用 sudo 或 root 账户运行"
    exit 1
fi

echo "[1/6] 创建安装目录..."
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

echo "[2/6] 安装Python依赖..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip git > /dev/null 2>&1
pip3 install -q requests>=2.28.0 psutil>=5.9.0

echo "[3/6] 下载EdgeAgent代码..."
if [ -d "/tmp/edgehub-tmp" ]; then
    rm -rf /tmp/edgehub-tmp
fi
git clone -q https://github.com/467718584/edgehub-test.git /tmp/edgehub-tmp
cp /tmp/edgehub-tmp/agent/agent.py $INSTALL_DIR/
cp /tmp/edgehub-tmp/agent/config.py $INSTALL_DIR/
cp /tmp/edgehub-tmp/agent/services/*.py $INSTALL_DIR/services/ 2>/dev/null || mkdir -p $INSTALL_DIR/services
cp /tmp/edgehub-tmp/agent/utils/*.py $INSTALL_DIR/utils/ 2>/dev/null || mkdir -p $INSTALL_DIR/utils
rm -rf /tmp/edgehub-tmp

echo "[4/6] 创建配置文件..."
cat > $INSTALL_DIR/config.json << EOF
{
  "edgehub_url": "$EDGEHUB_URL",
  "api_key": "edgehub_secret_key",
  "device_id": "$DEVICE_ID",
  "device_name": "$DEVICE_NAME",
  "heartbeat_interval": 32,
  "command_poll_interval": 5
}
EOF

echo "[5/6] 创建systemd服务..."
cat > /etc/systemd/system/edgehub-agent.service << EOF
[Unit]
Description=EdgeHub Agent (WebSocket Mode)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $INSTALL_DIR/agent.py
Restart=always
RestartSec=10
User=root
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

echo "[6/6] 启动服务..."
systemctl daemon-reload
systemctl enable edgehub-agent
systemctl restart edgehub-agent

sleep 3

echo ""
echo "=============================================="
echo "  安装完成！"
echo "=============================================="
echo ""
echo "服务状态:"
systemctl status edgehub-agent --no-pager || true
echo ""
echo "最近日志:"
journalctl -u edgehub-agent -n 10 --no-pager || true
echo ""
echo "配置文件: $INSTALL_DIR/config.json"
echo "日志查看: journalctl -u edgehub-agent -f"
