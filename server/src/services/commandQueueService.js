const { pushCommandToDevice } = require('../utils/ws-server');

class CommandQueueService {
  constructor(db, sshPool) {
    this.db = db;
    this.sshPool = sshPool;
  }

  // ========== M5: 命令下发 ==========

  /**
   * 获取设备命令列表
   */
  async getCommands(deviceId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    return await this.db.getCommandsByDevice(deviceId, { status, limit, offset });
  }

  /**
   * 下发命令到指定设备 - WS优先，推送失败则保持pending(HTTPPoll模式)
   */
  async enqueueCommand(deviceId, cmd) {
    const device = await this.db.getDevice(deviceId);
    if (!device) {
      const error = new Error('设备不存在');
      error.statusCode = 404;
      error.code = 'DEVICE_NOT_FOUND';
      throw error;
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const command = await this.db.createCommand({
      command_id: commandId,
      device_id: deviceId,
      command: cmd.command,
      priority: cmd.priority || 5,
      timeout_ms: cmd.timeout_ms || 30000,
      subscribe_result: cmd.subscribe_result || false,
      callback_url: cmd.callback_url,
      callback_headers: cmd.callback_headers
    });

    // 尝试通过 WebSocket 推送命令到设备
    const wsResult = await pushCommandToDevice(deviceId, {
      command_id: commandId,
      command: cmd.command,
      timeout_ms: cmd.timeout_ms || 30000
    });

    if (wsResult.success) {
      // WS推送成功 - 标记为delivered_via_ws，设备会通过WS响应结果
      await this.db.updateCommandStatus(commandId, 'delivered_via_ws');
      return { success: true, command_id: commandId, status: 'delivered_via_ws', mode: 'ws' };
    }

    // WS不可用 - 保持pending状态，设备通过HTTPPoll拉取
    return { success: true, command_id: commandId, status: 'pending', mode: 'http_poll' };
  }

  // ========== M6: 命令拉取（HTTP模式备用） ==========

  async fetchCommands(deviceId, lastCommandId = 0, limit = 10) {
    const commands = await this.db.fetchPendingCommands(deviceId, lastCommandId, limit);
    for (const cmd of commands) {
      await this.db.updateCommandStatus(cmd.command_id, 'fetched');
    }
    return {
      commands: commands.map(c => ({
        command_id: c.command_id,
        command: c.command,
        timeout_ms: c.timeout_ms,
        priority: c.priority,
        created_at: c.created_at
      })),
      count: commands.length,
      next_offset: commands.length > 0 ? Math.max(...commands.map(c => c.id)) : lastCommandId
    };
  }

  // ========== M7: 命令结果回调 ==========

  async reportCommandResult(deviceId, commandId, result) {
    const command = await this.db.getCommand(commandId);
    if (!command) return { success: false, error: 'Command not found' };
    const status = result.success ? 'completed' : 'failed';
    await this.db.updateCommandStatus(commandId, status, {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exit_code: result.success ? 0 : -1,
      duration_ms: result.duration_ms || 0
    });
    return { success: true, status };
  }

  // 执行命令（SSH模式 - 备用）
  async executeCommand(deviceId, commandId, timeout = 30000) {
    const command = await this.db.getCommand(commandId);
    if (!command) {
      const error = new Error('命令不存在');
      error.statusCode = 404;
      error.code = 'COMMAND_NOT_FOUND';
      throw error;
    }
    const device = await this.db.getDevice(deviceId);
    if (!device || device.status !== 'online') {
      const error = new Error('设备不在线');
      error.statusCode = 503;
      error.code = 'DEVICE_OFFLINE';
      throw error;
    }
    // P0-2: Use command's stored timeout_ms if available, otherwise use provided timeout
    const effectiveTimeout = command.timeout_ms || timeout;
    try {
      const startTime = Date.now();
      const result = await this.sshPool.execCommand(deviceId, device.vpn_ip, 22, command.command, effectiveTimeout);
      const duration = Date.now() - startTime;
      return await this.reportCommandResult(deviceId, commandId, {
        stdout: result.stdout, stderr: result.stderr, exit_code: result.exitCode, duration_ms: duration, success: result.exitCode === 0
      });
    } catch (err) {
      return await this.reportCommandResult(deviceId, commandId, { stdout: '', stderr: err.message, exit_code: -1, duration_ms: 0, success: false });
    }
  }

  // 获取命令详情
  async getCommand(commandId) {
    return await this.db.getCommand(commandId);
  }

  // 列出设备命令
  async listCommands(deviceId, status, limit = 20) {
    return await this.db.listCommands(deviceId, status, limit);
  }

  // 取消命令
  async cancelCommand(commandId) {
    const cmd = await this.db.getCommand(commandId);
    if (!cmd) return { success: false, error: 'Command not found' };
    if (cmd.status !== 'pending') return { success: false, error: 'Cannot cancel non-pending command' };
    await this.db.updateCommandStatus(commandId, 'cancelled');
    return { success: true };
  }
}

module.exports = CommandQueueService;
