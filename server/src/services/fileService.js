const fs = require('fs');
const path = require('path');
const SSHPool = require('../utils/sshPool');
const crypto = require('crypto');

class FileService {
  constructor(db) {
    this.db = db;
    this.sshPool = new SSHPool();
    this.tempDir = './data/downloads/';
    
    // 确保临时目录存在
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  
  // 推送文件到设备
  async pushFile(deviceId, localFile, remotePath) {
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
    
    if (!fs.existsSync(localFile)) {
      const error = new Error('本地文件不存在');
      error.statusCode = 400;
      error.code = 'FILE_NOT_FOUND';
      throw error;
    }
    
    const fileContent = fs.readFileSync(localFile);
    const md5 = crypto.createHash('md5').update(fileContent).digest('hex');
    const fileSize = fileContent.length;
    
    try {
      await this.sshPool.uploadFile(deviceId, device.frp_remote_port, localFile, remotePath);
      
      return {
        success: true,
        file_size: fileSize,
        md5
      };
    } catch (err) {
      const error = new Error('文件上传失败: ' + err.message);
      error.statusCode = 500;
      error.code = 'UPLOAD_FAILED';
      throw error;
    }
  }
  
  // 从设备拉取文件
  async pullFile(deviceId, remotePath, localPath = null) {
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
    
    // 生成本地路径
    if (!localPath) {
      const filename = path.basename(remotePath);
      localPath = path.join(this.tempDir, `${deviceId}_${filename}`);
    }
    
    try {
      await this.sshPool.downloadFile(deviceId, device.frp_remote_port, remotePath, localPath);
      
      const stats = fs.statSync(localPath);
      const fileContent = fs.readFileSync(localPath);
      const md5 = crypto.createHash('md5').update(fileContent).digest('hex');
      
      return {
        success: true,
        file_size: stats.size,
        md5,
        file_path: localPath
      };
    } catch (err) {
      const error = new Error('文件下载失败: ' + err.message);
      error.statusCode = 500;
      error.code = 'DOWNLOAD_FAILED';
      throw error;
    }
  }
  
  // v1.0 兼容方法
  async pushFileLegacy(deviceId, localFile, remotePath) {
    return this.pushFile(deviceId, localFile, remotePath);
  }
  
  async pullFileLegacy(deviceId, remotePath, localPath = null) {
    return this.pullFile(deviceId, remotePath, localPath);
  }
  
  // 关闭连接池
  destroy() {
    this.sshPool.destroy();
  }
}

module.exports = FileService;