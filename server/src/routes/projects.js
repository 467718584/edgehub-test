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

// ========== 项目子记录(Project Records) ==========

// 获取项目的所有子记录
router.get('/projects/:projectId/records', authMiddleware, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const records = await db.getProjectRecords(projectId);
    
    // 按状态分组统计
    const stats = {
      total: records.length,
      pending: records.filter(r => r.status === 'pending').length,
      in_progress: records.filter(r => r.status === 'in_progress').length,
      completed: records.filter(r => r.status === 'completed').length
    };
    
    res.json({
      success: true,
      data: { records, stats },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 创建项目子记录
router.post('/projects/:projectId/records', authMiddleware, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { title, description, status, record_type, agent_id } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'title is required' }
      });
    }
    
    const recordId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const record = await db.createProjectRecord({
      record_id: recordId,
      project_id: projectId,
      title,
      description,
      status: status || 'pending',
      record_type: record_type || 'task',
      agent_id
    });
    
    res.json({
      success: true,
      data: record,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个子记录
router.get('/records/:recordId', authMiddleware, async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await db.getProjectRecord(recordId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' }
      });
    }
    
    res.json({
      success: true,
      data: record,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新子记录
router.put('/records/:recordId', authMiddleware, async (req, res) => {
  try {
    const { recordId } = req.params;
    const updates = req.body;
    
    const result = await db.updateProjectRecord(recordId, updates);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除子记录
router.delete('/records/:recordId', authMiddleware, async (req, res) => {
  try {
    const { recordId } = req.params;
    const result = await db.deleteProjectRecord(recordId);
    
    res.json({
      success: true,
      data: result,
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