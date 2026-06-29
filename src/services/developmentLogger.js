/**
 * DevelopmentLogger - 自动记录AI开发活动
 * 
 * 这个服务会在AI执行命令时自动记录开发过程
 * 确保每一条开发信息都被追踪和保存
 */

class DevelopmentLogger {
  constructor(db) {
    this.db = db;
  }

  /**
   * 记录开发行为
   * @param {Object} params - 记录参数
   * @param {number} params.project_id - 项目ID
   * @param {string} params.device_id - 设备ID
   * @param {string} params.action_type - 操作类型
   * @param {string} params.command - 执行的命令
   * @param {string} params.stdout - 命令输出
   * @param {string} params.stderr - 错误输出
   * @param {number} params.exit_code - 退出码
   * @param {number} params.duration_ms - 执行耗时
   * @param {boolean} params.success - 是否成功
   * @param {string} params.notes - 备注说明
   */
  async log(params) {
    try {
      const logEntry = {
        project_id: params.project_id || null,
        device_id: params.device_id,
        action_type: params.action_type || 'command',
        command: params.command || '',
        stdout: params.stdout || '',
        stderr: params.stderr || '',
        exit_code: params.exit_code !== undefined ? params.exit_code : 0,
        duration_ms: params.duration_ms || 0,
        success: params.success !== undefined ? params.success : (params.exit_code === 0),
        notes: params.notes || this.generateNotes(params)
      };

      await this.db.logDevelopment(logEntry);
      console.log(`[DevLogger] Recorded: ${params.action_type} on device ${params.device_id}`);
    } catch (error) {
      console.error('[DevLogger] Failed to log:', error.message);
    }
  }

  /**
   * 根据操作类型生成备注
   */
  generateNotes(params) {
    const actionType = params.action_type;
    const command = params.command || '';
    
    switch (actionType) {
      case 'command':
        if (command.includes('git commit')) return 'Git提交代码';
        if (command.includes('git push')) return 'Git推送代码';
        if (command.includes('git pull')) return 'Git拉取代码';
        if (command.includes('npm install') || command.includes('pip install')) return '安装依赖';
        if (command.includes('python') && command.includes('train')) return '模型训练';
        if (command.includes('pytest') || command.includes('npm test')) return '运行测试';
        if (command.includes('build') || command.includes('compile')) return '构建项目';
        if (command.includes('deploy')) return '部署应用';
        if (command.includes('scp') || command.includes('rsync')) return '传输文件';
        return '执行命令';
        
      case 'deploy':
        return '部署操作';
        
      case 'test':
        return '测试执行';
        
      case 'debug':
        return '调试操作';
        
      case 'config':
        return '配置修改';
        
      case 'file_push':
        return '推送文件到设备';
        
      case 'file_pull':
        return '从设备拉取文件';
        
      default:
        return actionType;
    }
  }

  /**
   * 根据用户需求生成开发记录
   * 当用户说"在XX设备上开发XX项目"时调用此方法
   */
  async logUserRequest(params) {
    const notes = `用户需求: ${params.user_request}`;
    
    await this.log({
      project_id: params.project_id,
      device_id: params.device_id,
      action_type: 'user_request',
      command: params.user_request,
      notes,
      success: true
    });
  }

  /**
   * 记录命令执行结果（由ExecService调用）
   */
  async logCommand(deviceId, command, result, duration, projectId = null) {
    await this.log({
      project_id: projectId,
      device_id: deviceId,
      action_type: 'command',
      command,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exit_code: result.exit_code || -1,
      duration_ms: duration,
      success: result.exit_code === 0
    });
  }

  /**
   * 记录文件传输
   */
  async logFileTransfer(deviceId, filePath, direction, result, projectId = null) {
    await this.log({
      project_id: projectId,
      device_id: deviceId,
      action_type: direction === 'push' ? 'file_push' : 'file_pull',
      command: `${direction === 'push' ? 'scp' : 'pull'}: ${filePath}`,
      notes: `${direction === 'push' ? '推送' : '拉取'}文件: ${filePath}`,
      success: result.success,
      stdout: result.file_size ? `size: ${result.file_size}` : ''
    });
  }

  /**
   * 记录调试过程
   */
  async logDebug(projectId, deviceId, issueTitle, issueDescription, solution, filesModified = []) {
    // 先创建调试记录
    await this.db.createDebugRecord({
      project_id: projectId,
      device_id: deviceId,
      issue_title: issueTitle,
      issue_description: issueDescription,
      solution,
      files_modified: filesModified,
      outcome: solution ? 'resolved' : 'open'
    });

    // 再记录开发日志
    await this.log({
      project_id: projectId,
      device_id: deviceId,
      action_type: 'debug',
      notes: solution ? `解决问题: ${issueTitle}` : `遇到问题: ${issueTitle}`
    });
  }

  /**
   * 记录项目创建
   */
  async logProjectCreation(projectId, deviceId, projectName, projectPath) {
    await this.log({
      project_id: projectId,
      device_id: deviceId,
      action_type: 'project_create',
      command: `创建项目: ${projectName}`,
      notes: `在 ${projectPath} 创建新项目`,
      success: true
    });
  }
}

module.exports = DevelopmentLogger;