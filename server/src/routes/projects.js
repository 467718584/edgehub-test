const express = require('express');
const router = express.Router();
const Database = require('../models/database');
const { authMiddleware } = require('../middlewares/auth');

const db = new Database(process.env.DB_PATH || './data/edgehub.db');

// ========== 项目管理 ==========

// 获取设备的所有项目
router.get('/devices/:deviceId/projects', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const projects = await db.getProjectsByDevice(deviceId);
    const stats = await db.getProjectStats(deviceId);
    
    res.json({
      success: true,
      data: {
        projects,
        stats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建设备上的新项目
router.post('/devices/:deviceId/projects', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { project_name, project_path, description, priority } = req.body;
    
    if (!project_name || !project_path) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'project_name and project_path are required' }
      });
    }
    
    const project = await db.createProject({
      device_id: deviceId,
      project_name,
      project_path,
      description,
      priority
    });
    
    res.json({
      success: true,
      data: project,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有项目（跨设备）
router.get('/projects', authMiddleware, async (req, res) => {
  try {
    const projects = await db.getAllProjects();
    
    res.json({
      success: true,
      data: projects,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取项目详情
router.get('/projects/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await db.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    const logs = await db.getDevelopmentLogs(projectId);
    const debugs = await db.getDebugRecords(projectId);
    
    res.json({
      success: true,
      data: {
        project,
        logs,
        debugs
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新项目
router.put('/projects/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;
    
    await db.updateProject(projectId, updates);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除项目
router.delete('/projects/:projectId', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    await db.deleteProject(projectId);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 开发记录 ==========

// 获取项目的开发记录
router.get('/projects/:projectId/logs', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const logs = await db.getDevelopmentLogs(projectId, limit);
    
    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 记录新的开发行为
router.post('/projects/:projectId/logs', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { action_type, command, stdout, stderr, exit_code, duration_ms, success, notes } = req.body;
    
    const project = await db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    await db.logDevelopment({
      project_id: parseInt(projectId),
      device_id: project.device_id,
      action_type,
      command,
      stdout,
      stderr,
      exit_code,
      duration_ms,
      success,
      notes
    });
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取设备的最近记录
router.get('/devices/:deviceId/logs/recent', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const logs = await db.getRecentLogs(deviceId, limit);
    
    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有最近记录
router.get('/logs/recent', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await db.getAllRecentLogs(limit);
    
    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 调试记录 ==========

// 获取项目的调试记录
router.get('/projects/:projectId/debugs', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const debugs = await db.getDebugRecords(projectId);
    
    res.json({
      success: true,
      data: debugs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加调试记录
router.post('/projects/:projectId/debugs', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { issue_title, issue_description, files_modified, outcome } = req.body;
    
    if (!issue_title) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'issue_title is required' }
      });
    }
    
    const project = await db.getProject(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    await db.createDebugRecord({
      project_id: parseInt(projectId),
      device_id: project.device_id,
      issue_title,
      issue_description,
      files_modified,
      outcome
    });
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新调试记录
router.put('/projects/:projectId/debugs/:debugId', authMiddleware, async (req, res) => {
  try {
    const { debugId } = req.params;
    const updates = req.body;
    
    await db.updateDebugRecord(parseInt(debugId), updates);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 项目文件传输 ==========

// 获取项目的文件传输历史
router.get('/projects/:projectId/transfers', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, direction, limit = 50 } = req.query;
    
    // 验证项目存在
    const project = await db.getProject(parseInt(projectId));
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    
    // 从 file_transfers 表获取项目关联的传输记录
    const transfers = await db.all(`
      SELECT * FROM file_transfers 
      WHERE project_id = ? 
      ${status ? " AND status = '" + status + "'" : ''}
      ${direction ? " AND direction = '" + direction + "'" : ''}
      ORDER BY created_at DESC 
      LIMIT ?
    `, [parseInt(projectId), parseInt(limit)]);
    
    res.json({
      success: true,
      data: transfers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取项目的文件传输统计
router.get('/projects/:projectId/transfers/stats', authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status IN ('pending', 'transferring') THEN 1 ELSE 0 END) as in_progress,
        SUM(file_size) as total_bytes,
        SUM(CASE WHEN direction = 'push' THEN 1 ELSE 0 END) as push_count,
        SUM(CASE WHEN direction = 'pull' THEN 1 ELSE 0 END) as pull_count
      FROM file_transfers 
      WHERE project_id = ?
    `, [parseInt(projectId)]);
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== 统计 ==========

// 获取总体统计
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await db.getOverallStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;