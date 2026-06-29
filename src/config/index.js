module.exports = {
  // 服务端口
  port: 8080,
  
  // API认证
  apiKey: process.env.EDGEHUB_API_KEY || 'edgehub_secret_key',
  
  // 数据库
  db: {
    path: process.env.DB_PATH || './data/edgehub.db'
  },
  
  // WireGuard VPN配置
  vpn: {
    serverIp: '10.0.0.1',
    network: '10.0.0.0/24',
    port: 51820
  },
  
  // SSH配置（通过VPN内网直连）
  ssh: {
    defaultUsername: 'ubuntu',
    poolSize: 5,
    timeout: 30000
  },
  
  // 日志
  log: {
    level: process.env.LOG_LEVEL || 'info',
    path: './logs/'
  }
};