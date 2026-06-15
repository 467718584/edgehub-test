const express = require('express');
const router = express.Router();
const DeviceService = require('../services/deviceService');
const { authMiddleware } = require('../middlewares/auth');

// 创建设备服务实例（需要通过app.js注入db）
let deviceService;

function setDeviceService(service) {
  deviceService = service;
}

// 注册设备 (EdgeAgent调用，无需认证)
router.post('/register', async (req, res, next) => {
  try {
    const deviceInfo = req.body;
    
    if (!deviceInfo.device_id || !deviceInfo.device_name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'device_id和device_name为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await deviceService.registerDevice(deviceInfo);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// 心跳 (EdgeAgent调用，无需认证)
router.post('/:deviceId/heartbeat', async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const heartbeat = req.body;
    
    const result = await deviceService.handleHeartbeat(deviceId, heartbeat);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// 获取设备列表 (需要API Key)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const devices = await deviceService.getAllDevices();
    
    res.json({
      success: true,
      data: devices,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// 获取设备详情 (需要API Key)
router.get('/:deviceId', authMiddleware, async (req, res, next) => {
  try {
    const device = await deviceService.getDevice(req.params.deviceId);
    
    res.json({
      success: true,
      data: device,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// 删除设备 (需要API Key)
router.delete('/:deviceId', authMiddleware, async (req, res, next) => {
  try {
    const result = await deviceService.deleteDevice(req.params.deviceId);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  setDeviceService
};
// WireGuard peer registration
router.post('/wireguard/register', (req, res, next) => {
  try {
    const { public_key, hostname } = req.body;
    if (!public_key) {
      return res.json({ success: false, error: 'Missing public_key' });
    }
    
    // Server's WireGuard public key (from wg0.conf)
    const serverPublicKey = '55cuT2T0o/mIgcEOzlBBhyq0+JpLHmY4JBpnuLeCkG8=';
    
    // Assign VPN IP
    const ip = '10.0.0.' + (Math.floor(Math.random() * 253) + 2);
    
    console.log('[WG] Registering peer:', hostname, '->', ip);
    
    res.json({
      success: true,
      server_public_key: serverPublicKey,
      client_vpn_ip: ip,
      endpoint: '1.13.247.173:51820',
      allowed_ips: '10.0.0.0/24'
    });
  } catch (error) {
    next(error);
  }
});
