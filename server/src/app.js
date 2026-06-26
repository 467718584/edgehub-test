const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const Logger = require('./utils/logger');
const Database = require('./models/database');
const DeviceService = require('./services/deviceService');
const ExecService = require('./services/execService');
const { initWebSocket } = require('./utils/ws-server');
const FileService = require('./services/fileService');
const CommandQueueService = require('./services/commandQueueService');
const DevelopmentLogger = require('./services/developmentLogger');
const { errorHandler } = require('./middlewares/errorHandler');
const { router: devicesRouter, setDeviceService } = require('./routes/devices');
const { router: execRouter, setExecService, setDatabase } = require('./routes/exec');
const { router: filesRouter, setTransferService, setWsService } = require('./routes/files');
const TransferService = require('./services/transferService');
const { router: commandsRouter, setCommandQueueService } = require('./routes/commands');
const projectsRouter = require('./routes/projects');
const projectEnhance = require('./routes/projectEnhance');
const { router: agentsRouter, setAgentDatabase } = require('./routes/agents');
const { setDatabase: setAuthDatabase } = require('./middlewares/auth');

// 初始化日志
const logger = new Logger(config.log.path);

// 确保必要目录存在
const dirs = [
  config.db.path.replace(/[^/]+$/, ''),
  config.log.path,
  './data/uploads',
  './data/downloads'
];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 初始化数据库
const db = new Database(config.db.path);; global.db = db;

// 初始化开发日志服务
const globalDevLogger = new DevelopmentLogger(db);

// 初始化服务
const deviceService = new DeviceService(db);
const execService = new ExecService(db);
const transferService = new TransferService(db);
const commandQueueService = new CommandQueueService(db, execService.sshPool);

// 初始化传输服务表
transferService.initTables();

// 设置路由的服务实例
setDeviceService(deviceService);
setExecService(execService);
setTransferService(transferService);
setDatabase(db);
setCommandQueueService(commandQueueService);
setAgentDatabase(db);
setAuthDatabase(db);

// 设置全局变量供ws-server.js使用
global.transferService = transferService;
global.commandService = commandQueueService;

// 创建Express应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// 自动记录所有API调用到开发日志（排除health检查和静态资源）
app.use((req, res, next) => {
  // 跳过健康检查和静态资源
  if (req.path === '/health' || req.path.startsWith('/web/') || req.path.includes('.')) {
    return next();
  }
  
  // 在请求开始时捕获需要的数据
  const capturedData = {
    method: req.method,
    path: req.path,
    body: req.body,
    params: req.params
  };
  
  // 使用res.on('finish')监听响应完成
  res.on('finish', () => {
    // 记录API调用（主要是POST和PUT）
    if (['POST', 'PUT', 'PATCH'].includes(capturedData.method) && capturedData.path.includes('/api/')) {
      try {
        // 从捕获的数据中提取
        let deviceId = capturedData.body?.device_id || capturedData.params?.deviceId || capturedData.params?.id;
        let projectId = capturedData.body?.project_id || capturedData.params?.projectId;
        
        // 如果没有device_id，尝试从路径提取
        if (!deviceId && capturedData.path.includes('/devices/')) {
          const match = capturedData.path.match(/\/devices\/([^\/]+)/);
          if (match) deviceId = match[1];
        }
        
        // 从路径提取project_id
        if (!projectId && capturedData.path.includes('/projects/')) {
          const match = capturedData.path.match(/\/projects\/(\d+)/);
          if (match) projectId = parseInt(match[1]);
        }
        
        if (deviceId) {
          globalDevLogger.log({
            device_id: deviceId,
            project_id: projectId || null,
            action_type: 'api_call',
            command: capturedData.method + ' ' + capturedData.path,
            notes: 'API调用: ' + capturedData.method + ' ' + capturedData.path + ' -> ' + res.statusCode,
            success: res.statusCode < 400,
            exit_code: res.statusCode
          }).catch(e => console.error('[DevLogger] Auto-log failed:', e.message));
        }
      } catch (e) {
        // 静默失败，不影响主流程
      }
    }
  });
  
  next();
});

// 导出globalDevLogger供路由使用
global.globalDevLogger = globalDevLogger;

// 路由
app.use('/api/v1/devices', devicesRouter);
app.use('/api/v1/devices', execRouter);
app.use('/api/v1', filesRouter);
app.use('/api/v1/devices', commandsRouter);
app.use('/api/v1/commands', commandsRouter);
app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1', projectsRouter);
app.use('/api/v1/projects', projectEnhance);

// Web UI (在API之后，避免路径冲突)
app.use('/web', express.static(path.join(__dirname, '../web')));

// Web UI路由 - 确保API路径优先
app.get('/web/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// 错误处理
app.use(errorHandler);

// 启动服务器
const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`EdgeHub API服务已启动，端口: ${config.port}`);
  logger.info(`数据库路径: ${config.db.path}`);
});

// Initialize WebSocket
const wsExport = initWebSocket(server);
setWsService(wsExport);
// 导出ws-server的函数到global供transferService使用
const { sendToDevice } = require('./utils/ws-server');
global.wsService = { ...wsExport, sendToDevice };
// Start sysinfo polling for all online devices
const { startSysinfoPolling } = require('./services/sysinfoPolling');
startSysinfoPolling(60000); // 1 minute

// 优雅退出
process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，正在关闭...');
  server.close(() => {
    db.close();
    logger.close();
    process.exit(0);
  });
});


// Heartbeat timeout checker - runs every 60 seconds
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function checkDeviceHeartbeats() {
  try {
    const devices = await db.getAllDevices();
    const now = Date.now();
    
    for (const device of devices) {
      if (device.last_heartbeat) {
        const lastHb = new Date(device.last_heartbeat.endsWith('Z') ? device.last_heartbeat : device.last_heartbeat + 'Z').getTime();
        if (now - lastHb > HEARTBEAT_TIMEOUT_MS && device.status !== 'offline') {
          console.log('[WARN] Device', device.device_name, 'heartbeat timeout, marking offline');
          await db.updateDeviceStatus(device.device_id, 'offline');
        }
      }
    }
  } catch (error) {
    console.error('[ERROR] Heartbeat checker failed:', error.message);
  }
}

// Start heartbeat checker every 60 seconds
setInterval(checkDeviceHeartbeats, 60000);
console.log('[INFO] Heartbeat timeout checker started (5min timeout)');


module.exports = app;
// WireGuard peer registration endpoint
app.post('/wireguard/register', async (req, res) => {
  const { public_key, hostname } = req.body;
  if (!public_key) {
    return res.json({ success: false, error: 'Missing public_key' });
  }
  
  // Server's public key (from wg0.conf)
  const serverPublicKey = '55cuT2T0o/mIgcEOzlBBhyq0+JpLHmY4JBpnuLeCkG8=';
  
  // Generate client IP (10.0.0.X)
  const ip = '10.0.0.' + (Math.floor(Math.random() * 253) + 2);
  
  console.log('[WG] Registering peer:', hostname, public_key.substring(0, 20), '->', ip);
  
  res.json({
    success: true,
    server_public_key: serverPublicKey,
    client_vpn_ip: ip,
    endpoint: '1.13.247.173:51820',
    allowed_ips: '10.0.0.0/24'
  });
});

// WireGuard peer registration - placed at correct location

// 增强项目路由
