/**
 * commands.js - 命令队列API路由
 * 
 * 实现EHP协议定义的所有命令API
 * POST /devices/{device_id}/commands    # 下发命令
 * GET /devices/{device_id}/commands    # 查询命令列表
 * GET /commands/{command_id}           # 获取命令详情
 * DELETE /commands/{command_id}        # 取消命令
 * POST /commands/{command_id}/callback # Webhook回调
 */
const express = require('express');
const router = express.Router();
const CommandQueueService = require('../services/commandQueueService');
const { authMiddleware } = require('../middlewares/auth');

// 服务实例（通过app.js注入）
let commandQueueService;

function setCommandQueueService(service) {
  commandQueueService = service;
}

// ========== M6: 命令拉取API（EdgeAgent调用） ==========
// 注意：这条路由必须放在 /:deviceId/commands 前面，因为更具体优先匹配

/**
 * GET /devices/:deviceId/commands/fetch
 * 设备拉取待执行命令（EdgeAgent调用，需要认证）
 */
router.get('/:deviceId/commands/fetch', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { last_id = 0, limit = 10 } = req.query;
    
    const result = await commandQueueService.fetchCommands(
      deviceId,
      parseInt(last_id),
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== M5: 命令下发API ==========

/**
 * POST /devices/:deviceId/commands
 * 下发命令到设备（AI调用，需要认证）
 */
router.post('/:deviceId/commands', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { command, priority, timeout_ms, callback_url, callback_headers } = req.body;
    
    // 参数校验
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
    
    // 优先级校验
    if (priority !== undefined && (priority < 1 || priority > 10)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'priority必须在1-10之间'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await commandQueueService.enqueueCommand(deviceId, {
      command,
      priority,
      timeout_ms,
      callback_url,
      callback_headers
    });
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});


/**
 * GET /devices/:deviceId/commands
 * 查询设备的命令列表（AI调用，需要认证）
 */
router.get('/:deviceId/commands', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    // 状态校验
    if (status && !['pending', 'running', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'status必须是pending/running/completed/failed/cancelled之一'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await commandQueueService.getCommands(deviceId, {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: result.commands,
      count: result.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== M6: 命令拉取API（EdgeAgent调用） ==========

/**
 * GET /devices/:deviceId/commands/fetch
 * 设备拉取待执行命令（EdgeAgent调用，需要认证）
 */
router.get('/:deviceId/commands/fetch', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { last_id = 0, limit = 10 } = req.query;
    
    const result = await commandQueueService.fetchCommands(
      deviceId,
      parseInt(last_id),
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== M7: 命令回调API ==========

/**
 * GET /commands/:commandId
 * 获取命令详情（AI调用，需要认证）
 */
router.get('/:commandId', authMiddleware, async (req, res, next) => {
  try {
    const { commandId } = req.params;
    
    const result = await commandQueueService.getCommand(commandId);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /commands/:commandId
 * 取消命令（AI调用，需要认证）
 */
router.delete('/:commandId', authMiddleware, async (req, res, next) => {
  try {
    const { commandId } = req.params;
    
    const result = await commandQueueService.cancelCommand(commandId);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commands/:commandId/callback
 * Webhook回调（EdgeAgent调用，无需认证）
 */
router.post('/:commandId/callback', async (req, res, next) => {
  try {
    const { commandId } = req.params;
    const { device_id, stdout, stderr, exit_code, duration_ms } = req.body;
    
    // 回调时device_id放body里
    if (!device_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'device_id为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await commandQueueService.reportCommandResult(
      device_id,
      commandId,
      { stdout, stderr, exit_code, duration_ms }
    );
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commands/:commandId/execute
 * 直接通过SSH执行命令（AI调用，需要认证）
 */
router.post('/:commandId/execute', authMiddleware, async (req, res, next) => {
  try {
    const { commandId } = req.params;
    const { device_id, timeout_ms = 30000 } = req.body;
    
    if (!device_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'device_id为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await commandQueueService.executeCommand(
      device_id,
      commandId,
      timeout_ms
    );
    
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
  setCommandQueueService
};// ========== M7: 命令查询API（支持Agent和Admin认证） ==========

/**
 * GET /commands/:commandId
 * 获取命令详情（Agent或AI调用）
 * 
 * 认证逻辑：
 * 1. Admin API Key (edgehub_secret_key) - 完全访问
 * 2. Agent API Key - 只能查询自己下发的命令
 */
router.get('/:commandId', async (req, res, next) => {
  try {
    const { commandId } = req.params;
    const apiKey = req.headers['x-api-key'];
    
    // Admin API Key - 完全访问
    if (apiKey === 'edgehub_secret_key') {
      const result = await commandQueueService.getCommand(commandId);
      return res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
    
    // Agent API Key - 验证权限
    if (apiKey) {
      const db = require('../models/database');
      const database = new db.Database();
      
      // 查询命令信息
      const command = await new Promise((resolve, reject) => {
        database.db.get(
          'SELECT * FROM commands WHERE command_id = ?',
          [commandId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (!command) {
        database.close();
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: '命令不存在' }
        });
      }
      
      // 查找Agent
      const agent = await new Promise((resolve, reject) => {
        database.db.get(
          'SELECT * FROM agents WHERE api_key = ?',
          [apiKey],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      database.close();
      
      if (!agent) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_FAILED', message: '无效的API Key' }
        });
      }
      
      // 验证Agent是否与命令关联（通过项目权限）
      const hasAccess = await new Promise((resolve, reject) => {
        database.db.get(
          `SELECT 1 FROM agent_projects ap
           JOIN project_devices pd ON pd.project_id = ap.project_id
           JOIN commands c ON c.device_id = pd.device_id
           WHERE c.command_id = ? AND ap.agent_id = ?
           UNION
           SELECT 1 FROM agents a
           WHERE a.agent_id = ? AND a.api_key = ?`,
          [commandId, agent.agent_id, agent.agent_id, apiKey],
          (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
          }
        );
      });
      
      if (hasAccess) {
        const result = await commandQueueService.getCommand(commandId);
        return res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权查看此命令' }
      });
    }
    
    // 无API Key
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_FAILED', message: '缺少API Key' }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /commands/:commandId
 * 取消命令（Agent或AI调用）
 */
router.delete('/:commandId', async (req, res, next) => {
  try {
    const { commandId } = req.params;
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少API Key' }
      });
    }
    
    // Admin - 完全权限
    if (apiKey === 'edgehub_secret_key') {
      const result = await commandQueueService.cancelCommand(commandId);
      return res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
    
    // Agent - 需要权限验证
    return res.status(403).json({
      success: false,
      error: { code: 'PERMISSION_DENIED', message: '只有管理员可以取消命令' }
    });
  } catch (error) {
    next(error);
  }
});