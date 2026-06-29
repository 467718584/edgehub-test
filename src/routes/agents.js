const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pushCommandToDevice } = require('../utils/ws-server');

// We need to access the database through deviceService since that's what's injected
let db;

function setAgentDatabase(database) {
  db = database;
}

// Get all agents with their projects and devices
router.get('/', async (req, res, next) => {
  try {
    const agents = await new Promise((resolve, reject) => {
      db.db.all('SELECT * FROM agents ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const result = [];
    for (const agent of agents) {
      const projects = await new Promise((resolve, reject) => {
        db.db.all(`
          SELECT p.*, ap.role 
          FROM agent_projects ap 
          JOIN projects p ON ap.project_id = p.id 
          WHERE ap.agent_id = ?
        `, [agent.agent_id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const devices = await new Promise((resolve, reject) => {
        db.db.all(`
          SELECT DISTINCT d.*
          FROM project_devices pd 
          JOIN devices d ON pd.device_id = d.device_id 
          WHERE pd.project_id IN (SELECT project_id FROM agent_projects WHERE agent_id = ?)
        `, [agent.agent_id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      result.push({
        ...agent,
        api_key: undefined, // Hide API key in list
        projects: projects || [],
        devices: devices || []
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

// Get single agent
router.post('/me/login', async (req, res, next) => {
  try {
    const { agent_id, api_key } = req.body;
    
    if (!agent_id || !api_key) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'agent_id和api_key为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE agent_id = ? AND api_key = ?', [agent_id, api_key], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'agent_id或api_key无效' },
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        agent_type: agent.agent_type,
        capabilities: JSON.parse(agent.capabilities || '{}'),
        status: agent.status,
        registered_at: agent.created_at
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/agents/me
 * 获取当前智能体自身信息（通过Header中的API Key认证）
 */
router.get('/me', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const projects = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT p.*, ap.role 
        FROM agent_projects ap 
        JOIN projects p ON ap.project_id = p.id 
        WHERE ap.agent_id = ?
        ORDER BY p.created_at DESC
      `, [agent.agent_id], (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    
    const devices = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT DISTINCT d.*
        FROM project_devices pd 
        JOIN devices d ON pd.device_id = d.device_id 
        WHERE pd.project_id IN (SELECT project_id FROM agent_projects WHERE agent_id = ?)
      `, [agent.agent_id], (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    
    res.json({
      success: true,
      data: {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        agent_type: agent.agent_type,
        capabilities: JSON.parse(agent.capabilities || '{}'),
        status: agent.status,
        registered_at: agent.created_at,
        projects: projects || [],
        devices: devices || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/agents/me/projects
 * 列出当前智能体关联的所有项目
 */
router.get('/me/projects', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const projects = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT p.*, ap.role 
        FROM agent_projects ap 
        JOIN projects p ON ap.project_id = p.id 
        WHERE ap.agent_id = ?
        ORDER BY p.created_at DESC
      `, [agent.agent_id], (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
    
    res.json({
      success: true,
      data: projects,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/me/projects
 * 为当前智能体创建新项目
 */
router.post('/me/projects', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { project_name, device_id, project_path, description, priority } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    if (!project_name || !device_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'project_name和device_id为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const device = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM devices WHERE device_id = ?', [device_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '设备不存在' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT INTO projects (device_id, project_name, project_path, description, priority, status, created_at, last_activity)
        VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
      `, [device_id, project_name, project_path || '', description || '', priority || 5], function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
    
    const projectId = result.lastID;
    
    await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT INTO agent_projects (agent_id, project_id, role)
        VALUES (?, ?, 'owner')
      `, [agent.agent_id, projectId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT OR IGNORE INTO project_devices (project_id, device_id)
        VALUES (?, ?)
      `, [projectId, device_id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({
      success: true,
      data: {
        project_id: projectId,
        project_name,
        device_id,
        status: 'active',
        created_at: new Date().toISOString()
      },
      message: '项目创建成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/agents/me/projects/:projectId
 * 获取项目详情
 */
router.get('/me/projects/:projectId', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ?
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权访问此项目' },
        timestamp: new Date().toISOString()
      });
    }
    
    const project = await new Promise((resolve, reject) => {
      db.db.get('SELECT id, device_id, project_name, project_path, description, status, priority, created_at, last_activity FROM projects WHERE id = ?', [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '项目不存在' },
        timestamp: new Date().toISOString()
      });
    }
    
    const logs = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT * FROM development_logs 
        WHERE project_id = ? 
        ORDER BY id DESC 
        LIMIT 20
      `, [projectId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: {
        ...project,
        role: relation.role,
        logs: logs || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/agents/me/projects/:projectId
 * 更新项目信息
 */
router.put('/me/projects/:projectId', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    const { project_name, description, priority, status } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ? AND role IN ('owner', 'developer')
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权更新此项目' },
        timestamp: new Date().toISOString()
      });
    }
    
    const updates = [];
    const values = [];
    if (project_name) { updates.push('project_name = ?'); values.push(project_name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
    if (status) { updates.push('status = ?'); values.push(status); }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '没有提供要更新的字段' },
        timestamp: new Date().toISOString()
      });
    }
    
    values.push(projectId);
    
    const result = await new Promise((resolve, reject) => {
      db.db.run(`
        UPDATE projects SET ${updates.join(', ')} WHERE id = ?
      `, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      message: '项目更新成功',
      changes: result.changes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/agents/me/projects/:projectId
 * 删除项目（仅owner）
 */
router.delete('/me/projects/:projectId', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ? AND role = 'owner'
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '只有项目owner才能删除项目' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await new Promise((resolve, reject) => {
      db.db.run('DELETE FROM projects WHERE id = ?', [projectId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      message: '项目已删除',
      changes: result.changes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/me/projects/:projectId/logs
 * 添加开发日志
 */
router.post('/me/projects/:projectId/logs', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    const { action_type, command, notes } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ?
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权访问此项目' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT INTO development_logs (project_id, action_type, command, notes, success, device_id)
        VALUES (?, ?, ?, ?, 1, '')
      `, [projectId, action_type || 'command', command || '', notes || ''], function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
    
    db.db.run(`
      UPDATE projects SET last_activity = datetime('now') WHERE id = ?
    `, [projectId], (err) => { if (err) console.error('更新活跃时间失败:', err); });
    
    res.json({
      success: true,
      data: { log_id: result.lastID },
      message: '日志已添加',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/me/projects/:projectId/commands
 * 在项目关联的设备上执行命令
 */
router.post('/me/projects/:projectId/commands', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    const { command, timeout } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' },
        timestamp: new Date().toISOString()
      });
    }
    
    if (!command) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'command为必填项' },
        timestamp: new Date().toISOString()
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' },
        timestamp: new Date().toISOString()
      });
    }
    
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ?
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权访问此项目' },
        timestamp: new Date().toISOString()
      });
    }
    
    const device = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT pd.device_id, d.status 
        FROM project_devices pd 
        JOIN devices d ON pd.device_id = d.device_id 
        WHERE pd.project_id = ?
      `, [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '项目未关联任何设备' },
        timestamp: new Date().toISOString()
      });
    }
    
    const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    
    // 插入命令到数据库（包含project_id）
    await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT INTO commands (command_id, device_id, command, status, timeout_ms, created_at, project_id)
        VALUES (?, ?, ?, 'pending', ?, datetime('now'), ?)
      `, [commandId, device.device_id, command, (timeout || 60) * 1000, projectId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 记录到项目开发日志
    try {
      await new Promise((resolve, reject) => {
        db.db.run(`
          INSERT INTO development_logs (project_id, device_id, action_type, command, notes, success, timestamp)
          VALUES (?, ?, 'command', ?, ?, 1, datetime('now'))
        `, [projectId, device.device_id, command, '通过项目端点下发命令'], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (logErr) {
      console.log('[WARN] Failed to log development:', logErr.message);
    }
    
    // 尝试通过 WebSocket 推送命令到设备
    let finalStatus = 'pending';
    let mode = 'http_poll';
    try {
      const wsResult = await pushCommandToDevice(device.device_id, {
        command_id: commandId,
        command: command,
        timeout_ms: (timeout || 60) * 1000
      });
      if (wsResult.success) {
        finalStatus = 'delivered_via_ws';
        mode = 'ws';
      }
    } catch (wsErr) {
      console.log('[WARN] WS push failed, falling back to HTTP poll:', wsErr.message);
    }
    
    // 更新命令状态
    await new Promise((resolve, reject) => {
      db.db.run(`
        UPDATE commands SET status = ? WHERE command_id = ?
      `, [finalStatus, commandId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({
      success: true,
      data: {
        command_id: commandId,
        device_id: device.device_id,
        status: finalStatus,
        mode: mode
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== /agents/me 路由结束 ==========// ========== 智能体项目任务 API (/agents/me/projects/:id/tasks) ==========

/**
 * GET /api/v1/agents/me/projects/:projectId/tasks
 * 获取项目的所有任务（待办+已完成）
 */
router.get('/me/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' }
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' }
      });
    }
    
    // 检查项目权限
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ?
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权访问此项目' }
      });
    }
    
    // 获取任务列表
    const tasks = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT * FROM project_tasks 
        WHERE project_id = ? 
        ORDER BY priority DESC, created_at DESC
      `, [projectId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 按状态分组
    const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const completed = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');
    
    res.json({
      success: true,
      data: { pending, completed },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/me/projects/:projectId/tasks
 * 添加新任务
 */
router.post('/me/projects/:projectId/tasks', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId } = req.params;
    const { title, description, priority } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' }
      });
    }
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'title为必填项' }
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' }
      });
    }
    
    // 检查项目权限
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ?
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权访问此项目' }
      });
    }
    
    // 创建任务
    const result = await new Promise((resolve, reject) => {
      db.db.run(`
        INSERT INTO project_tasks (project_id, title, description, status, priority, created_at)
        VALUES (?, ?, ?, 'pending', ?, datetime('now'))
      `, [projectId, title, description || '', priority || 5], function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      data: {
        task_id: result.lastID,
        title,
        status: 'pending',
        priority: priority || 5,
        created_at: new Date().toISOString()
      },
      message: '任务已添加',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/agents/me/projects/:projectId/tasks/:taskId
 * 更新任务状态
 */
router.put('/me/projects/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId, taskId } = req.params;
    const { status, notes } = req.body;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' }
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' }
      });
    }
    
    // 检查任务所属项目权限
    const task = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT t.* FROM project_tasks t
        JOIN agent_projects ap ON t.project_id = ap.project_id
        WHERE t.id = ? AND ap.agent_id = ?
      `, [taskId, agent.agent_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!task) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权操作此任务' }
      });
    }
    
    // 构建更新
    const updates = [];
    const values = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (status === 'completed') { updates.push('completed_at = datetime(\'now\')'); }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: '没有提供要更新的字段' }
      });
    }
    
    values.push(taskId);
    
    const result = await new Promise((resolve, reject) => {
      db.db.run(`
        UPDATE project_tasks SET ${updates.join(', ')} WHERE id = ?
      `, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      message: '任务已更新',
      changes: result.changes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/agents/me/projects/:projectId/tasks/:taskId
 * 删除任务
 */
router.delete('/me/projects/:projectId/tasks/:taskId', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const { projectId, taskId } = req.params;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '缺少X-API-Key头' }
      });
    }
    
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: '无效的API Key' }
      });
    }
    
    // 检查权限（owner或developer）
    const relation = await new Promise((resolve, reject) => {
      db.db.get(`
        SELECT * FROM agent_projects 
        WHERE agent_id = ? AND project_id = ? AND role IN ('owner', 'developer')
      `, [agent.agent_id, projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!relation) {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '无权删除此任务' }
      });
    }
    
    const result = await new Promise((resolve, reject) => {
      db.db.run('DELETE FROM project_tasks WHERE id = ? AND project_id = ?', [taskId, projectId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    res.json({
      success: true,
      message: '任务已删除',
      changes: result.changes,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== 项目任务 API 结束 ==========
router.get('/:agentId', async (req, res, next) => {
  try {
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE agent_id = ?', [req.params.agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agent不存在' }
      });
    }
    
    const projects = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT p.*, ap.role 
        FROM agent_projects ap 
        JOIN projects p ON ap.project_id = p.id 
        WHERE ap.agent_id = ?
      `, [agent.agent_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const devices = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT DISTINCT d.*
        FROM project_devices pd 
        JOIN devices d ON pd.device_id = d.device_id 
        WHERE pd.project_id IN (SELECT project_id FROM agent_projects WHERE agent_id = ?)
      `, [agent.agent_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      data: {
        ...agent,
        api_key: undefined, // Hide API key
        projects: projects || [],
        devices: devices || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== 智能体注册与认证 API ==========

/**
 * POST /api/v1/agents/register
 * 注册新智能体
 */
router.post('/register', async (req, res, next) => {
  try {
    const { agent_id, agent_name, agent_type, capabilities, metadata } = req.body;
    
    // 参数校验
    if (!agent_id || !agent_name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'agent_id和agent_name为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 检查是否已存在
    const existing = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE agent_id = ?', [agent_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'AGENT_EXISTS',
          message: '智能体已存在'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 生成API Key
    const apiKey = generateApiKey();
    
    // 创建智能体
    const stmt = db.db.prepare(`
      INSERT INTO agents (agent_id, agent_name, agent_type, api_key, capabilities, metadata, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);
    
    stmt.run(
      agent_id,
      agent_name,
      agent_type || 'openclaw',
      apiKey,
      JSON.stringify(capabilities || {}),
      JSON.stringify(metadata || {}),
      (err) => {
        if (err) {
          stmt.finalize();
          return next(err);
        }
        
        res.json({
          success: true,
          data: {
            agent_id,
            agent_name,
            agent_type: agent_type || 'openclaw',
            api_key: apiKey,
            capabilities: capabilities || {},
            metadata: metadata || {},
            status: 'active',
            created_at: new Date().toISOString()
          },
          message: '智能体注册成功，请妥善保管API Key',
          timestamp: new Date().toISOString()
        });
        stmt.finalize();
      }
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/login
 * 智能体登录（通过API Key获取token）
 */
router.post('/login', async (req, res, next) => {
  try {
    const { agent_id, api_key } = req.body;
    
    // 参数校验
    if (!agent_id || !api_key) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'agent_id和api_key为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 验证智能体和API Key
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE agent_id = ? AND api_key = ?', [agent_id, api_key], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'agent_id或api_key无效'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 生成会话token
    const sessionToken = generateSessionToken();
    
    // 创建会话记录
    const sessionId = generateSessionId();
    const sessionStmt = db.db.prepare(`
      INSERT INTO agent_sessions (agent_id, session_id, status)
      VALUES (?, ?, 'active')
    `);
    
    sessionStmt.run(agent_id, sessionId, (err) => {
      if (err) {
        sessionStmt.finalize();
        return next(err);
      }
      
      // 更新智能体最后活跃时间
      db.db.run("UPDATE agents SET last_active = datetime('now') WHERE agent_id = ?", [agent_id]);
      
      res.json({
        success: true,
        data: {
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          session_id: sessionId,
          session_token: sessionToken,
          expires_in: 86400, // 24小时
          capabilities: JSON.parse(agent.capabilities || '{}')
        },
        timestamp: new Date().toISOString()
      });
      sessionStmt.finalize();
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/agents/:agentId/link
 * 关联智能体到项目
 */
router.post('/:agentId/link', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const { project_id, role } = req.body;
    
    // 参数校验
    if (!project_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'project_id为必填项'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 检查智能体是否存在
    const agent = await new Promise((resolve, reject) => {
      db.db.get('SELECT * FROM agents WHERE agent_id = ?', [agentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: '智能体不存在'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // 关联到项目
    const stmt = db.db.prepare(`
      INSERT OR REPLACE INTO agent_projects (agent_id, project_id, role)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(agentId, project_id, role || 'developer', (err) => {
      if (err) {
        stmt.finalize();
        return next(err);
      }
      
      res.json({
        success: true,
        data: {
          agent_id: agentId,
          project_id: project_id,
          role: role || 'developer'
        },
        message: '智能体已关联到项目',
        timestamp: new Date().toISOString()
      });
      stmt.finalize();
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/agents/:agentId
 * 删除智能体
 */
router.delete('/:agentId', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    
    const result = await new Promise((resolve, reject) => {
      db.db.run('DELETE FROM agents WHERE agent_id = ?', [agentId], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
    
    if (result.deleted === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '智能体不存在'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: '智能体已删除',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// ========== 辅助函数 ==========

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'al_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateSessionId() {
  return 'sess_' + crypto.randomBytes(16).toString('hex');
}

module.exports = { router, setAgentDatabase };// ========== 智能体自身视角 API (/agents/me) ==========

/**
 * POST /api/v1/agents/me/login
 * 智能体通过API Key登录，获取自身信息
 */