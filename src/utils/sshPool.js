const { Client } = require('ssh2');
const config = require('../config');

class SSHPool {
  constructor() {
    this.poolSize = config.ssh.poolSize || 5;
    this.timeout = config.ssh.timeout || 30000;
    this.connections = new Map(); // deviceId -> {client, lastUsed}
  }
  
  // 获取SSH连接
  getConnection(deviceId, host, port = 22) {
    return new Promise((resolve, reject) => {
      // 检查连接池中是否有可用连接
      if (this.connections.has(deviceId)) {
        const conn = this.connections.get(deviceId);
        if (conn && conn.client && conn.client._readyState === 'open') {
          conn.lastUsed = Date.now();
          return resolve(conn.client);
        }
      }
      
      // 创建新连接
      const client = new Client();
      const self = this;
      
      client.connect({
        host: host,  // VPN内网IP
        port: port,  // SSH端口，默认22
        username: config.ssh.defaultUsername || 'ubuntu',
        readyTimeout: this.timeout,
        keepaliveInterval: 30000
      });
      
      client.on('ready', () => {
        const conn = { client, lastUsed: Date.now() };
        self.connections.set(deviceId, conn);
        resolve(client);
      });
      
      client.on('error', (err) => {
        console.error(`SSH connection error for ${deviceId}:`, err.message);
        this.connections.delete(deviceId);
        reject(err);
      });
      
      client.on('close', () => {
        this.connections.delete(deviceId);
      });
    });
  }
  
  // 执行命令
  execCommand(deviceId, host, port, command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      this.getConnection(deviceId, host, port)
        .then(client => {
          const startTime = Date.now();
          
          client.exec(command, (err, stream) => {
            if (err) {
              reject(err);
              return;
            }
            
            let stdout = '';
            let stderr = '';
            
            stream.on('data', (data) => {
              stdout += data.toString();
            });
            
            stream.stderr.on('data', (data) => {
              stderr += data.toString();
            });
            
            const timer = setTimeout(() => {
              stream.end();
              reject(new Error('Command timeout'));
            }, timeout);
            
            stream.on('close', (code) => {
              clearTimeout(timer);
              const duration = Date.now() - startTime;
              resolve({
                stdout,
                stderr,
                exitCode: code,
                duration
              });
            });
          });
        })
        .catch(reject);
    });
  }
  
  // 通过SFTP上传文件
  uploadFile(deviceId, port, localPath, remotePath) {
    return new Promise((resolve, reject) => {
      this.getConnection(deviceId, port)
        .then(client => {
          client.sftp((err, sftp) => {
            if (err) {
              reject(err);
              return;
            }
            
            sftp.fastPut(localPath, remotePath, (err) => {
              if (err) reject(err);
              else resolve({ success: true });
            });
          });
        })
        .catch(reject);
    });
  }
  
  // 通过SFTP下载文件
  downloadFile(deviceId, port, remotePath, localPath) {
    return new Promise((resolve, reject) => {
      this.getConnection(deviceId, port)
        .then(client => {
          client.sftp((err, sftp) => {
            if (err) {
              reject(err);
              return;
            }
            
            sftp.fastGet(remotePath, localPath, (err) => {
              if (err) reject(err);
              else resolve({ success: true });
            });
          });
        })
        .catch(reject);
    });
  }
  
  // 释放连接（不关闭，保持复用）
  release(deviceId) {
    // SSH连接池通常不需要主动释放，保持复用
  }
  
  // 关闭指定设备的连接
  closeConnection(deviceId) {
    if (this.connections.has(deviceId)) {
      const conn = this.connections.get(deviceId);
      if (conn && conn.client) {
        conn.client.end();
      }
      this.connections.delete(deviceId);
    }
  }
  
  // 销毁连接池
  destroy() {
    for (const [deviceId, conn] of this.connections) {
      if (conn && conn.client) {
        conn.client.end();
      }
    }
    this.connections.clear();
  }
}

module.exports = SSHPool;