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
    
    // 计算文件大小和哈希(如果需要)
    let hash = file_hash;
    let size = file_size || 0;
    if (local_path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(local_path)) {
          const stats = fs.statSync(local_path);
          size = stats.size;
          if (!hash) {
            const fileContent = fs.readFileSync(local_path);
            hash = crypto.createHash('sha256').update(fileContent).digest('hex');
          }
        }
      } catch (e) {
        console.error('计算文件信息失败:', e);
      }
    }
    
    const result = await transferService.createTransfer({
      projectId: project_id,
      deviceId: device_id,
      direction,
      localPath: local_path,
      remotePath: remote_path,
      fileName: file_name || path.basename(remote_path),
      fileSize: size,
      fileHash: hash,
      priority: priority || 3
    });
    
    // 如果是push模式，立即开始发送文件
    if (direction === 'push' && result.total_chunks > 0) {
      // 异步发送文件，不阻塞响应
      setImmediate(async () => {
        try {
          await transferService.startPushTransfer(result.transfer_id, device_id);
        } catch (e) {
          console.error('[Transfer] Start push failed:', e.message);
        }
      });
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

// ========== v2.0 队列管理API ==========

/**
 * GET /api/v1/files/queue
 * 获取传输队列状态
 */
router.get('/queue', async (req, res, next) => {
  try {
    const queueStatus = transferService.getQueueStatus();
    
    res.json({
      success: true,
      data: queueStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/files/queue/priority
 * 修改传输优先级
 */
router.post('/queue/priority', async (req, res, next) => {
  try {
    const { transfer_id, priority } = req.body;
    
    if (!transfer_id || priority === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'transfer_id和priority为必填' },
        timestamp: new Date().toISOString()
      });
    }
    
    if (priority < 1 || priority > 5) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'priority必须在1-5之间' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await transferService.updateTransferPriority(transfer_id, priority);
    
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
 * DELETE /api/v1/files/queue/:transferId
 * 从队列取消传输
 */
router.delete('/queue/:transferId', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    
    const result = await transferService.cancelQueuedTransfer(transferId);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== Pull 模式 API ==========

/**
 * POST /api/v1/transfers/pull
 * 发起从设备拉取文件的请求
 */
router.post('/transfers/pull', async (req, res, next) => {
  try {
    const { project_id, device_id, remote_path, local_path, file_name, priority } = req.body;
    
    if (!device_id || !remote_path) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'device_id和remote_path为必填' },
        timestamp: new Date().toISOString()
      });
    }
    
    // 创拉取传输任务
    const result = await transferService.initiatePullTransfer({
      projectId: project_id,
      deviceId: device_id,
      remotePath: remote_path,
      localPath: local_path,
      fileName: file_name,
      priority: priority || 3
    });
    
    // 发送命令到EdgeAgent，让它读取文件并发送分块
    const { pushCommandToDevice } = require('../utils/ws-server');
    const commandId = `tf_cmd_${Date.now()}`;
    
    // EdgeAgent收到这个命令后，会读取文件并通过WebSocket发送分块
    await pushCommandToDevice(device_id, {
      command_id: commandId,
      command: `__FILE_PULL__:${result.transfer_id}:${remote_path}`,
      timeout_ms: 300000  // 5分钟超时
    });
    
    res.json({
      success: true,
      data: result,
      command_id: commandId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/transfers/:transferId/download
 * 下载Pull传输完成的文件
 */
router.get('/transfers/:transferId/download', async (req, res, next) => {
  try {
    const { transferId } = req.params;
    
    const downloadInfo = await transferService.getPullDownloadUrl(transferId);
    
    if (!downloadInfo.success) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '文件不存在' },
        timestamp: new Date().toISOString()
      });
    }
    
    // 设置下载头
    res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.file_name}"`);
    res.setHeader('Content-Length', downloadInfo.file_size);
    
    // 流式发送文件
    const fs = require('fs');
    const stream = fs.createReadStream(downloadInfo.file_path);
    stream.pipe(res);
    
    stream.on('error', (err) => {
      next(err);
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
