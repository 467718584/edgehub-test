/**
 * Sysinfo Polling Service
 * Periodically queries all online devices for system information
 */

// Get sysinfo command based on device type
function getSysinfoCommand(deviceType) {
  if (deviceType && (deviceType === 'windows' || deviceType.includes('win'))) {
    // Windows - use systeminfo which is more reliable
    return 'systeminfo';
  } else {
    // Linux/ARM - use simple JSON format
    return 'echo {\"cpu\":\"Unknown\",\"cores\":\"$(nproc)\",\"memory\":{\"total\":\"$(free -m | grep Mem | awk \\\"{print \\\\\\$2}\\\")\",\"free\":\"$(free -m | grep Mem | awk \\\"{print \\\\\\$4}\\\")\"}}';
  }
}

// Parse sysinfo from command result
function parseSysinfo(stdout, deviceType) {
  if (!stdout) return null;
  
  try {
    if (deviceType && (deviceType === 'windows' || deviceType.includes('win'))) {
      return parseWindowsSysinfo(stdout);
    } else {
      return parseLinuxSysinfo(stdout);
    }
  } catch (err) {
    console.log('[SysinfoPolling] Parse error:', err.message);
    return null;
  }
}

function parseWindowsSysinfo(stdout) {
  const result = { 
    cpu: { model: 'Unknown', cores: 0, usage: 0 }, 
    memory: { total: 0, free: 0, percent: 0 },
    platform: 'Windows',
    python: '-',
    uptime: 0
  };
  
  const lines = stdout.split('\n');
  let processorCount = 0;
  let cpuModel = 'Unknown';
  
  for (const line of lines) {
    const lineTrim = line.trim();
    
    // Parse processor count and model
    if (lineTrim.startsWith('处理器:')) {
      const countMatch = lineTrim.match(/安装了\s*(\d+)\s*个处理器/);
      if (countMatch) {
        processorCount = parseInt(countMatch[1]);
      }
    } else if (lineTrim.startsWith('[0') && lineTrim.includes('Family')) {
      const cpuMatch = lineTrim.match(/\]:\s*(.+)\s+~\d+\s*Mhz/);
      if (cpuMatch) {
        cpuModel = cpuMatch[1].trim();
      }
    } else if (lineTrim.startsWith('物理内存总量:')) {
      const memMatch = lineTrim.match(/[\d,]+/);
      if (memMatch) {
        result.memory.total = parseInt(memMatch[0].replace(/,/g, ''));
      }
    } else if (lineTrim.startsWith('可用的物理内存:')) {
      const memMatch = lineTrim.match(/[\d,]+/);
      if (memMatch) {
        result.memory.free = parseInt(memMatch[0].replace(/,/g, ''));
      }
    } else if (lineTrim.startsWith('系统启动时间:')) {
      // Parse uptime - format: "2026/6/10, 17:38:22"
      const uptimeMatch = lineTrim.match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/);
      if (uptimeMatch) {
        const bootTime = new Date(uptimeMatch[1], uptimeMatch[2]-1, uptimeMatch[3], uptimeMatch[4], uptimeMatch[5], uptimeMatch[6]);
        const now = new Date();
        result.uptime = Math.floor((now - bootTime) / 1000); // seconds
      }
    }
  }
  
  result.cpu.model = cpuModel;
  result.cpu.cores = processorCount;
  
  // Calculate memory usage percent
  if (result.memory.total > 0) {
    const usedMem = result.memory.total - result.memory.free;
    result.memory.percent = Math.round((usedMem / result.memory.total) * 100);
  }
  
  // CPU usage - placeholder since systeminfo doesn't provide real-time CPU usage
  // In a real scenario, you might use typeperf or other tools
  result.cpu.usage = 0;
  
  return result;
}

function parseLinuxSysinfo(stdout) {
  try {
    const data = JSON.parse(stdout.trim());
    // Convert Linux format to frontend format
    return {
      cpu: { 
        model: data.cpu?.model || data.cpu || 'Unknown', 
        cores: parseInt(data.cpu?.cores) || 0, 
        usage: 0 
      },
      memory: { 
        total: parseInt(data.memory?.total) || 0, 
        free: parseInt(data.memory?.free) || 0, 
        percent: data.memory?.percent || 0 
      },
      platform: data.platform || 'Linux',
      python: data.python || '-',
      uptime: parseInt(data.uptime) || 0
    };
  } catch (e) {
    return null;
  }
}

// Handle sysinfo command result
function handleSysinfoResult(msg) {
  if (!msg.command_id || !msg.command_id.startsWith('sysinfo_')) {
    return false;
  }
  
  console.log('[SysinfoPolling] Received sysinfo result for:', msg.deviceId, 'success:', msg.success);
  
  if (!msg.success || !msg.stdout) {
    console.log('[SysinfoPolling] Sysinfo command failed');
    return true;
  }
  
  try {
    const deviceId = msg.deviceId;
    // Detect device type from sysinfo content
    const isWindows = msg.stdout.includes('处理器:') || msg.stdout.includes('物理内存总量');
    const sysinfo = isWindows ? parseWindowsSysinfo(msg.stdout) : parseLinuxSysinfo(msg.stdout);
    
    if (sysinfo && global.db) {
      global.db.updateDeviceSysinfo(deviceId, sysinfo).then(() => {
        console.log('[SysinfoPolling] Updated sysinfo:', JSON.stringify(sysinfo).substring(0, 100));
      }).catch(err => {
        console.error('[SysinfoPolling] Failed to update sysinfo:', err.message);
      });
    }
  } catch (err) {
    console.error('[SysinfoPolling] Error handling result:', err.message);
  }
  
  return true;
}

// Send sysinfo query to all online devices via WebSocket
async function pollAllDevicesSysinfo() {
  if (!global.db) {
    console.log('[SysinfoPolling] Database not initialized, skipping');
    return;
  }
  
  const { pushCommandToDevice } = require('../utils/ws-server');
  
  try {
    const devices = await global.db.getAllDevices();
    const now = Date.now();
    
    for (const device of devices) {
      // Only query devices that are online (connected via WS)
      if (global.deviceClients && global.deviceClients.has(device.device_id)) {
        const sysinfoCmd = getSysinfoCommand(device.device_type);
        const commandId = `sysinfo_${now}_${device.device_id.substring(0, 8)}`;
        
        console.log(`[SysinfoPolling] Querying ${device.device_name} (${device.device_type})`);
        
        // Send via WebSocket
        const result = await pushCommandToDevice(device.device_id, {
          command_id: commandId,
          command: sysinfoCmd,
          timeout_ms: 20000
        });
        
        if (result.success) {
          console.log(`[SysinfoPolling] Sysinfo command sent to ${device.device_name}`);
        }
      }
    }
  } catch (err) {
    console.error('[SysinfoPolling] Error:', err.message);
  }
}

// Start the polling interval
function startSysinfoPolling(intervalMs = 60000) {
  console.log(`[SysinfoPolling] Starting with ${intervalMs/1000}s interval`);
  
  // Initial poll after 10 seconds
  setTimeout(pollAllDevicesSysinfo, 10000);
  
  // Then poll every interval
  setInterval(pollAllDevicesSysinfo, intervalMs);
}

module.exports = {
  pollAllDevicesSysinfo,
  startSysinfoPolling,
  handleSysinfoResult
};