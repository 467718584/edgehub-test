// 项目增强路由 - Express风格
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = '/opt/edgehub/data/edgehub.db';

// 获取项目目录结构
router.get('/:id/structure', async (req, res) => {
  const { id } = req.params;
  const { path } = req.query;
  
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    const project = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!project) {
      res.json({ success: false, error: { code: 'NOT_FOUND', message: '项目不存在' } });
      db.close();
      return;
    }
    
    const targetPath = path || project.project_path;
    
    // 安全检查：只允许访问项目路径下的目录
    if (!targetPath.startsWith(project.project_path)) {
      res.json({ success: false, error: { code: 'INVALID_PATH', message: '只能访问项目目录下的路径' } });
      db.close();
      return;
    }
    
    exec(`ls -la "${targetPath}" 2>&1`, { timeout: 10000 }, (err, stdout, stderr) => {
      db.close();
      if (err) {
        res.json({ success: false, error: { code: 'EXEC_ERROR', message: err.message } });
        return;
      }
      
      const lines = stdout.trim().split('\n').slice(1); // 跳过总计行
      const items = lines.map(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 8) return null;
        
        const isDir = line.startsWith('d');
        const name = parts[parts.length - 1];
        const size = isDir ? 0 : parseInt(parts[4]) || 0;
        
        return {
          name,
          type: isDir ? 'directory' : 'file',
          size,
          path: targetPath + '/' + name
        };
      }).filter(Boolean);
      
      res.json({ success: true, data: items });
    });
  } catch (error) {
    db.close();
    res.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

// 获取项目统计信息
router.get('/:id/stats', async (req, res) => {
  const { id } = req.params;
  
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    const project = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!project) {
      res.json({ success: false, error: { code: 'NOT_FOUND', message: '项目不存在' } });
      db.close();
      return;
    }
    
    const logs = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM development_logs WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1000', [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const debugs = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM debug_records WHERE project_id = ?', [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // 统计各类操作
    const actionStats = {};
    const agentStats = {};
    let successCount = 0;
    let failedCount = 0;
    
    logs.forEach(log => {
      // 操作类型统计
      actionStats[log.action_type] = (actionStats[log.action_type] || 0) + 1;
      
      // 成功/失败统计
      if (log.success) successCount++;
      else failedCount++;
      
      // 智能体统计 (从notes或metadata中提取)
      const agentMatch = (log.notes || '').match(/Agent[:\s]+([^\s,]+)/i);
      if (agentMatch) {
        agentStats[agentMatch[1]] = (agentStats[agentMatch[1]] || 0) + 1;
      }
    });
    
    // 待解决调试问题
    const pendingDebugs = (debugs || []).filter(d => d.outcome !== 'resolved');
    
    res.json({
      success: true,
      data: {
        project_name: project.project_name,
        total_logs: logs.length,
        total_debugs: debugs?.length || 0,
        pending_debugs: pendingDebugs.length,
        action_stats: actionStats,
        agent_stats: agentStats,
        success_rate: logs.length > 0 ? Math.round(successCount / logs.length * 100) : 0
      }
    });
    
    db.close();
  } catch (error) {
    db.close();
    res.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
});

module.exports = router;