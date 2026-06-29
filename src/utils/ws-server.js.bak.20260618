const WebSocket = require('ws');
const { handleSysinfoResult } = require("../services/sysinfoPolling");

const deviceClients = new Map();
global.deviceClients = deviceClients;
const agentClients = new Set();

function initWebSocket(server) {
  const wss = new WebSocket.Server({ noServer: true });

  // Handle HTTP Upgrade for /ws path
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        for (const [deviceId, client] of deviceClients.entries()) {
          if (client === ws) {
            deviceClients.delete(deviceId);
            // Mark device as offline when WS connection dies
            if (global.db) {
              global.db.updateDeviceStatus(deviceId, 'offline').catch(() => {});
            }
            break;
          }
        }
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    const url = new URL(req.url, 'http://localhost');
    const deviceId = url.searchParams.get('device_id');
    const apiKey = url.searchParams.get('api_key');
    const clientType = url.searchParams.get('type') || 'device';

    console.log('[WS] New connection:', { deviceId, clientType });

    if (clientType === 'device') {
      if (apiKey !== 'edgehub_secret_key') {
        ws.close(4001, 'Invalid API key'); return;
      }
      if (!deviceId) { ws.close(4002, 'Missing device_id'); return; }
      
      deviceClients.set(deviceId, ws);
      console.log('[WS] Device connected:', deviceId);
      ws.send(JSON.stringify({ type: 'connected', device_id: deviceId }));
      
      // Update device status to online when WS connects
      if (global.db) {
        global.db.updateDeviceStatus(deviceId, 'online').catch(() => {});
      }
    } else {
      agentClients.add(ws);
    }

    ws.on('message', async (data) => {
      try {
        // Handle various message formats - Buffer, wrapped, string
        let rawData = data;
        if (Buffer.isBuffer(data)) {
          rawData = data.toString('utf8');
        } else if (typeof data === 'object' && data !== null && data.type === 'Buffer' && Array.isArray(data.data)) {
          rawData = Buffer.from(data.data).toString('utf8');
        } else if (typeof data === 'object' && data !== null && data.type === undefined && data.data !== undefined) {
          rawData = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
        }
        let msg = JSON.parse(rawData);
        // Handle double-encoded JSON (string containing JSON)
        if (typeof msg === 'string') {
          try { msg = JSON.parse(msg); } catch(e) {}
        }
        console.log("[WS] RX msg.type:", msg.type, "keys:", Object.keys(msg).join(','), "sample:", JSON.stringify(msg).substring(0, 80));
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          // Heartbeat ping - update device last_heartbeat
          if (deviceId && global.db) {
            global.db.updateDeviceStatus(deviceId, 'online').catch(() => {});
          }
        } else if (msg.type === 'command_result') {
          // Device reported command result - update DB
          if (global.db && msg.command_id) {
            const status = msg.success ? 'completed' : 'failed';
            global.db.updateCommandStatus(msg.command_id, status, {
              stdout: msg.stdout || '',
              stderr: msg.stderr || '',
              exit_code: msg.success ? 0 : -1,
              duration_ms: msg.duration_ms || 0
            }).catch(e => console.error('[WS] Failed to update command result:', e.message));
          }
          broadcastToAgents({ type: 'command_result', device_id: deviceId, ...msg });
          handleSysinfoResult({...msg, deviceId});
        } else if (msg.type === 'device_status') {
          broadcastToAgents({ type: 'device_status_update', device_id: deviceId, ...msg });
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });

    ws.on('pong', () => { ws.isAlive = true; if (deviceId && global.db) { global.db.updateHeartbeat(deviceId).catch(() => {}); } });
    ws.on('close', () => {
      console.log('[WS] Device disconnected:', deviceId);
      if (deviceId) {
        deviceClients.delete(deviceId);
        // Mark device offline when WS connection closes
        if (global.db) {
          global.db.updateDeviceStatus(deviceId, 'offline').catch(() => {});
        }
      }
      agentClients.delete(ws);
    });
  });

  console.log('[WS] WebSocket server initialized on /ws');
  return wss;
}

function broadcastToAgents(message) {
  const msgStr = JSON.stringify(message);
  agentClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msgStr);
  });
}

// Push command to device via WebSocket (WS mode - primary)
async function pushCommandToDevice(deviceId, command) { console.log("[WS] pushCommandToDevice called:", deviceId, command.command_id);
  const ws = deviceClients.get(deviceId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'Device not connected via WS' };
  }
  console.log("[WS] Sending command:", command.command_id, "content:", JSON.stringify({ type: "command", data: { command_id: command.command_id, command: command.command, timeout_ms: command.timeout_ms || 30000 }, ...command }).substring(0, 100));
    ws.send(JSON.stringify({ type: "command", data: { command_id: command.command_id, command: command.command, timeout_ms: command.timeout_ms || 30000 }, ...command }));
  return { success: true };
}

module.exports = { initWebSocket, pushCommandToDevice, broadcastToAgents };