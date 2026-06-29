/**
 * EdgeHub Web Application
 */

// 全局状态
const state = {
  devices: [],
  projects: [],
  currentDevice: null,
  currentProject: null
};

// 页面导航
function navigateTo(page, params = {}) {
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // 显示目标页面
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // 更新标题
  const titles = {
    dashboard: '系统概览',
    devices: '设备列表',
    projects: '项目',
    logs: '开发记录',
    'device-detail': '设备详情',
    'project-detail': '项目详情',
    transfers: '文件传输'
  };
  document.getElementById('page-title').textContent = titles[page] || 'EdgeHub';
  
  // 更新导航高亮
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === page) {
      item.classList.add('active');
    }
  });
  
  // 加载对应页面数据
  switch (page) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'devices':
      loadDevices();
      break;
    case 'projects':
      loadProjects();
      break;
    case 'logs':
      loadLogs();
      break;
    case 'device-detail':
      loadDeviceDetail(params.deviceId);
      break;
    case 'project-detail':
      loadProjectDetail(params.projectId);
      break;
    case 'agents':
      loadAgents();
      break;
    case 'agent-detail':
      loadAgentDetail(params.agentId);
      break;
    case 'commands':
      loadCommands();
      break;
    case 'transfers':
      if (window.loadTransfersPage) window.loadTransfersPage();
      break;
  }
}

// 加载仪表盘
// 加载命令页面
async function loadCommands() {
  const container = document.getElementById('commands-container');
  if (!container) return;
  
  container.innerHTML = '<p class="loading">加载中...</p>';
  
  try {
    const res = await api.request('GET', '/api/v1/commands/recent?limit=50');
    if (res.success && res.data) {
      if (res.data.length === 0) {
        container.innerHTML = '<p class="empty">暂无命令记录</p>';
        return;
      }
      const html = res.data.map(cmd => {
        const statusClass = cmd.status === 'completed' ? 'success' : (cmd.status === 'failed' ? 'error' : 'pending');
        const time = cmd.created_at ? new Date(cmd.created_at).toLocaleString('zh-CN') : '-';
        return '<div class="command-item ' + statusClass + '">' +
          '<div class="command-info">' +
          '<span class="command-id">' + (cmd.command_id || '').substring(0, 16) + '...</span>' +
          '<span class="status-badge ' + statusClass + '">' + cmd.status + '</span>' +
          '</div>' +
          '<div class="command-text">' + (cmd.command || '-') + '</div>' +
          '<div class="command-time">' + time + '</div>' +
          '</div>';
      }).join('');
      container.innerHTML = html;
    } else {
      container.innerHTML = '<p class="error">加载失败</p>';
    }
  } catch (error) {
    console.error('Failed to load commands:', error);
    container.innerHTML = '<p class="error">加载失败: ' + error.message + '</p>';
  }
}

async function loadDashboard() {
  try {
    // 加载统计数据
    const statsRes = await api.getStats();
    if (statsRes.success) {
      const s = statsRes.data;
      document.getElementById('stat-devices').textContent = s.total_devices || 0;
      document.getElementById('stat-projects').textContent = s.total_projects || 0;
      document.getElementById('stat-logs').textContent = s.total_logs || 0;
      document.getElementById('stat-issues').textContent = s.open_issues || 0;
    }
    
    // 加载活跃项目
    const projectsRes = await api.getProjects();
    if (projectsRes.success) {
      const activeProjects = (projectsRes.data || []).filter(p => p.status === 'active').slice(0, 5);
      renderActiveProjects(activeProjects);
    }
    
    // 加载最近记录
    const logsRes = await api.getRecentLogs(20);
    if (logsRes.success) {
      renderRecentLogs(logsRes.data || []);
    }
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

// 渲染活跃项目
function renderActiveProjects(projects) {
  const container = document.getElementById('active-projects-list');
  
  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📁</div><p>暂无活跃项目</p></div>';
    return;
  }
  
  container.innerHTML = projects.map(p => `
    <div class="project-item" onclick="navigateTo('project-detail', {projectId: ${p.id}})">
      <div class="project-info">
        <h4>${p.project_name}</h4>
        <p class="path">${p.project_path}</p>
      </div>
      <div class="project-device">${p.device_name || p.device_id}</div>
    </div>
  `).join('');
}

// 渲染最近记录
function renderRecentLogs(logs) {
  const container = document.getElementById('recent-logs-list');
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>暂无开发记录</p></div>';
    return;
  }
  
  container.innerHTML = logs.slice(0, 10).map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN');
    const typeClass = `type-${log.action_type || 'command'}`;
    const successClass = log.success ? 'log-success' : 'log-failed';
    const successIcon = log.success ? '✓' : '✗';
    
    return `
      <div class="log-item">
        <div class="log-time">${time}</div>
        <div class="log-content">
          <span class="log-type ${typeClass}">${log.action_type || 'command'}</span>
          ${log.project_name ? `<span class="log-project">${log.project_name}</span>` : ''}
          <div class="log-command">${log.command || log.notes || '-'}</div>
          <div class="log-result ${successClass}">${successIcon} ${log.exit_code === 0 ? '成功' : '失败'}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 加载设备列表
async function loadDevices() {
  try {
    const res = await api.getDevices();
    if (res.success) {
      state.devices = res.data || [];
      renderDevices();
    }
  } catch (error) {
    console.error('Failed to load devices:', error);
    document.getElementById('device-list').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 渲染设备列表
function renderDevices() {
  const container = document.getElementById('device-list');
  const svgDevice = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  
  if (state.devices.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">' + svgDevice + '</div><p>暂无设备</p><p>请先在EdgeAgent配置设备并连接VPN</p></div>';
    return;
  }
  
  container.innerHTML = state.devices.map(d => {
    const statusClass = d.status === 'online' ? 'online' : 'offline';
    const statusText = d.status === 'online' ? '在线' : '离线';
    const lastActive = d.last_heartbeat ? new Date(d.last_heartbeat).toLocaleString('zh-CN') : '-';
    
    // 解析sysinfo字符串
    let sysinfo = d.sysinfo;
    if (sysinfo && typeof sysinfo === 'string') {
      try { sysinfo = JSON.parse(sysinfo); } catch (e) { sysinfo = null; }
    }
    
    return `
      <div class="device-card ${statusClass}" onclick="navigateTo('device-detail', {deviceId: '${d.device_id}'})">
        <div class="device-card-header">
          <div class="device-icon">${svgDevice}</div>
          <div class="device-card-info">
            <h4>${d.device_name}</h4>
            <p>${d.device_type || '-'} · ${d.os_version ? d.os_version.split(' ')[0] : '-'}</p>
            ${d.vpn_ip ? '<span class="device-vpn">' + d.vpn_ip + '</span>' : ''}
          </div>
        </div>
        <div class="device-status-row">
          <span class="status-badge status-${statusClass}">${statusText}</span>
          <span class="last-active">最后活跃: ${lastActive}</span>
        </div>
        ${sysinfo ? `
        <div class="device-resources">
          <div class="resource-bar" style="font-size:11px;">
            <span class="resource-label">CPU</span>
            <span class="resource-value">${sysinfo.cpu?.model || '-'} (${sysinfo.cpu?.cores || 0}核)</span>
          </div>
          <div class="resource-bar">
            <span class="resource-label">内存</span>
            <div class="progress"><div class="progress-fill mem" style="width:${sysinfo.memory?.percent || 0}%"></div></div>
            <span class="resource-value">${sysinfo.memory?.percent || 0}%</span>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// 加载设备详情
async function loadDeviceDetail(deviceId) {
  try {
    const deviceRes = await api.getDevice(deviceId);
    const projectsRes = await api.getDeviceProjects(deviceId);
    const logsRes = await api.getDeviceLogs(deviceId, 20);
    
    if (!deviceRes.success) {
      throw new Error('Device not found');
    }
    
    const device = deviceRes.data;
    if (device.sysinfo && typeof device.sysinfo === "string") { try { device.sysinfo = JSON.parse(device.sysinfo); } catch (e) { device.sysinfo = {}; } }
    const projects = projectsRes.success ? projectsRes.data.projects : [];
    const logs = logsRes.success ? logsRes.data : [];
    
    const container = document.getElementById('device-detail-content');
    const statusClass = device.status === 'online' ? 'status-online' : 'status-offline';
    
    container.innerHTML = `
      <div class="detail-page-container">
        <div class="detail-header-card">
          <h2>${device.device_name}</h2>
          <div class="detail-path">${device.vpn_ip || 'N/A'} · ${device.device_type}</div>
          <div class="detail-meta-grid">
            <div class="detail-meta-item">
              <div class="meta-label">状态</div>
              <div class="meta-value"><span class="status-badge ${statusClass}">${device.status}</span></div>
            </div>
            <div class="detail-meta-item">
              <div class="meta-label">架构</div>
              <div class="meta-value">${device.architecture || '-'}</div>
            </div>
            <div class="detail-meta-item">
              <div class="meta-label">系统</div>
              <div class="meta-value">${device.os_version ? device.os_version.split(' ')[0] : '-'}</div>
            </div>
            <div class="detail-meta-item">
              <div class="meta-label">注册时间</div>
              <div class="meta-value">${device.registered_at ? new Date(device.registered_at).toLocaleDateString('zh-CN') : '-'}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h4>🖥️ 系统状态</h4>
          </div>
          <div class="section-body">
            <div class="sysinfo-grid">
              <div class="sysinfo-item">
                <label>平台</label>
                <div class="gauge">${device.sysinfo?.platform || '-'}</div>
                <div class="sysinfo-detail">Python: ${device.sysinfo?.python || '-'}</div>
              </div>
              <div class="sysinfo-item">
                <label>运行时间</label>
                <div class="gauge">${Math.floor((device.sysinfo?.uptime || 0) / 86400)}天</div>
                <div class="sysinfo-detail">${Math.floor(((device.sysinfo?.uptime || 0) % 86400) / 3600)}小时</div>
              </div>
              <div class="sysinfo-item">
                <label>系统负载 (1/5/15min)</label>
                <div class="gauge">${device.sysinfo?.load_1min || '-'}</div>
                <div class="sysinfo-detail">5min: ${device.sysinfo?.load_5min || '-'} | 15min: ${device.sysinfo?.load_15min || '-'}</div>
              </div>
            </div>
            </div>
            <div class="sysinfo-footer">
              <span>运行时间: ${device.sysinfo?.uptime || '-'}</span>
              <span>最后心跳: ${device.last_heartbeat || '-'}</span>
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <h3>项目 (${projects.length})</h3>
          ${projects.length > 0 ? `
            <div style="margin-top: 16px;">
              ${projects.map(p => `
                <div class="detail-card-item" onclick="event.stopPropagation(); navigateTo('project-detail', {projectId: ${p.id}})">
                  <h4>${p.project_name}</h4>
                  <p>${p.project_path}</p>
                  <div class="card-footer">
                    <span class="status-badge status-${p.status}">${p.status}</span>
                    <span style="font-size:12px;color:var(--text-muted)">P${p.priority}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:#888;margin-top:16px">暂无项目</p>'}
        </div>
        
        <div class="card">
          <h3>最近开发记录 (${logs.length})</h3>
          ${logs.length > 0 ? `
            <div style="margin-top: 16px;">
              ${logs.map(log => {
                const time = new Date(log.timestamp).toLocaleString('zh-CN');
                const successClass = log.success ? 'log-success' : 'log-failed';
                return `
                  <div class="log-item">
                    <div class="log-time">${time}</div>
                    <div class="log-content">
                      <span class="log-type type-${log.action_type}">${log.action_type}</span>
                      <div class="log-command">${log.command || log.notes || '-'}</div>
                      <div class="log-result ${successClass}">${log.success ? '✓ 成功' : '✗ 失败'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<p style="color:#888;margin-top:16px">暂无记录</p>'}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load device detail:', error);
    document.getElementById('device-detail-content').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 加载项目列表
async function loadProjects() {
  try {
    const res = await api.getProjects();
    if (res.success) {
      state.projects = res.data || [];
      renderProjects();
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
    document.getElementById('projects-list').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 渲染项目列表
function renderProjects() {
  const container = document.getElementById('projects-list');
  const svgFolder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const svgLog = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  
  if (state.projects.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">' + svgFolder + '</div><p>暂无项目</p><button class="btn btn-primary" onclick="showCreateProjectModal()">创建第一个项目</button></div>';
    return;
  }
  
  container.innerHTML = state.projects.map(p => {
    const statusClass = p.status;
    const statusText = { active: '进行中', paused: '已暂停', completed: '已完成' };
    const priorityStars = '★'.repeat(11 - p.priority) + '☆'.repeat(Math.max(0, p.priority - 1));
    
    return `
      <div class="project-card" onclick="navigateTo('project-detail', {projectId: ${p.id}})">
        <div class="project-card-header">
          <div class="project-icon">${svgFolder}</div>
          <div class="project-card-info">
            <h4>${p.project_name}</h4>
            <span class="project-path">${p.project_path}</span>
          </div>
        </div>
        ${p.description ? `<p style="color:var(--text-muted);font-size:13px;margin:0 0 12px 0">${p.description}</p>` : ''}
        <div class="project-meta-row">
          <span class="status-badge status-${statusClass}">${statusText[p.status] || p.status}</span>
          <span class="priority-stars">${priorityStars}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 加载项目详情
async function loadProjectDetail(projectId) {
  try {
    const res = await api.getProject(projectId);
    
    if (!res.success) {
      throw new Error('Project not found');
    }
    
    const { project, logs, debugs } = res.data;
    
    // 提取已完成任务（从成功的 deploy/test 记录中提取里程碑）
    const completedMilestones = logs.filter(log => 
      (log.action_type === 'deploy' || log.action_type === 'test') && log.success
    ).map(log => ({
      command: log.command,
      notes: log.notes,
      time: log.timestamp
    }));
    
    // 提取待办任务（从 debug_records 中获取 pending 状态）
    const pendingTasks = debugs.filter(d => d.outcome !== 'resolved').map(d => ({
      title: d.issue_title,
      description: d.issue_description,
      created: d.timestamp
    }));
    
    // 项目要点
    const projectKeyPoints = [
      { label: '项目路径', value: project.project_path },
      { label: '优先级', value: '★'.repeat(11 - project.priority) + '☆'.repeat(Math.max(0, project.priority - 1)) },
      { label: '状态', value: { active: '进行中', paused: '已暂停', completed: '已完成' }[project.status] || project.status },
      { label: '创建时间', value: project.created_at ? new Date(project.created_at).toLocaleDateString('zh-CN') : '-' },
      { label: '最后活动', value: project.last_activity ? new Date(project.last_activity).toLocaleDateString('zh-CN') : '-' }
    ];
    
    const container = document.getElementById('project-detail-content');
    const statusText = { active: '进行中', paused: '已暂停', completed: '已完成' };
    const statusClass = `status-${project.status}`;
    
    container.innerHTML = `
      <div class="detail-page-container">
        <div class="detail-header-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h2>${project.project_name}</h2>
              <div class="detail-path">${project.project_path}</div>
            </div>
            <span class="status-badge ${statusClass}">${statusText[project.status] || project.status}</span>
          </div>
          ${project.description ? `<p style="color:var(--text-muted);margin-top:16px">${project.description}</p>` : ''}
        </div>

        <div class="detail-section">
          <h3>📌 项目要点</h3>
          <div class="key-points-grid">
            ${projectKeyPoints.map(kp => `
              <div class="key-point-item">
                <span class="key-point-label">${kp.label}</span>
                <span class="key-point-value">${kp.value}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h4>🤖 关联智能体</h4>
          </div>
          <div class="section-body">
            <div id="project-agents-list">
              <div class="loading">加载中...</div>
            </div>
          </div>
        </div>

        ${completedMilestones.length > 0 ? `
        <div class="detail-section">
          <h3>🎯 已完成任务 (${completedMilestones.length})</h3>
          <div class="milestones-list">
            ${completedMilestones.map(m => `
              <div class="milestone-item">
                <div class="milestone-icon">✓</div>
                <div class="milestone-content">
                  <div class="milestone-command">${m.command}</div>
                  ${m.notes ? `<div class="milestone-notes">${m.notes}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        ${pendingTasks.length > 0 ? `
        <div class="detail-section">
          <h3>📋 待办任务 (${pendingTasks.length})</h3>
          <div class="todo-list">
            ${pendingTasks.map(t => `
              <div class="todo-item">
                <div class="todo-icon">⏳</div>
                <div class="todo-content">
                  <div class="todo-title">${t.title}</div>
                  ${t.description ? `<div class="todo-desc">${t.description}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <div class="detail-section">
          <h3>📝 开发记录 (${logs.length}条)</h3>
          ${logs.length > 0 ? `
            <div class="detail-timeline">
              ${logs.map(log => {
                const time = new Date(log.timestamp).toLocaleString('zh-CN');
                const successClass = log.success ? 'log-success' : 'log-failed';
                return `
                  <div class="detail-timeline-item">
                    <div class="timeline-time">${time}</div>
                    <div class="timeline-content">
                      <span class="timeline-type type-${log.action_type}">${log.action_type}</span>
                      ${log.notes ? `<span style="margin-left:8px;color:#666">${log.notes}</span>` : ''}
                      <div class="timeline-command">${log.command || '-'}</div>
                      <div class="log-result ${successClass}">${log.success ? '✓ 成功' : '✗ 失败 (exit: ' + (log.exit_code || '-') + ')'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="detail-empty"><p>暂无开发记录</p></div>'}
        </div>
        
        <div class="detail-section">
          <h3>🐛 调试记录 (${debugs.length}条)</h3>
          ${debugs.length > 0 ? `
            ${debugs.map(d => {
              const time = new Date(d.timestamp).toLocaleString('zh-CN');
              const outcomeClass = d.outcome === 'resolved' ? 'resolved' : '';
              return `
                <div class="detail-debug-card ${outcomeClass}">
                  <div class="debug-header">
                    <span class="debug-title">${d.issue_title}</span>
                    <span class="status-badge status-${d.outcome === 'resolved' ? 'completed' : 'pending'}">${d.outcome === 'resolved' ? '✓ 已解决' : '⏳ 待解决'}</span>
                  </div>
                  ${d.issue_description ? `<div class="debug-desc">${d.issue_description}</div>` : ''}
                  ${d.solution ? `<div class="debug-solution">解决方案: ${d.solution}</div>` : ''}
                  <div style="font-size:12px;color:var(--text-muted);margin-top:12px">${time}</div>
                </div>
              `;
            }).join('')}
          ` : '<div class="detail-empty"><p>暂无调试记录</p></div>'}
        </div>
      </div>
    `;

    // Load associated agents
    loadProjectAgents(projectId);
  } catch (error) {
    console.error('Failed to load project detail:', error);
    document.getElementById('project-detail-content').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 加载开发记录页面
async function loadLogs() {
  try {
    const res = await api.getRecentLogs(100);
    if (res.success) {
      renderLogsPage(res.data || []);
    }
  } catch (error) {
    console.error('Failed to load logs:', error);
    document.getElementById('logs-container').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 渲染开发记录页面
function renderLogsPage(logs) {
  const container = document.getElementById('logs-container');
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>暂无开发记录</p></div>';
    return;
  }
  
  container.innerHTML = `
    <div class="logs-container">
      ${logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('zh-CN');
        const successClass = log.success ? 'log-success' : 'log-failed';
        return `
          <div class="log-item">
            <div class="log-time">${time}</div>
            <div class="log-content">
              <span class="log-type type-${log.action_type}">${log.action_type}</span>
              ${log.project_name ? `<span style="margin-left:8px;color:#1565c0">${log.project_name}</span>` : ''}
              ${log.device_name ? `<span style="margin-left:8px;color:#888">${log.device_name}</span>` : ''}
              <div class="log-command">${log.command || log.notes || '-'}</div>
              ${log.stdout ? `<div class="log-result" style="font-size:12px;color:#888">${log.stdout.substring(0, 100)}...</div>` : ''}
              <div class="log-result ${successClass}">${log.success ? '✓ 成功' : '✗ 失败 (exit: ' + log.exit_code + ')'}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 显示创建项目弹窗
async function showCreateProjectModal() {
  const modal = document.getElementById('create-project-modal');
  const deviceSelect = document.getElementById('project-device');
  
  // 加载设备列表
  try {
    const res = await api.getDevices();
    if (res.success) {
      deviceSelect.innerHTML = '<option value="">请选择设备</option>' + 
        res.data.map(d => `<option value="${d.device_id}">${d.device_name} (${d.vpn_ip || d.device_id})</option>`).join('');
    }
  } catch (error) {
    console.error('Failed to load devices for modal:', error);
  }
  
  modal.classList.add('active');
}

// 关闭弹窗
function closeModal() {
  document.getElementById('create-project-modal').classList.remove('active');
}

// 命令结果弹窗函数
function showCommandResult(commandId) {
  const cmd = state.commands.find(c => c.id == commandId);
  if (!cmd) return;
  
  document.getElementById('result-stdout').textContent = cmd.result?.stdout || '(无输出)';
  document.getElementById('result-stderr').textContent = cmd.result?.stderr || '(无错误)';
  document.getElementById('result-exit-code').textContent = cmd.exit_code ?? '-';
  document.getElementById('result-duration').textContent = cmd.execution_time ? cmd.execution_time + 's' : '-';
  document.getElementById('command-result-modal').classList.add('active');
}

function closeCommandModal() {
  document.getElementById('command-result-modal').classList.remove('active');
}

// Agent表情映射
function getAgentEmoji(agentType) {
  const emojis = {
    'vision': '👁️',
    'audio': '🎤',
    'control': '🎮',
    'data': '📊',
    'web': '🌐',
    'default': '🤖'
  };
  return emojis[agentType] || emojis['default'];
}

// 项目关联Agent加载函数
async function loadProjectAgents(projectId) {
  try {
    const res = await api.request('GET', '/api/v1/agents');
    if (res.success) {
      const projectAgents = (res.data || []).filter(a => 
        (a.projects || []).some(p => p.id == projectId)
      );
      renderProjectAgents(projectAgents);
    }
  } catch (error) {
    const el = document.getElementById('project-agents-list');
    if (el) el.innerHTML = '<p class="empty-text">加载失败</p>';
  }
}

function renderProjectAgents(agents) {
  const container = document.getElementById('project-agents-list');
  if (!container) return;
  if (agents.length === 0) {
    container.innerHTML = '<p class="empty-text">暂无关联智能体</p>';
    return;
  }
  container.innerHTML = agents.map(a => `
    <div class="agent-card-mini" onclick="window.navigateTo('agent-detail', {agentId: '${a.agent_id}'})">
      <span class="agent-icon">${getAgentEmoji(a.agent_type)}</span>
      <div class="agent-info">
        <span class="agent-name">${a.agent_name}</span>
        <span class="agent-type">${a.agent_type}</span>
      </div>
      <span class="status-badge status-${a.status}">${a.status === 'active' ? '活跃' : '离线'}</span>
    </div>
  `).join('');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 导航点击事件
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigateTo(page);
      }
    });
  });
  
  // 创建项目表单提交
  document.getElementById('create-project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const deviceId = document.getElementById('project-device').value;
    const projectName = document.getElementById('project-name').value;
    const projectPath = document.getElementById('project-path').value;
    const description = document.getElementById('project-description').value;
    const priority = parseInt(document.getElementById('project-priority').value);
    
    try {
      const res = await api.createProject(deviceId, {
        project_name: projectName,
        project_path: projectPath,
        description,
        priority
      });
      
      if (res.success) {
        closeModal();
        navigateTo('projects');
      }
    } catch (error) {
      alert('创建失败: ' + error.message);
    }
  });
  
  // 处理初始hash路由
  function handleInitialRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== '') {
      const validPages = ['dashboard', 'devices', 'projects', 'logs', 'transfers', 'commands', 'agents', 'device-detail', 'project-detail', 'agent-detail'];
      if (validPages.includes(hash)) {
        navigateTo(hash);
        return;
      }
    }
    navigateTo('dashboard');
  }
  
  // 监听hash变化
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== '') {
      navigateTo(hash);
    }
  });
  
  // 默认加载仪表盘(无hash时)
  handleInitialRoute();
  
  // 初始化智能体页面
  if (typeof initAgentsPage === 'function') initAgentsPage();
});/**
 * EdgeHub - 项目详情增强
 * 仅修改项目详情页 (loadProjectDetail函数)
 */

const ENHANCE_PROJECT_DETAIL = `
// ============ 项目详情增强 (仅此函数) ============

// 保存原始函数引用
const _originalLoadProjectDetail = window.loadProjectDetail;

// 重写项目详情加载函数
window.loadProjectDetail = async function(projectId) {
  try {
    // 同时获取基础数据和统计数据
    const [projectRes, statsRes] = await Promise.all([
      api.getProject(projectId),
      fetch(api.baseUrl + '/projects/' + projectId + '/stats', {
        headers: { 'X-API-Key': api.apiKey }
      }).then(r => r.json()).catch(() => ({ success: false }))
    ]);
    
    if (!projectRes.success) {
      throw new Error('Project not found');
    }
    
    const { project, logs, debugs } = projectRes.data;
    const stats = statsRes.success ? statsRes.data : null;
    
    const container = document.getElementById('project-detail-content');
    const statusText = { active: '进行中', paused: '已暂停', completed: '已完成' };
    const statusClass = 'status-' + project.status;
    
    // 计算统计数据
    const actionTypes = stats?.action_stats || {};
    const agentStats = stats?.agent_stats || {};
    const maxAction = Object.entries(actionTypes).sort((a, b) => b[1] - a[1])[0];
    
    container.innerHTML = \`
      <div class="detail-page-container">
        <div class="detail-header-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <h2>\${project.project_name}</h2>
              <div class="detail-path">\${project.project_path}</div>
            </div>
            <span class="status-badge \${statusClass}">\${statusText[project.status] || project.status}</span>
          </div>
          \${project.description ? \`<p style="color:var(--text-muted);margin-top:16px">\${project.description}</p>\` : ''}
          
          \${stats ? \`
          <!-- 统计卡片 -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-top:20px;">
            <div class="stat-card">
              <div class="stat-value">\${stats.total_logs || 0}</div>
              <div class="stat-label">开发记录</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">\${stats.pending_debugs || 0}</div>
              <div class="stat-label">待解决问题</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">\${stats.success_rate || 0}%</div>
              <div class="stat-label">成功率</div>
            </div>
          </div>
          \` : ''}
        </div>

        \${stats && Object.keys(actionTypes).length > 0 ? \`
        <!-- 操作类型分布 -->
        <div class="section" style="margin-top:20px;">
          <div class="section-header"><h4>📊 操作类型分布</h4></div>
          <div class="section-body">
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              \${Object.entries(actionTypes).map(([type, count]) => {
                const pct = Math.round((count / stats.total_logs) * 100);
                const colors = ['#4caf50','#2196f3','#ff9800','#e91e63','#9c27b0','#00bcd4'];
                const color = colors[Object.keys(actionTypes).indexOf(type) % colors.length];
                return \`<div style="flex:1;min-width:100px;background:#f5f5f5;padding:12px;border-radius:8px;">
                  <div style="font-size:12px;color:#666;text-transform:capitalize;">\${type}</div>
                  <div style="font-size:24px;font-weight:bold;color:\${color}">\${count}</div>
                  <div style="font-size:11px;color:#999">\${pct}%</div>
                </div>\`;
              }).join('')}
            </div>
          </div>
        </div>
        \` : ''}

        \${stats && Object.keys(agentStats).length > 0 ? \`
        <!-- 智能体贡献 -->
        <div class="section" style="margin-top:20px;">
          <div class="section-header"><h4>🤖 智能体贡献</h4></div>
          <div class="section-body">
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              \${Object.entries(agentStats).map(([agent, count]) => \`
                <span style="background:#e3f2fd;padding:6px 12px;border-radius:16px;font-size:13px;">
                  <strong>\${agent}</strong>: \${count}次
                </span>
              \`).join('')}
            </div>
          </div>
        </div>
        \` : ''}

        \${(debugs || []).filter(d => d.outcome !== 'resolved').length > 0 ? \`
        <!-- 待办清单 -->
        <div class="section" style="margin-top:20px;">
          <div class="section-header"><h4>📋 待办清单 (\${(debugs || []).filter(d => d.outcome !== 'resolved').length})</h4></div>
          <div class="section-body">
            \${(debugs || []).filter(d => d.outcome !== 'resolved').map(d => \`
              <div style="padding:12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px;">
                <span style="color:\${d.priority === 'high' ? '#f44336' : d.priority === 'medium' ? '#ff9800' : '#4caf50'};font-weight:bold;">P\${d.priority || '-'}</span>
                <span>\${d.issue_title}</span>
              </div>
            \`).join('')}
          </div>
        </div>
        \` : ''}

        <div class="detail-section" style="margin-top:20px;">
          <h3>📝 开发记录 (\${logs.length}条)</h3>
          \${logs.length > 0 ? \`
            <div class="detail-timeline">
              \${logs.map(log => {
                const time = new Date(log.timestamp).toLocaleString('zh-CN');
                const successClass = log.success ? 'log-success' : 'log-failed';
                const typeColors = {debug:'#ff9800',test:'#4caf50',deploy:'#2196f3',config:'#9c27b0',analyze:'#00bcd4',remote:'#795548'};
                const typeColor = typeColors[log.action_type] || '#666';
                return \`
                  <div class="detail-timeline-item">
                    <div class="timeline-time">\${time}</div>
                    <div class="timeline-content">
                      <span class="timeline-type" style="background:\${typeColor}">\${log.action_type}</span>
                      \${log.notes ? \`<span style="margin-left:8px;color:#666;font-size:13px">\${log.notes}</span>\` : ''}
                      <div class="timeline-command">\${log.command || '-'}</div>
                      <div class="log-result \${successClass}">
                        \${log.success ? '✓ 成功' : '✗ 失败 (exit: ' + (log.exit_code || '-') + ')'}
                      </div>
                    </div>
                  </div>\`;
              }).join('')}
            </div>\` : '<div class="detail-empty"><p>暂无开发记录</p></div>\'}
        </div>
        
        \${(debugs || []).length > 0 ? \`
        <div class="detail-section" style="margin-top:20px;">
          <h3>🐛 调试记录 (\${debugs.length}条)</h3>
          \${debugs.map(d => {
            const time = new Date(d.timestamp).toLocaleString('zh-CN');
            const outcomeClass = d.outcome === 'resolved' ? 'resolved' : '';
            return \`
              <div class="detail-debug-card \${outcomeClass}">
                <div class="debug-header">
                  <span class="debug-title">\${d.issue_title}</span>
                  <span class="status-badge status-\${d.outcome === 'resolved' ? 'completed' : 'pending'}">
                    \${d.outcome === 'resolved' ? '✓ 已解决' : '⏳ 待解决'}
                  </span>
                </div>
                \${d.issue_description ? \`<div class="debug-desc">\${d.issue_description}</div>\` : ''}
                \${d.solution ? \`<div class="debug-solution">解决方案: \${d.solution}</div>\` : ''}
                <div style="font-size:12px;color:var(--text-muted);margin-top:12px">\${time}</div>
              </div>\`;
          }).join('')}
        </div>\` : ''}
      </div>
    \`;
    
    // 加载关联智能体
    loadProjectAgents(projectId);
  } catch (error) {
    console.error('Failed to load project detail:', error);
    document.getElementById('project-detail-content').innerHTML = '<p class="error">加载失败: ' + error.message + '</p>';
  }
};
`;