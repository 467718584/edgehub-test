const WebSocket = require('ws');
const { handleSysinfoResult } = require("../services/sysinfoPolling");

const deviceClients = new Map();
global.deviceClients = deviceClients;
const agentClients = new Set();

// P0-1: Command subscription tracking - agent WS → command_id
// When agent subscribes to a command result, we push result directly to that agent
const commandSubscriptions = new Map(); // command_id → Set of agent WS connections

// Helper: Get agent ID from WS connection (for identification)
function getAgentId(ws) {
  // Agents are stored in agentClients Set, assign temporary ID based on object reference
  return `agent_${ws._id || (ws._id = Math.random().toString(36).slice(2, 8))}`;
}

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
      
      // 设备重连时，主动推送所有 pending 命令
      if (global.commandService) {
        global.commandService.getPendingCommandsForDevice(deviceId).then(pendingCommands => {
          if (pendingCommands && pendingCommands.length > 0) {
            console.log(`[WS] Resending ${pendingCommands.length} pending commands to ${deviceId}`);
            pendingCommands.forEach(cmd => {
              ws.send(JSON.stringify({
                type: 'command',
                data: {
                  command_id: cmd.command_id,
                  command: cmd.command,
                  timeout_ms: cmd.timeout_ms || 30000
                }
              }));
              // 更新命令状态为已推送
              global.commandService.updateCommandStatus(cmd.command_id, 'delivered_via_ws').catch(() => {});
            });
          }
        }).catch(e => {
          console.error('[WS] Failed to fetch pending commands:', e.message);
        });
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
          // P0-1: Check if any agent subscribed to this command result
          const resultMsg = { type: 'command_result', device_id: deviceId, ...msg };
          const subscribers = commandSubscriptions.get(msg.command_id);
          
          // Check if command has subscribe_result flag in DB (for REST API calls)
          let dbSubscribed = false;
          if (global.db && !subscribers) {
            try {
              const cmd = await global.db.getCommand(msg.command_id);
              dbSubscribed = cmd && cmd.subscribe_result === 1;
            } catch (e) {}
          }
          
          if ((subscribers && subscribers.size > 0) || dbSubscribed) {
            // Push directly to subscribed agents only
            const msgStr = JSON.stringify(resultMsg);
            if (subscribers) {
              subscribers.forEach((agentWs) => {
                if (agentWs.readyState === WebSocket.OPEN) {
                  agentWs.send(msgStr);
                }
              });
            } else {
              // No WS subscription but DB flag set - broadcast to all agents
              broadcastToAgents(resultMsg);
            }
            // Clean up subscription after pushing result
            commandSubscriptions.delete(msg.command_id);
          } else {
            // No subscription - broadcast to all agents (backward compatible)
            broadcastToAgents(resultMsg);
          }
          handleSysinfoResult({...msg, deviceId});
        } else if (msg.type === 'subscribe_result' && msg.command_id) {
          // P0-1: Agent subscribes to command result via WebSocket
          const agentId = getAgentId(ws);
          if (!commandSubscriptions.has(msg.command_id)) {
            commandSubscriptions.set(msg.command_id, new Set());
          }
          commandSubscriptions.get(msg.command_id).add(ws);
          console.log(`[WS] Agent ${agentId} subscribed to command result: ${msg.command_id}`);
          ws.send(JSON.stringify({ type: 'subscribed', command_id: msg.command_id }));
        } else if (msg.type === 'device_status') {
          broadcastToAgents({ type: 'device_status_update', device_id: deviceId, ...msg });
        } else if (msg.type === 'transfer_pull_info') {
          // EdgeAgent返回Pull传输的文件信息
          console.log(`[WS] Transfer pull info: ${msg.transfer_id}, size=${msg.file_size}, chunks=${msg.total_chunks}`);
          // 更新传输任务信息
          if (global.transferService && msg.transfer_id) {
            global.transferService.updatePullTransferInfo(
              msg.transfer_id,
              msg.file_size,
              msg.file_hash,
              msg.total_chunks
            ).catch(e => console.error('[WS] updatePullTransferInfo error:', e.message));
          }
          // 转发给订阅者(如果有)
          broadcastToAgents({ type: 'transfer_pull_info', device_id: deviceId, ...msg });
        } else if (msg.type === 'transfer_pull_chunk') {
          // EdgeAgent发送的分块数据
          if (global.transferService && msg.transfer_id) {
            global.transferService.receivePullChunk(
              msg.transfer_id,
              msg.chunk_index,
              msg.data,
              msg.hash,
              msg.is_last || false
            ).then(result => {
              // 广播进度
              broadcastTransferProgress(msg.transfer_id, {
                type: 'transfer_pull_chunk',
                device_id: deviceId,
                chunk_index: msg.chunk_index,
                progress: result.progress,
                is_last: msg.is_last || false
              });
            }).catch(e => {
              console.error('[WS] receivePullChunk error:', e.message);
              broadcastToAgents({ 
                type: 'transfer_error', 
                transfer_id: msg.transfer_id, 
                error: e.message 
              });
            });
          }
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

// Send custom message to device via WebSocket
function sendToDevice(deviceId, message) {
  const ws = deviceClients.get(deviceId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log(`[WS] Device ${deviceId} not connected, cannot send:`, message.type);
    return false;
  }
  ws.send(JSON.stringify(message));
  console.log(`[WS] Sent to ${deviceId}:`, message.type);
  return true;
}

// Broadcast transfer progress to all agents
function broadcastTransferProgress(transferId, progress) {
  const message = {
    type: 'transfer_progress',
    transfer_id: transferId,
    ...progress
  };
  const msgStr = JSON.stringify(message);
  agentClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msgStr);
    }
  });
}

module.exports = { initWebSocket, pushCommandToDevice, sendToDevice, broadcastToAgents, broadcastTransferProgress };