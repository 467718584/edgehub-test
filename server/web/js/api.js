/**
 * EdgeHub API Client
 */

const api = {
  // 通用请求方法 - 智能处理路径
  async request(method, path, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.getApiKey()
      }
    };
    
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    try {
      // 智能处理路径：绝对路径(/开头)直接使用，相对路径添加API_BASE
      const base = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE) ? CONFIG.API_BASE : '';
      const url = path.startsWith('/') ? path : base + path;
      
      const response = await fetch(url, options);
      const result = await response.json();
      
      if (!response.ok && !result.success) {
        throw new Error(result.error?.message || 'API Error');
      }
      
      return result;
    } catch (error) {
      console.error('API Error:', error);
      this.showError('API请求失败: ' + error.message);
      throw error;
    }
  },
  
  // 显示错误信息到页面
  showError(message) {
    const existing = document.getElementById('api-error-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'api-error-toast';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#f44336;color:white;padding:12px 20px;border-radius:4px;z-index:10000;max-width:300px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 5000);
  },
  
  getApiKey() {
    if (typeof CONFIG !== 'undefined' && CONFIG.API_KEY) {
      return localStorage.getItem('edgehub_api_key') || CONFIG.API_KEY;
    }
    return localStorage.getItem('edgehub_api_key') || 'edgehub_secret_key';
  },
  
  setApiKey(key) {
    localStorage.setItem('edgehub_api_key', key);
  },
  
  // ========== 设备相关 ==========
  
  async getDevices() {
    return this.request('GET', '/api/v1/devices');
  },
  
  async getDevice(deviceId) {
    return this.request('GET', `/api/v1/devices/${deviceId}`);
  },
  
  async getDeviceProjects(deviceId) {
    return this.request('GET', `/api/v1/devices/${deviceId}/projects`);
  },
  
  async getDeviceLogs(deviceId, limit = 20) {
    return this.request('GET', `/api/v1/devices/${deviceId}/logs/recent?limit=${limit}`);
  },
  
  // ========== 项目相关 ==========
  
  async getProjects() {
    return this.request('GET', '/api/v1/projects');
  },
  
  async getProject(projectId) {
    return this.request('GET', `/api/v1/projects/${projectId}`);
  },
  
  async createProject(deviceId, projectData) {
    return this.request('POST', `/api/v1/devices/${deviceId}/projects`, projectData);
  },
  
  async updateProject(projectId, updates) {
    return this.request('PUT', `/api/v1/projects/${projectId}`, updates);
  },
  
  async deleteProject(projectId) {
    return this.request('DELETE', `/api/v1/projects/${projectId}`);
  },
  
  async getProjectLogs(projectId, limit = 50) {
    return this.request('GET', `/api/v1/projects/${projectId}/logs?limit=${limit}`);
  },
  
  async getProjectDebugs(projectId) {
    return this.request('GET', `/api/v1/projects/${projectId}/debugs`);
  },
  
  async createDebugRecord(projectId, data) {
    return this.request('POST', `/api/v1/projects/${projectId}/debugs`, data);
  },
  
  async updateDebugRecord(projectId, debugId, updates) {
    return this.request('PUT', `/api/v1/projects/${projectId}/debugs/${debugId}`, updates);
  },
  
  // ========== 开发记录 ==========
  
  async getRecentLogs(limit = 100) {
    return this.request('GET', `/api/v1/logs/recent?limit=${limit}`);
  },
  
  // ========== 统计 ==========
  
  async getStats() {
    return this.request('GET', '/api/v1/stats');
  },
  
  // ========== 智能体相关 ==========
  
  async getAgents() {
    return this.request('GET', '/api/v1/agents');
  },
  
  async getAgent(agentId) {
    return this.request('GET', `/api/v1/agents/${agentId}`);
  },
  
  async getProjectAgents(projectId) {
    return this.request('GET', `/api/v1/projects/${projectId}/agents`);
  },
  
  // ========== 命令相关 ==========
  
  async getCommands(options = {}) {
    const params = new URLSearchParams();
    if (options.deviceId) params.append('device_id', options.deviceId);
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    return this.request('GET', `/api/v1/commands?${params}`);
  },
  
  async createCommand(deviceId, cmd) {
    return this.request('POST', `/api/v1/devices/${deviceId}/commands`, cmd);
  },
  
  async getCommand(commandId) {
    return this.request('GET', `/api/v1/commands/${commandId}`);
  },
  
  async cancelCommand(commandId) {
    return this.request('DELETE', `/api/v1/commands/${commandId}`);
  }
};

// 导出
window.api = api;