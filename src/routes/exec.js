const express = require('express');
const router = express.Router();
const ExecService = require('../services/execService');
const DevelopmentLogger = require('../services/developmentLogger');
const { authMiddleware } = require('../middlewares/auth');

let execService;
let db;

function setExecService(service) {
  execService = service;
}

function setDatabase(database) {
  db = database;
}

// 执行命令 (需要API Key)
router.post('/:deviceId/exec', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { command, timeout = 30000, project_id, notes } = req.body;
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'command为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const startTime = Date.now();
    const result = await execService.exec(deviceId, command, timeout);
    const duration = Date.now() - startTime;
    
    // 自动记录到开发日志（如果提供了project_id）
    if (db && project_id) {
      const devLogger = new DevelopmentLogger(db);
      await devLogger.log({
        project_id: parseInt(project_id),
        device_id: deviceId,
        action_type: 'command',
        command,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exit_code: result.exit_code || 0,
        duration_ms: duration,
        success: result.exit_code === 0,
        notes: notes || ''
      });
    }
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// 获取设备状态 (需要API Key)
router.get('/:deviceId/status', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    
    const status = await execService.getStatus(deviceId);
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  router,
  setExecService,
  setDatabase
};