const config = require('../config');

class DeviceService {
  constructor(db) {
    this.db = db;
  }
  
  // 注册设备
  async registerDevice(deviceInfo) {
    // 检查是否已存在
    const existing = await this.db.getDevice(deviceInfo.device_id);
    
    if (existing) {
      // 更新设备信息
      await this.db.updateDevice(deviceInfo.device_id, {
        device_name: deviceInfo.device_name,
        os_version: deviceInfo.os_version,
        status: 'online',
        last_heartbeat: new Date().toISOString()
      });
      
      const updated = await this.db.getDevice(deviceInfo.device_id);
      return { ...updated, isNew: false };
    }
    
    // 分配VPN IP
    const vpnIp = await this.allocateVpnIp();
    
    // 创建新设备
    const device = await this.db.createDevice({
      ...deviceInfo,
      vpn_ip: vpnIp,
      status: 'online'
    });
    
    return { ...device, isNew: true };
  }
  
  // 分配VPN IP (10.0.0.2 - 10.0.0.254)
  async allocateVpnIp() {
    const usedIps = await this.db.getUsedVpnIps();
    
    const startIp = config.vpn?.pool?.start || '10.0.0.2';
    const endIp = config.vpn?.pool?.end || '10.0.0.254';
    
    const startNum = parseInt(startIp.split('.')[3]);
    const endNum = parseInt(endIp.split('.')[3]);
    
    for (let i = startNum; i <= endNum; i++) {
      const ip = `10.0.0.${i}`;
      if (!usedIps.includes(ip)) {
        return ip;
      }
    }
    
    throw new Error('VPN_IP_EXHAUSTED');
  }
  
  // 处理心跳
  async handleHeartbeat(deviceId, heartbeatData) {
    const device = await this.db.getDevice(deviceId);
    
    if (!device) {
      throw new Error('DEVICE_NOT_FOUND');
    }
    
    const updateData = {
      last_heartbeat: new Date().toISOString(),
      status: 'online'
    };
    
    // 保存sysinfo（如果有心跳数据中的sysinfo）
    if (heartbeatData && heartbeatData.sysinfo) {
      updateData.sysinfo = JSON.stringify(heartbeatData.sysinfo);
    }
    
    await this.db.updateHeartbeat(deviceId, updateData);
  }
  
  // 获取所有设备
  async getAllDevices() {
    return await this.db.getAllDevices();
  }
  
  // 获取设备详情
  async getDevice(deviceId) {
    return await this.db.getDevice(deviceId);
  }
  
  // 删除设备
  async deleteDevice(deviceId) {
    return await this.db.deleteDevice(deviceId);
  }
  
  // 标记设备离线
  async markOffline(deviceId) {
    await this.db.updateDeviceStatus(deviceId, 'offline');
  }
}

module.exports = DeviceService;