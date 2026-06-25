/**
 * 文件传输路由 v2.0
 * 支持分块传输、断点续传、进度追踪
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

let transferService;
let wsService;

// 配置multer用于文件上传
const upload = multer({
  dest: './data/uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB限制 v2.0
  }
});

function setTransferService(service) {
  transferService = service;
}

function setWsService(service) {
  wsService = service;
}

// ========== v2.0 传输API ==========

/**
 * POST /api/v1/files/transfers
 * 创建传输任务
 */
router.post('/transfers', async (req, res, next) => {
  try {
    const { project_id, device_id, direction, local_path, remote_path, file_name, file_size, file_hash, priority } = req.body;
    
    // 验证必填参数
    if (!device_id || !direction || !remote_path) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '缺少必填参数' },
        timestamp: new Date().toISOString()
      });
    }
    
    if (!['push', 'pull'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'direction必须是push或pull' },
        timestamp: new Date().toISOString()
      });
    }
    
    // 计算文件哈希(如果需要)
    let hash = file_hash;
    if (!hash && local_path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(local_path)) {
          const fileContent = fs.readFileSync(local_path);
          hash = crypto.createHash('sha256').update(fileContent).digest('hex');
        }
      } catch (e) {
        console.error('计算文件哈希失败:', e);
      }
    }
    
    const result = await transferService.createTransfer({
      projectId: project_id,
      deviceId: device_id,
      direction,
      localPath: local_path,
      remotePath: remote_path,
      fileName: file_name || path.basename(remote_path),
      fileSize: file_size || 0,
      fileHash: hash,
      priority: priority || 3
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
 * GET /api/v1/files/transfers/:transferId
 * 获取传输状态
 */
router.get('/transfers/:transferId', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    
    const transfer = await transferService.getTransfer(transferId);
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '传输任务不存在' },
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: transfer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/files/transfers/:transferId/chunks/:chunkIndex
 * 获取分块数据 (用于push模式)
 */
router.get('/transfers/:transferId/chunks/:chunkIndex', async (req, res, next) => {
  try {
    const { transferId, chunkIndex } = req.params;
    const index = parseInt(chunkIndex);
    
    if (isNaN(index)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '无效的分块索引' },
        timestamp: new Date().toISOString()
      });
    }
    
    const chunkData = await transferService.getChunkData(transferId, index);
    
    res.json({
      success: true,
      data: chunkData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/files/transfers/:transferId/chunks
 * 接收分块数据 (用于pull模式)
 */
router.post('/transfers/:transferId/chunks', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    const { chunk_index, data, hash, is_last } = req.body;
    
    if (chunk_index === undefined || !data || !hash) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '缺少必填参数' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await transferService.receiveChunk(transferId, chunk_index, data, hash, is_last);
    
    // 通知WebSocket进度
    if (wsService) {
      wsService.broadcastTransferProgress(transferId, result);
    }
    
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
 * GET /api/v1/files/transfers/:transferId/resume
 * 获取断点续传信息
 */
router.get('/transfers/:transferId/resume', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    
    const resumeInfo = await transferService.getResumeInfo(transferId);
    
    res.json({
      success: true,
      data: resumeInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/files/transfers/:transferId
 * 取消传输
 */
router.delete('/transfers/:transferId', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    
    const result = await transferService.cancelTransfer(transferId);
    
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
 * GET /api/v1/files/transfers
 * 获取传输列表
 */
router.get('/transfers', async (req, res, next) => {
  try {
    const { device_id, status, limit = 50 } = req.query;
    
    let transfers;
    if (device_id) {
      transfers = await transferService.getDeviceTransfers(device_id, status);
    } else {
      transfers = await transferService.getDeviceTransfers(null, status);
    }
    
    res.json({
      success: true,
      data: transfers.slice(0, parseInt(limit)),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/files/stats
 * 获取传输统计
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { device_id } = req.query;
    
    const stats = await transferService.getTransferStats(device_id);
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== v1.0 兼容API (deprecated) ==========

/**
 * POST /api/v1/files/push (v1.0)
 * 推送文件到设备 - 兼容旧版
 */
router.post('/:deviceId/files/push', upload.single('file'), async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { remote_path } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'file为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    if (!remote_path) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'remote_path为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    const localFile = req.file.path;
    const result = await transferService.pushFileLegacy(deviceId, localFile, remote_path);
    
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
 * GET /api/v1/files/pull (v1.0)
 * 从设备拉取文件 - 兼容旧版
 */
router.get('/:deviceId/files/pull', async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { remote_path, local_path } = req.query;
    
    if (!remote_path) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'remote_path为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await transferService.pullFileLegacy(deviceId, remote_path, local_path);
    
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
  setTransferService,
  setWsService
};
