/**
 * TransferService - 分块传输服务 v2.0
 * 支持分块传输、断点续传、进度追踪
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 生成唯一ID
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

class TransferService {
  constructor(db) {
    this.db = db;
    this.tempDir = './data/transfer_temp/';
    this.uploadDir = './data/uploads/';
    
    // 确保临时目录存在
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    // 默认分块大小: 2MB
    this.defaultChunkSize = 2 * 1024 * 1024;
    
    // 传输进度回调
    this.progressCallbacks = new Map();
  }
  
  /**
   * 初始化传输任务表
   */
  initTables() {
    // 文件传输任务表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_transfers (
        id TEXT PRIMARY KEY,
        project_id INTEGER,
        device_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        local_path TEXT,
        remote_path TEXT NOT NULL,
        file_name TEXT,
        file_size INTEGER DEFAULT 0,
        file_hash TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        chunk_size INTEGER DEFAULT 2097152,
        total_chunks INTEGER DEFAULT 0,
        transferred_chunks INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (device_id) REFERENCES devices(device_id)
      )
    `);
    
    // 传输块记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS transfer_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_size INTEGER DEFAULT 0,
        chunk_hash TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        transferred_at DATETIME,
        FOREIGN KEY (transfer_id) REFERENCES file_transfers(id)
      )
    `);
    
    // 创建索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_device ON file_transfers(device_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_status ON file_transfers(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunk_transfer ON transfer_chunks(transfer_id)`);
  }
  
  /**
   * 创建传输任务
   */
  async createTransfer(options) {
    const {
      projectId,
      deviceId,
      direction,
      localPath,
      remotePath,
      fileName,
      fileSize,
      fileHash,
      priority = 3
    } = options;
    
    // 获取设备信息
    const device = await this.db.getDevice(deviceId);
    if (!device) {
      const error = new Error('设备不存在');
      error.statusCode = 404;
      error.code = 'DEVICE_NOT_FOUND';
      throw error;
    }
    
    if (device.status !== 'online') {
      const error = new Error('设备不在线');
      error.statusCode = 503;
      error.code = 'DEVICE_OFFLINE';
      throw error;
    }
    
    // 计算分块数
    const chunkSize = this.defaultChunkSize;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // 生成传输ID
    const transferId = generateId('tf');
    
    // 插入传输任务
    await this.db.run(`
      INSERT INTO file_transfers 
      (id, project_id, device_id, direction, local_path, remote_path, file_name, file_size, file_hash, chunk_size, total_chunks, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [transferId, projectId || null, deviceId, direction, localPath, remotePath, fileName, fileSize, fileHash, chunkSize, totalChunks, priority]);
    
    // 创建块记录
    for (let i = 0; i < totalChunks; i++) {
      const currentChunkSize = Math.min(chunkSize, fileSize - i * chunkSize);
      await this.db.run(`
        INSERT INTO transfer_chunks (transfer_id, chunk_index, chunk_size, status)
        VALUES (?, ?, ?, 'pending')
      `, [transferId, i, currentChunkSize]);
    }
    
    return {
      transfer_id: transferId,
      status: 'pending',
      total_chunks: totalChunks,
      chunk_size: chunkSize,
      file_size: fileSize
    };
  }
  
  /**
   * 获取传输任务
   */
  async getTransfer(transferId) {
    const row = await this.db.get(`
      SELECT * FROM file_transfers WHERE id = ?
    `, [transferId]);
    
    if (!row) return null;
    
    // 获取块进度
    const chunks = await this.db.all(`
      SELECT chunk_index, chunk_size, chunk_hash, status, retry_count
      FROM transfer_chunks
      WHERE transfer_id = ?
      ORDER BY chunk_index
    `, [transferId]);
    
    return {
      ...row,
      chunks,
      progress: {
        transferred_chunks: chunks.filter(c => c.status === 'transferred').length,
        total_chunks: chunks.length,
        percentage: Math.round((chunks.filter(c => c.status === 'transferred').length / chunks.length) * 100)
      }
    };
  }
  
  /**
   * 更新传输状态
   */
  async updateTransferStatus(transferId, status, errorMessage = null) {
    await this.db.run(`
      UPDATE file_transfers 
      SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, errorMessage, transferId]);
    
    if (status === 'completed') {
      await this.db.run(`
        UPDATE file_transfers SET completed_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [transferId]);
    }
  }
  
  /**
   * 获取分块数据
   */
  async getChunkData(transferId, chunkIndex) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    if (chunkIndex >= transfer.total_chunks) {
      throw new Error('无效的分块索引');
    }
    
    const localPath = transfer.local_path;
    if (!localPath || !fs.existsSync(localPath)) {
      throw new Error('源文件不存在');
    }
    
    const chunkSize = transfer.chunk_size;
    const offset = chunkIndex * chunkSize;
    
    // 读取分块数据
    const buffer = Buffer.alloc(transfer.chunks[chunkIndex].chunk_size);
    const fd = fs.openSync(localPath, 'r');
    fs.readSync(fd, buffer, 0, transfer.chunks[chunkIndex].chunk_size, offset);
    fs.closeSync(fd);
    
    // 计算MD5
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    
    return {
      transfer_id: transferId,
      chunk_index: chunkIndex,
      total_chunks: transfer.total_chunks,
      data: buffer.toString('base64'),
      size: buffer.length,
      hash,
      is_last: chunkIndex === transfer.total_chunks - 1
    };
  }
  
  /**
   * 接收分块数据
   */
  async receiveChunk(transferId, chunkIndex, data, hash, isLast = false) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    // 验证哈希
    const expectedHash = hash;
    
    // 保存到临时文件
    const tempPath = path.join(this.tempDir, `${transferId}.${chunkIndex}.chunk`);
    const buffer = Buffer.from(data, 'base64');
    
    // 验证数据完整性
    const actualHash = crypto.createHash('md5').update(buffer).digest('hex');
    if (actualHash !== expectedHash) {
      // 更新块状态为失败
      await this.db.run(`
        UPDATE transfer_chunks SET status = 'failed', retry_count = retry_count + 1
        WHERE transfer_id = ? AND chunk_index = ?
      `, [transferId, chunkIndex]);
      
      const error = new Error('分块校验失败');
      error.code = 'CHUNK_CRC_FAILED';
      throw error;
    }
    
    // 写入临时文件
    fs.writeFileSync(tempPath, buffer);
    
    // 更新块状态
    await this.db.run(`
      UPDATE transfer_chunks 
      SET status = 'transferred', chunk_hash = ?, transferred_at = CURRENT_TIMESTAMP
      WHERE transfer_id = ? AND chunk_index = ?
    `, [actualHash, transferId, chunkIndex]);
    
    // 更新传输进度
    await this.db.run(`
      UPDATE file_transfers 
      SET transferred_chunks = transferred_chunks + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [transferId]);
    
    // 通知进度回调
    this.notifyProgress(transferId);
    
    // 如果是最后一块，组装文件
    if (isLast) {
      await this.assembleFile(transferId);
    }
    
    return {
      success: true,
      chunk_index: chunkIndex,
      hash: actualHash
    };
  }
  
  /**
   * 组装文件
   */
  async assembleFile(transferId) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    const tempDir = this.tempDir;
    const finalPath = transfer.remote_path;
    const tempFinalPath = finalPath + '.tmp';
    
    // 创建最终文件
    const writeStream = fs.createWriteStream(tempFinalPath);
    
    for (let i = 0; i < transfer.total_chunks; i++) {
      const chunkPath = path.join(tempDir, `${transferId}.${i}.chunk`);
      
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`分块 ${i} 缺失`);
      }
      
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
      
      // 删除已组装的块
      fs.unlinkSync(chunkPath);
    }
    
    writeStream.end();
    
    // 等待写入完成
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // 原子重命名
    fs.renameSync(tempFinalPath, finalPath);
    
    // 验证文件完整性
    if (transfer.file_hash) {
      const fileHash = await this.calculateFileHash(finalPath);
      if (fileHash !== transfer.file_hash) {
        // 删除错误文件
        fs.unlinkSync(finalPath);
        throw new Error('文件完整性校验失败');
      }
    }
    
    // 更新传输状态
    await this.updateTransferStatus(transferId, 'completed');
    
    return {
      success: true,
      file_path: finalPath,
      file_size: fs.statSync(finalPath).size
    };
  }
  
  /**
   * 计算文件哈希
   */
  async calculateFileHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  /**
   * 断点续传 - 获取已传输的块信息
   */
  async getResumeInfo(transferId) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    const pendingChunks = transfer.chunks.filter(c => c.status === 'pending');
    const transferredChunks = transfer.chunks.filter(c => c.status === 'transferred');
    
    return {
      transfer_id: transferId,
      status: transfer.status,
      total_chunks: transfer.total_chunks,
      transferred_chunks: transferredChunks.length,
      pending_chunks: pendingChunks.map(c => c.chunk_index),
      resume_from: transferredChunks.length > 0 
        ? Math.max(...transferredChunks.map(c => c.chunk_index)) + 1 
        : 0
    };
  }
  
  /**
   * 取消传输
   */
  async cancelTransfer(transferId) {
    // 更新状态
    await this.updateTransferStatus(transferId, 'cancelled');
    
    // 清理临时文件
    const tempDir = this.tempDir;
    const files = fs.readdirSync(tempDir);
    
    for (const file of files) {
      if (file.startsWith(transferId)) {
        fs.unlinkSync(path.join(tempDir, file));
      }
    }
    
    return { success: true };
  }
  
  /**
   * 注册进度回调
   */
  onProgress(transferId, callback) {
    this.progressCallbacks.set(transferId, callback);
  }
  
  /**
   * 通知进度更新
   */
  notifyProgress(transferId) {
    const callback = this.progressCallbacks.get(transferId);
    if (callback) {
      this.getTransfer(transferId).then(callback).catch(console.error);
    }
  }
  
  /**
   * 获取设备的传输列表
   */
  async getDeviceTransfers(deviceId, status = null) {
    let sql = `SELECT * FROM file_transfers WHERE device_id = ?`;
    const params = [deviceId];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    return await this.db.all(sql, params);
  }
  
  /**
   * 获取传输统计
   */
  async getTransferStats(deviceId = null) {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status IN ('pending', 'transferring') THEN 1 ELSE 0 END) as in_progress,
        SUM(file_size) as total_bytes
      FROM file_transfers
    `;
    const params = [];
    
    if (deviceId) {
      sql += ` WHERE device_id = ?`;
      params.push(deviceId);
    }
    
    const row = await this.db.get(sql, params);
    return row;
  }
}

module.exports = TransferService;
