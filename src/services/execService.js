const SSHPool = require('../utils/sshPool');
const config = require('../config');

class ExecService {
  constructor(db) {
    this.db = db;
    this.sshPool = new SSHPool();
  }
  
  // 执行命令
  async exec(deviceId, command, timeout = 30000) {
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
      error.details = {
        device_id: deviceId,
        last_heartbeat: device.last_heartbeat
      };
      throw error;
    }
    
    const vpnIp = device.vpn_ip;
    
    if (!vpnIp) {
      const error = new Error('设备未分配VPN IP');
      error.statusCode = 400;
      error.code = 'VPN_IP_UNASSIGNED';
      throw error;
    }
    
    try {
      const result = await this.sshPool.execCommand(deviceId, vpnIp, 22, command, timeout);
      
      // 记录命令日志
      await this.db.logCommand({
        device_id: deviceId,
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        duration_ms: result.duration
      });
      
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
        duration_ms: result.duration
      };
    } catch (err) {
      // 记录失败日志
      await this.db.logCommand({
        device_id: deviceId,
        command,
        exit_code: -1,
        stderr: err.message
      });
      
      if (err.message === 'Command timeout') {
        const error = new Error('命令执行超时');
        error.statusCode = 504;
        error.code = 'COMMAND_TIMEOUT';
        throw error;
      }
      
      const error = new Error('SSH执行错误: ' + err.message);
      error.statusCode = 500;
      error.code = 'SSH_ERROR';
      throw error;
    }
  }
  
  // 获取设备状态（通过SSH查询）
  async getStatus(deviceId) {
    const device = await this.db.getDevice(deviceId);
    
    if (!device) {
      const error = new Error('设备不存在');
      error.statusCode = 404;
      error.code = 'DEVICE_NOT_FOUND';
      throw error;
    }
    
    const vpnIp = device.vpn_ip;
    
    if (!vpnIp) {
      return {
        device_id: deviceId,
        status: device.status,
        last_heartbeat: device.last_heartbeat,
        note: '设备未分配VPN IP'
      };
    }
    
    // 执行uptime命令获取基本信息
    try {
      const uptimeResult = await this.sshPool.execCommand(
        deviceId,
        vpnIp,
        22,
        'echo "{\"status\":\"online\",\"uptime\":\"$(uptime -p)\"}"',
        10000
      );
      
      // 执行df命令获取磁盘
      const diskResult = await this.sshPool.execCommand(
        deviceId,
        vpnIp,
        22,
        "df -h / | tail -1 | awk '{print $2\",\"$3\",\"$4\",\"$5}'",
        10000
      );
      
      // 执行free命令获取内存
      const memResult = await this.sshPool.execCommand(
        deviceId,
        vpnIp,
        22,
        "free -m | grep Mem | awk '{print $2\",\"$3\",\"$4}'",
        10000
      );
      
      return {
        device_id: deviceId,
        status: device.status,
        uptime_output: uptimeResult.stdout.trim(),
        disk_info: diskResult.stdout.trim(),
        memory_info: memResult.stdout.trim(),
        last_heartbeat: device.last_heartbeat
      };
    } catch (err) {
      // 如果SSH执行失败，返回基本信息
      return {
        device_id: deviceId,
        status: device.status,
        last_heartbeat: device.last_heartbeat,
        note: '实时状态获取失败，使用最后心跳信息'
      };
    }
  }
  
  // 关闭连接池
  destroy() {
    this.sshPool.destroy();
  }
}

module.exports = ExecService;