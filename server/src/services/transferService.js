/**
 * TransferService - 分块传输服务 v2.0
 * 支持分块传输、断点续传、进度追踪、并行传输、队列管理
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

/**
 * 传输队列管理器 v2.0
 * 支持优先级、并行传输、队列管理
 */
class TransferQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;  // 最大并行传输数
    this.maxParallelChunks = options.maxParallelChunks || 2;  // 每个传输最大并行块数
    this.queue = [];  // 等待队列
    this.activeTransfers = new Map();  // 正在传输的任务
    this.transferPromises = new Map();  // 传输Promise跟踪
  }

  /**
   * 添加传输任务到队列
   */
  addToQueue(transferTask) {
    // 按优先级插入队列 (优先级高的在前)
    const priority = transferTask.priority || 3;
    let insertIndex = this.queue.findIndex(t => (t.priority || 3) < priority);
    if (insertIndex === -1) insertIndex = this.queue.length;
    
    this.queue.splice(insertIndex, 0, {
      ...transferTask,
      queuedAt: Date.now()
    });
    
    console.log(`[TransferQueue] 添加任务 ${transferTask.transferId} 到队列，优先级 ${priority}，队列位置 ${insertIndex + 1}/${this.queue.length + 1}`);
    
    return this.processQueue();
  }

  /**
   * 处理队列
   */
  async processQueue() {
    // 检查是否可以启动新传输
    while (this.activeTransfers.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      this.startTransfer(task);
    }
  }

  /**
   * 启动传输任务
   */
  startTransfer(task) {
    this.activeTransfers.set(task.transferId, {
      ...task,
      startedAt: Date.now(),
      chunksInFlight: 0
    });
    
    console.log(`[TransferQueue] 启动传输 ${task.transferId}，当前活动 ${this.activeTransfers.size}/${this.maxConcurrent}`);
  }

  /**
   * 标记传输完成
   */
  completeTransfer(transferId, success = true) {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer) {
      const duration = Date.now() - transfer.startedAt;
      console.log(`[TransferQueue] 传输 ${transferId} ${success ? '完成' : '失败'}，耗时 ${duration}ms`);
      this.activeTransfers.delete(transferId);
      this.transferPromises.delete(transferId);
    }
    
    // 处理队列中的下一个
    this.processQueue();
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      activeTransfers: Array.from(this.activeTransfers.keys()),
      queuedTransfers: this.queue.map(t => ({
        transferId: t.transferId,
        priority: t.priority,
        queuedAt: t.queuedAt
      })),
      activeCount: this.activeTransfers.size,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * 取消队列中的传输
   */
  cancelTransfer(transferId) {
    // 从队列中移除
    const queueIndex = this.queue.findIndex(t => t.transferId === transferId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      console.log(`[TransferQueue] 取消队列中的传输 ${transferId}`);
      return true;
    }
    
    // 从活动中移除
    if (this.activeTransfers.has(transferId)) {
      this.activeTransfers.delete(transferId);
      console.log(`[TransferQueue] 取消活动传输 ${transferId}`);
      this.processQueue();
      return true;
    }
    
    return false;
  }

  /**
   * 获取设备正在传输的任务
   */
  getDeviceTransfers(deviceId) {
    const active = Array.from(this.activeTransfers.values())
      .filter(t => t.deviceId === deviceId)
      .map(t => t.transferId);
    
    const queued = this.queue
      .filter(t => t.deviceId === deviceId)
      .map(t => t.transferId);
    
    return { active, queued };
  }
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
    
    // v2.0: 传输队列管理器
    this.transferQueue = new TransferQueue({
      maxConcurrent: 3,    // 最多3个并行传输任务
      maxParallelChunks: 2  // 每个传输最多2个并行块
    });
    
    // v2.0: 并行传输配置
    this.maxParallelChunks = 2;  // 每个文件传输最多并行2个块
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
   * 开始推送传输 - 发送文件到设备
   */
  async startPushTransfer(transferId, deviceId) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    if (transfer.direction !== 'push') {
      throw new Error('不是推送传输');
    }
    
    // 更新状态为传输中
    await this.updateTransferStatus(transferId, 'transferring');
    
    // 获取WebSocket服务
    const wsService = global.wsService;
    if (!wsService) {
      throw new Error('WebSocket服务未初始化');
    }
    
    // 发送transfer_start消息
    wsService.sendToDevice(deviceId, {
      type: 'transfer_start',
      transfer_id: transferId,
      file_name: transfer.file_name,
      file_size: transfer.file_size,
      total_chunks: transfer.total_chunks,
      remote_path: transfer.remote_path
    });
    
    // v2.0: 并行分块传输
    const totalChunks = transfer.total_chunks;
    const maxParallel = Math.min(this.maxParallelChunks, 3);  // 最多并行3个块
    let chunkIndex = 0;
    const pendingChunks = new Map();  // 正在传输的块
    let lastChunkProcessed = false;
    
    // 获取下一个待传输的块索引
    const getNextPendingChunkIndex = async () => {
      // 先查找数据库中待传输的块
      const rows = await this.db.all(`
        SELECT chunk_index FROM transfer_chunks 
        WHERE transfer_id = ? AND status = 'pending'
        ORDER BY chunk_index
        LIMIT ?
      `, [transferId, maxParallel]);
      return rows.map(r => r.chunk_index);
    };
    
    // 处理单个块传输
    const processChunk = async (idx) => {
      try {
        const chunkData = await this.getChunkData(transferId, idx);
        
        wsService.sendToDevice(deviceId, {
          type: 'transfer_chunk',
          transfer_id: transferId,
          chunk_index: idx,
          data: chunkData.data,
          hash: chunkData.hash,
          is_last: chunkData.is_last
        });
        
        // 更新分块状态
        await this.db.run(`
          UPDATE transfer_chunks SET status = 'transferred', transferred_at = CURRENT_TIMESTAMP
          WHERE transfer_id = ? AND chunk_index = ?
        `, [transferId, idx]);
        
        // 更新传输进度
        await this.db.run(`
          UPDATE file_transfers SET transferred_chunks = transferred_chunks + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [transferId]);
        
        // 通知进度
        this.notifyProgress(transferId);
        
        // 如果是最后一块
        if (chunkData.is_last) {
          lastChunkProcessed = true;
        }
        
        pendingChunks.delete(idx);
        console.log(`[Transfer-${transferId}] Chunk ${idx}/${totalChunks} 并行发送完成`);
        
      } catch (e) {
        console.error(`[Transfer-${transferId}] Chunk ${idx} failed:`, e.message);
        pendingChunks.delete(idx);
        throw e;
      }
    };
    
    // 并行控制循环
    const sendChunksInParallel = async () => {
      while (chunkIndex < totalChunks || pendingChunks.size > 0) {
        // 填充并行槽位
        while (pendingChunks.size < maxParallel && chunkIndex < totalChunks) {
          const idx = chunkIndex++;
          pendingChunks.set(idx, true);
          processChunk(idx).catch(async (e) => {
            await this.updateTransferStatus(transferId, 'failed', e.message);
          });
        }
        
        // 等待至少一个块完成
        if (pendingChunks.size > 0) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
    };
    
    // 等待所有块完成
    await sendChunksInParallel();
    
    // 所有块发送完成后，标记传输完成
    await this.updateTransferStatus(transferId, 'completed');
    
    return { success: true, total_chunks: totalChunks };
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
  
  /**
   * Pull模式: 从设备拉取文件
   * 1. 创建传输任务
   * 2. 发送命令到EdgeAgent读取文件
   * 3. 接收EdgeAgent发送的分块数据
   * 4. 组装文件
   */
  async initiatePullTransfer(options) {
    const {
      projectId,
      deviceId,
      remotePath,  // 设备上的文件路径
      localPath,   // EdgeHub上的存储路径
      fileName,
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
    
    // 生成分块查询命令 (EdgeAgent会读取文件并计算分块信息)
    const transferId = generateId('tf');
    const chunkSize = this.defaultChunkSize;
    
    // 在EdgeHub上创建目标文件路径
    if (!localPath) {
      const filename = fileName || path.basename(remotePath);
      localPath = path.join(this.uploadDir, `${transferId}_${filename}`);
    }
    
    // 确保目录存在
    const localDir = path.dirname(localPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    
    // 插入传输任务 (等待EdgeAgent返回文件信息)
    await this.db.run(`
      INSERT INTO file_transfers 
      (id, project_id, device_id, direction, local_path, remote_path, file_name, status, chunk_size, priority, total_chunks, file_size)
      VALUES (?, ?, ?, 'pull', ?, ?, ?, 'initiating', ?, ?, 0, 0)
    `, [transferId, projectId || null, deviceId, localPath, remotePath, fileName || path.basename(remotePath), chunkSize, priority]);
    
    // 创建初始块记录占位 (实际数量在EdgeAgent返回后更新)
    // 注意: 块记录在实际接收时创建
    
    return {
      transfer_id: transferId,
      status: 'initiating',
      remote_path: remotePath,
      local_path: localPath
    };
  }
  
  /**
   * 更新Pull传输的文件信息 (EdgeAgent返回文件大小后)
   */
  async updatePullTransferInfo(transferId, fileSize, fileHash, totalChunks) {
    await this.db.run(`
      UPDATE file_transfers 
      SET file_size = ?, file_hash = ?, total_chunks = ?, status = 'transferring'
      WHERE id = ? AND direction = 'pull'
    `, [fileSize, fileHash, totalChunks, transferId]);
    
    // 创建块记录
    const chunkSize = this.defaultChunkSize;
    for (let i = 0; i < totalChunks; i++) {
      const currentChunkSize = Math.min(chunkSize, fileSize - i * chunkSize);
      await this.db.run(`
        INSERT INTO transfer_chunks (transfer_id, chunk_index, chunk_size, status)
        VALUES (?, ?, ?, 'pending')
      `, [transferId, i, currentChunkSize]);
    }
    
    return { success: true };
  }
  
  /**
   * 接收Pull模式下的分块数据 (从EdgeAgent)
   */
  async receivePullChunk(transferId, chunkIndex, data, hash, isLast = false) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    if (transfer.direction !== 'pull') {
      throw new Error('不是Pull传输');
    }
    
    // 解码数据并写入临时文件
    const buffer = Buffer.from(data, 'base64');
    const tempPath = path.join(this.tempDir, `${transferId}.${chunkIndex}.chunk`);
    fs.writeFileSync(tempPath, buffer);
    
    // 更新块状态
    await this.db.run(`
      UPDATE transfer_chunks 
      SET status = 'transferred', chunk_hash = ?, transferred_at = CURRENT_TIMESTAMP
      WHERE transfer_id = ? AND chunk_index = ?
    `, [hash, transferId, chunkIndex]);
    
    // 更新传输进度
    await this.db.run(`
      UPDATE file_transfers 
      SET transferred_chunks = transferred_chunks + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [transferId]);
    
    // 如果是最后一块，组装文件
    if (isLast) {
      return await this.completePullTransfer(transferId);
    }
    
    // 返回当前进度
    const updated = await this.getTransfer(transferId);
    return {
      success: true,
      chunk_index: chunkIndex,
      received: updated.progress.transferred_chunks,
      total: updated.total_chunks,
      progress: updated.progress.percentage
    };
  }
  
  /**
   * 完成Pull传输 - 组装文件
   */
  async completePullTransfer(transferId) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    const finalPath = transfer.local_path;
    const tempDir = this.tempDir;
    const tempFinalPath = finalPath + '.tmp';
    
    try {
      // 按顺序合并所有块
      const writeStream = fs.createWriteStream(tempFinalPath);
      
      for (let i = 0; i < transfer.total_chunks; i++) {
        const chunkPath = path.join(tempDir, `${transferId}.${i}.chunk`);
        if (!fs.existsSync(chunkPath)) {
          throw new Error(`分块 ${i} 缺失`);
        }
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkPath); // 删除已组装的块
      }
      
      writeStream.end();
      
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      
      // 原子重命名
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(tempFinalPath, finalPath);
      
      // 验证文件完整性
      if (transfer.file_hash) {
        const actualHash = await this.calculateFileHash(finalPath);
        if (actualHash !== transfer.file_hash) {
          fs.unlinkSync(finalPath);
          throw new Error('文件完整性校验失败');
        }
      }
      
      // 更新状态
      await this.updateTransferStatus(transferId, 'completed');
      
      return {
        success: true,
        transfer_id: transferId,
        file_path: finalPath,
        file_size: fs.statSync(finalPath).size
      };
      
    } catch (e) {
      if (fs.existsSync(tempFinalPath)) {
        fs.unlinkSync(tempFinalPath);
      }
      throw e;
    }
  }
  
  /**
   * 获取Pull传输的下载URL
   */
  async getPullDownloadUrl(transferId) {
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    if (transfer.status !== 'completed') {
      throw new Error('传输尚未完成');
    }
    
    if (transfer.direction !== 'pull') {
      throw new Error('不是Pull传输');
    }
    
    // 返回文件路径 (前端可以通过nginx访问)
    return {
      success: true,
      file_path: transfer.local_path,
      file_name: transfer.file_name,
      file_size: transfer.file_size,
      download_url: `/api/v1/transfers/${transferId}/download`
    };
  }

  // ========== v2.0 队列管理方法 ==========

  /**
   * 获取传输队列状态
   */
  getQueueStatus() {
    return this.transferQueue.getQueueStatus();
  }

  /**
   * 修改传输优先级
   */
  async updateTransferPriority(transferId, newPriority) {
    // 更新数据库中的优先级
    await this.db.run(`
      UPDATE file_transfers SET priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newPriority, transferId]);
    
    return {
      success: true,
      transfer_id: transferId,
      new_priority: newPriority
    };
  }

  /**
   * 取消队列中的传输
   */
  async cancelQueuedTransfer(transferId) {
    // 先检查传输是否存在
    const transfer = await this.getTransfer(transferId);
    if (!transfer) {
      throw new Error('传输任务不存在');
    }
    
    // 如果传输正在进行，也取消它
    if (['pending', 'transferring'].includes(transfer.status)) {
      await this.cancelTransfer(transferId);
    }
    
    // 从队列中移除
    const cancelled = this.transferQueue.cancelTransfer(transferId);
    
    return {
      success: true,
      transfer_id: transferId,
      removed_from_queue: cancelled
    };
  }

  /**
   * 获取设备的传输队列信息
   */
  getDeviceQueueInfo(deviceId) {
    return this.transferQueue.getDeviceTransfers(deviceId);
  }
}

module.exports = TransferService;
