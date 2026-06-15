const express = require('express');
const router = express.Router();
const multer = require('multer');
const FileService = require('../services/fileService');
const { authMiddleware } = require('../middlewares/auth');

let fileService;

// 配置multer用于文件上传
const upload = multer({
  dest: './data/uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB限制
  }
});

function setFileService(service) {
  fileService = service;
}

// 推送文件到设备 (需要API Key)
router.post('/:deviceId/files/push', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { remote_path } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'file为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (!remote_path) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'remote_path为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const localFile = req.file.path;
    const result = await fileService.pushFile(deviceId, localFile, remote_path);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// 从设备拉取文件 (需要API Key)
router.get('/:deviceId/files/pull', authMiddleware, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { remote_path, local_path } = req.query;
    
    if (!remote_path) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'remote_path为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await fileService.pullFile(deviceId, remote_path, local_path);
    
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
  setFileService
};