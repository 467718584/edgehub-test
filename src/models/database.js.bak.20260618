const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class Database {
  constructor(dbPath) {
    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }
  
  init() {
    // 创建设备表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT UNIQUE NOT NULL,
        device_name TEXT NOT NULL,
        device_type TEXT DEFAULT 'RK3588',
        os_version TEXT,
        architecture TEXT DEFAULT 'aarch64',
        vpn_ip TEXT,
        ssh_port INTEGER DEFAULT 22,
        status TEXT DEFAULT 'offline',
        last_heartbeat DATETIME,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);
    
    // 创建心跳日志表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS heartbeat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu_percent REAL,
        memory_percent REAL,
        disk_percent REAL,
        tunnel_status TEXT,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
    
    // 创建命令日志表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS command_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        command TEXT NOT NULL,
        user TEXT DEFAULT 'ai',
        stdout TEXT,
        stderr TEXT,
        exit_code INTEGER,
        duration_ms INTEGER,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
    
    // ========== 项目追踪系统表 ==========
    
    // 创建项目表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        priority INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
    
    // 创建开发记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS development_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        device_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        action_type TEXT NOT NULL,
        command TEXT,
        stdout TEXT,
        stderr TEXT,
        exit_code INTEGER,
        duration_ms INTEGER,
        success INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (device_id) REFERENCES devices(device_id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `);
    
    // 创建调试记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS debug_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        device_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        issue_title TEXT NOT NULL,
        issue_description TEXT,
        solution TEXT,
        files_modified TEXT,
        outcome TEXT DEFAULT 'open',
        resolved_at DATETIME,
        FOREIGN KEY (device_id) REFERENCES devices(device_id),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `);
    
    // ========== 命令队列系统表 ==========
    
    // 创建命令队列表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 5,
        timeout_ms INTEGER DEFAULT 30000,
        result TEXT,
        stdout TEXT,
        stderr TEXT,
        exit_code INTEGER,
        callback_url TEXT,
        callback_headers TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        picked_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
    
    // 创建命令偏移量表（用于增量拉取）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS command_offsets (
        device_id TEXT PRIMARY KEY,
        last_command_id INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
  }
  
  // ========== 设备相关操作 ==========
  
  createDevice(device) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO devices (device_id, device_name, device_type, os_version, architecture, vpn_ip, ssh_port, status, last_heartbeat)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'online', datetime(\'now\'))
      `);
      
      stmt.run(
        device.device_id,
        device.device_name,
        device.device_type || 'RK3588',
        device.os_version || '',
        device.architecture || 'aarch64',
        device.vpn_ip,
        device.ssh_port || 22,
        (err) => {
          if (err) reject(err);
          else resolve(this.getDevice(device.device_id));
        }
      );
      stmt.finalize();
    });
  }
  
  getDevice(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM devices WHERE device_id = ?', [deviceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  getAllDevices() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM devices ORDER BY registered_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  updateDevice(deviceId, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'device_id') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
      
      if (fields.length === 0) {
        return resolve(this.getDevice(deviceId));
      }
      
      values.push(deviceId);
      const sql = `UPDATE devices SET ${fields.join(', ')} WHERE device_id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
  
  updateDeviceStatus(deviceId, status) {
    return this.updateDevice(deviceId, { status, last_heartbeat: new Date().toISOString() });
  }
  
  
  updateDeviceSysinfo(deviceId, sysinfo) {
    return this.updateDevice(deviceId, { 
      sysinfo: typeof sysinfo === 'string' ? sysinfo : JSON.stringify(sysinfo), 
      last_heartbeat: new Date().toISOString() 
    });
  }
  updateHeartbeat(deviceId, heartbeat) {
    return new Promise((resolve, reject) => {
      let sql = `UPDATE devices SET 
        last_heartbeat = datetime(\'now\'),
        status = 'online'`;
      
      const params = [];
      
      if (heartbeat && heartbeat.sysinfo) {
        sql = sql.replace("status = 'online'", "status = 'online', sysinfo = ?");
        params.push(heartbeat.sysinfo);
      }
      
      sql += ' WHERE device_id = ?';
      params.push(deviceId);
      
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
  
  getUsedVpnIps() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT vpn_ip FROM devices WHERE vpn_ip IS NOT NULL', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.vpn_ip));
      });
    });
  }
  
  deleteDevice(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM devices WHERE device_id = ?', [deviceId], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }
  
  // 心跳日志
  logHeartbeat(log) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO heartbeat_logs (device_id, cpu_percent, memory_percent, disk_percent, tunnel_status)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        log.device_id,
        log.cpu_percent,
        log.memory_percent,
        log.disk_percent,
        log.tunnel_status,
        (err) => {
          if (err) reject(err);
          else resolve({ inserted: true });
        }
      );
      stmt.finalize();
    });
  }
  
  // 命令日志
  logCommand(log) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO command_logs (device_id, command, user, stdout, stderr, exit_code, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        log.device_id,
        log.command,
        log.user || 'ai',
        log.stdout || '',
        log.stderr || '',
        log.exit_code || -1,
        log.duration_ms || 0,
        (err) => {
          if (err) reject(err);
          else resolve({ inserted: true });
        }
      );
      stmt.finalize();
    });
  }
  
  // ========== 项目相关操作 ==========
  
  createProject(project) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO projects (device_id, project_name, project_path, description, status, priority, last_activity)
        VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))
      `);
      
      stmt.run(
        project.device_id,
        project.project_name,
        project.project_path,
        project.description || '',
        project.status || 'active',
        project.priority || 5,
        (err) => {
          if (err) reject(err);
          else {
            const lastId = this.db.prepare('SELECT last_insert_rowid()').get()['last_insert_rowid()'];
            resolve(this.getProject(lastId));
          }
        }
      );
      stmt.finalize();
    });
  }
  
  getProject(projectId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  getProjectsByDevice(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM projects WHERE device_id = ? ORDER BY last_activity DESC', [deviceId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  getAllProjects() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT p.*, d.device_name, d.vpn_ip, d.status as device_status
        FROM projects p 
        LEFT JOIN devices d ON p.device_id = d.device_id 
        ORDER BY p.last_activity DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  updateProject(projectId, updates) {
    return new Promise((resolve, reject) => {
      const fields = ['last_activity = datetime(\'now\')'];
      const values = [];
      let newDeviceId = null;
      
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id') {
          fields.push(`${key} = ?`);
          values.push(value);
          if (key === 'device_id') newDeviceId = value;
        }
      }
      
      values.push(projectId);
      const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Sync project_devices table if device_id changed
        if (newDeviceId) {
          const self = this;
          this.db.run('DELETE FROM project_devices WHERE project_id = ?', [projectId], function(errDel) {
            if (errDel) {
              reject(errDel);
              return;
            }
            self.db.run('INSERT INTO project_devices (project_id, device_id) VALUES (?, ?)', [projectId, newDeviceId], function(errIns) {
              if (errIns) reject(errIns);
              else resolve({ changes: this.changes });
            });
          });
        } else {
          resolve({ changes: this.changes });
        }
      }.bind(this));
    });
  }
  
  deleteProject(projectId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM projects WHERE id = ?', [projectId], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }
  
  // ========== 开发记录相关操作 ==========
  
  logDevelopment(log) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO development_logs 
        (project_id, device_id, action_type, command, stdout, stderr, exit_code, duration_ms, success, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        log.project_id || null,
        log.device_id,
        log.action_type,
        log.command || '',
        log.stdout || '',
        log.stderr || '',
        log.exit_code || 0,
        log.duration_ms || 0,
        log.success ? 1 : 0,
        log.notes || '',
        (err) => {
          if (err) reject(err);
          else {
            // 更新项目的最后活动时间
            if (log.project_id) {
              this.updateProjectLastActivity(log.project_id);
            }
            resolve({ inserted: true });
          }
        }
      );
      stmt.finalize();
    });
  }
  
  getDevelopmentLogs(projectId, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM development_logs 
        WHERE project_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `, [projectId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  getRecentLogs(deviceId, limit = 20) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT dl.*, p.project_name 
        FROM development_logs dl
        LEFT JOIN projects p ON dl.project_id = p.id
        WHERE dl.device_id = ?
        ORDER BY dl.timestamp DESC
        LIMIT ?
      `, [deviceId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  getAllRecentLogs(limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT dl.*, p.project_name, p.device_id, d.device_name, d.vpn_ip
        FROM development_logs dl
        LEFT JOIN projects p ON dl.project_id = p.id
        LEFT JOIN devices d ON dl.device_id = d.device_id
        ORDER BY dl.timestamp DESC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  updateProjectLastActivity(projectId) {
    this.db.run(
      "UPDATE projects SET last_activity = datetime(\'now\') WHERE id = ?",
      [projectId],
      function(err) {
        if (err) console.error('Failed to update project last_activity:', err);
      }
    );
  }
  
  // ========== 调试记录相关操作 ==========
  
  createDebugRecord(record) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO debug_records 
        (project_id, device_id, issue_title, issue_description, files_modified, outcome)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        record.project_id || null,
        record.device_id,
        record.issue_title,
        record.issue_description || '',
        JSON.stringify(record.files_modified || []),
        record.outcome || 'open',
        (err) => {
          if (err) reject(err);
          else resolve({ inserted: true });
        }
      );
      stmt.finalize();
    });
  }
  
  getDebugRecords(projectId) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM debug_records 
        WHERE project_id = ? 
        ORDER BY timestamp DESC
      `, [projectId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  updateDebugRecord(recordId, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'project_id' && key !== 'device_id') {
          fields.push(`${key} = ?`);
          values.push(key === 'files_modified' ? JSON.stringify(value) : value);
        }
      }
      
      if (updates.outcome === 'resolved' && !updates.resolved_at) {
        fields.push('resolved_at = datetime(\'now\')');
      }
      
      values.push(recordId);
      const sql = `UPDATE debug_records SET ${fields.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
  
  // ========== 统计相关 ==========
  
  getProjectStats(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(*) as total_projects,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_projects,
          SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused_projects
        FROM projects 
        WHERE device_id = ?
      `, [deviceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  getOverallStats() {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          (SELECT COUNT(*) FROM devices) as total_devices,
          (SELECT COUNT(*) FROM projects) as total_projects,
          (SELECT COUNT(*) FROM development_logs) as total_logs,
          (SELECT COUNT(*) FROM debug_records WHERE outcome != 'resolved') as open_issues
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  // ========== 命令队列相关操作 ==========
  
  // 创建命令
  createCommand(cmd) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO commands 
        (command_id, device_id, command, status, priority, timeout_ms, callback_url, callback_headers)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
      `);
      
      stmt.run(
        cmd.command_id,
        cmd.device_id,
        cmd.command,
        cmd.priority || 5,
        cmd.timeout_ms || 30000,
        cmd.callback_url || null,
        cmd.callback_headers ? JSON.stringify(cmd.callback_headers) : null,
        (err) => {
          if (err) reject(err);
          else resolve(this.getCommand(cmd.command_id));
        }
      );
      stmt.finalize();
    });
  }
  
  // 获取命令详情
  getCommand(commandId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM commands WHERE command_id = ?', [commandId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  // 获取设备的命令列表
  getCommandsByDevice(deviceId, options = {}) {
    return new Promise((resolve, reject) => {
      const { status, limit = 50, offset = 0 } = options;
      let sql = 'SELECT * FROM commands WHERE device_id = ?';
      const params = [deviceId];
      
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  // 增量拉取待执行命令（按偏移量）
  fetchPendingCommands(deviceId, lastCommandId = 0, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM commands 
        WHERE device_id = ? AND id > ? AND status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      `, [deviceId, lastCommandId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  // 更新命令状态
  updateCommandStatus(commandId, status, result = null) {
    return new Promise((resolve, reject) => {
      let sql = 'UPDATE commands SET status = ?';
      const params = [status];
      
      if (status === 'running') {
        sql += ', picked_at = datetime("now")';
      } else if (status === 'completed' || status === 'failed') {
        sql += ', completed_at = datetime("now")';
      }
      
      if (result) {
        if (result.stdout !== undefined) {
          sql += ', stdout = ?';
          params.push(result.stdout);
        }
        if (result.stderr !== undefined) {
          sql += ', stderr = ?';
          params.push(result.stderr);
        }
        if (result.exit_code !== undefined) {
          sql += ', exit_code = ?';
          params.push(result.exit_code);
        }
        if (result.result !== undefined) {
          sql += ', result = ?';
          params.push(JSON.stringify(result.result));
        }
      }
      
      sql += ' WHERE command_id = ?';
      params.push(commandId);
      
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
  
  // 取消命令
  cancelCommand(commandId) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE commands SET status = 'cancelled', completed_at = datetime(\'now\')
        WHERE command_id = ? AND status = 'pending'
      `, [commandId], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, cancelled: this.changes > 0 });
      });
    });
  }
  
  // 删除命令
  deleteCommand(commandId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM commands WHERE command_id = ?', [commandId], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes });
      });
    });
  }
  
  // 获取命令统计
  getCommandStats(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM commands WHERE device_id = ?
      `, [deviceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  // 获取设备的命令偏移量
  getCommandOffset(deviceId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM command_offsets WHERE device_id = ?', [deviceId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  // 更新命令偏移量
  updateCommandOffset(deviceId, lastCommandId) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO command_offsets (device_id, last_command_id, updated_at)
        VALUES (?, ?, datetime(\'now\'))
        ON CONFLICT(device_id) DO UPDATE SET last_command_id = ?, updated_at = datetime(\'now\')
      `, [deviceId, lastCommandId, lastCommandId], function(err) {
        if (err) reject(err);
        else resolve({ updated: this.changes });
      });
    });
  }
  
  close() {
    this.db.close();
  }
}

module.exports = Database;
