// 智能体一览相关函数 - 多对多架构 v3
// 注意：state 变量已在 app.js 中声明

// SVG 图标
var svgRobot = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4"/></svg>';
var svgFolder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
var svgDevice = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
var svgPlay = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
var svgChevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

// 加载智能体一览
async function loadAgents() {
  try {
    const res = await api.getAgents();
    if (res.success) {
      state.agents = res.data || [];
      renderAgents();
    }
  } catch (error) {
    console.error('Failed to load agents:', error);
    document.getElementById('agents-list').innerHTML = '<p class="error">加载失败</p>';
  }
}

// 渲染智能体列表
function renderAgents() {
  const container = document.getElementById('agents-list');
  if (!container) return;
  
  if (state.agents.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无智能体</p></div>';
    return;
  }
  
  const html = state.agents.map(function(agent) {
    var projectCount = (agent.projects || []).length;
    var activeProjects = (agent.projects || []).filter(function(p) { return p.status === 'active'; }).length;
    var deviceCount = (agent.devices || []).length;
    
    var statusClass = agent.status === 'active' ? 'active' : 'inactive';
    var statusText = agent.status === 'active' ? '活跃' : '离线';
    
    // 设备标签（最多显示3个）
    var deviceTags = (agent.devices || []).slice(0, 3).map(function(d) {
      return '<span class="device-tag" onclick="event.stopPropagation(); navigateTo(\'device-detail\', {deviceId: \'' + d.device_id + '\'})">' + (d.device_name || d.device_id) + '</span>';
    }).join('');
    if ((agent.devices || []).length > 3) {
      deviceTags += '<span class="device-tag more">+' + ((agent.devices || []).length - 3) + '</span>';
    }
    
    // 项目标签（最多显示2个）
    var projectTags = (agent.projects || []).slice(0, 2).map(function(p) {
      return '<span class="project-tag" onclick="event.stopPropagation(); navigateTo(\'project-detail\', {projectId: ' + p.id + '})">' + p.project_name + '</span>';
    }).join('');
    if ((agent.projects || []).length > 2) {
      projectTags += '<span class="project-tag more">+' + ((agent.projects || []).length - 2) + '</span>';
    }
    
    return '<div class="agent-card-v2" data-agent-id="' + agent.agent_id + '">' +
      '<div class="agent-card-header">' +
        '<div class="agent-avatar">' + svgRobot + '</div>' +
        '<div class="agent-info">' +
          '<h4 class="agent-name">' + agent.agent_name + '</h4>' +
          '<span class="agent-type">' + (agent.agent_type || 'default') + '</span>' +
        '</div>' +
        '<span class="status-pill ' + statusClass + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="agent-stats-row">' +
        '<div class="stat-box">' +
          '<div class="stat-icon blue">' + svgFolder + '</div>' +
          '<div class="stat-content">' +
            '<span class="stat-num">' + projectCount + '</span>' +
            '<span class="stat-label">项目</span>' +
          '</div>' +
        '</div>' +
        '<div class="stat-box">' +
          '<div class="stat-icon green">' + svgPlay + '</div>' +
          '<div class="stat-content">' +
            '<span class="stat-num">' + activeProjects + '</span>' +
            '<span class="stat-label">进行中</span>' +
          '</div>' +
        '</div>' +
        '<div class="stat-box">' +
          '<div class="stat-icon purple">' + svgDevice + '</div>' +
          '<div class="stat-content">' +
            '<span class="stat-num">' + deviceCount + '</span>' +
            '<span class="stat-label">设备</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="agent-card-footer">' +
        '<div class="footer-section">' +
          '<span class="footer-label">设备</span>' +
          '<div class="tags-row">' + (deviceTags || '<span class="no-data">暂无</span>') + '</div>' +
        '</div>' +
        '<div class="footer-section">' +
          '<span class="footer-label">项目</span>' +
          '<div class="tags-row">' + (projectTags || '<span class="no-data">暂无</span>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="agent-card-arrow">' + svgChevron + '</div>' +
    '</div>';
  }).join('');
  
  container.innerHTML = '<div class="agents-grid-v2">' + html + '</div>';
  
  // Add click event listeners using event delegation
  container.querySelectorAll('.agent-card-v2[data-agent-id]').forEach(function(card) {
    card.addEventListener('click', function(e) {
      var agentId = this.getAttribute('data-agent-id');
      navigateTo('agent-detail', {agentId: agentId});
    });
  });
}

// 加载智能体详情
async function loadAgentDetail(agentId) {
  try {
    const res = await api.getAgent(agentId);
    if (res.success) {
      state.currentAgent = res.data;
      renderAgentDetail(res.data);
    }
  } catch (error) {
    console.error('Failed to load agent detail:', error);
    var container = document.getElementById('agent-detail-content');
    if (container) {
      container.innerHTML = '<p class="error">加载失败: ' + error.message + '</p>';
    }
  }
}

// 渲染智能体详情
function renderAgentDetail(data) {
  var container = document.getElementById('agent-detail-content');
  if (!container) return;
  
  // 格式化日期
  function formatDate(str) {
    if (!str) return '-';
    var d = new Date(str);
    return d.toLocaleString('zh-CN');
  }
  
  // 相对时间
  function timeAgo(str) {
    if (!str) return '从未';
    var d = new Date(str);
    var now = new Date();
    var diff = now - d;
    var days = Math.floor(diff / 86400000);
    if (days > 0) return days + '天前';
    var hours = Math.floor(diff / 3600000);
    if (hours > 0) return hours + '小时前';
    var mins = Math.floor(diff / 60000);
    return mins + '分钟前';
  }
  
  // 解析sysinfo
  var sysinfo = {};
  try {
    if (data.devices && data.devices[0] && data.devices[0].sysinfo) {
      sysinfo = JSON.parse(data.devices[0].sysinfo);
    }
  } catch (e) {}
  
  // 设备卡片
  var devices = (data.devices || []).map(function(d) {
    var statusClass = d.status === 'online' ? 'online' : 'offline';
    var sysinfoHtml = '';
    if (sysinfo.cpu) {
      sysinfoHtml = '<div class="sysinfo-mini">' +
        '<span>CPU: ' + sysinfo.cpu.cores + '核 ' + sysinfo.cpu.usage + '%</span>' +
        '<span>内存: ' + sysinfo.memory.percent + '%</span>' +
        '<span>负载: ' + (sysinfo.load ? sysinfo.load['1min'] : '-') + '</span>' +
      '</div>';
    }
    return '<div class="device-card-v2" onclick="navigateTo(\'device-detail\', {deviceId: \'' + d.device_id + '\'})">' +
      '<div class="device-card-header">' +
        '<div class="device-icon-sm">' + svgDevice + '</div>' +
        '<div class="device-card-info">' +
          '<h5>' + (d.device_name || d.device_id) + '</h5>' +
          '<span class="device-vpn">' + (d.vpn_ip || '-') + '</span>' +
        '</div>' +
        '<span class="status-dot-sm status-' + statusClass + '"></span>' +
      '</div>' +
      sysinfoHtml +
    '</div>';
  }).join('');
  
  // 项目卡片
  var projects = (data.projects || []).map(function(p) {
    var roleClass = p.role === 'owner' ? 'owner' : (p.role === 'reviewer' ? 'reviewer' : 'developer');
    var priorityStars = '★'.repeat(11 - p.priority) + '☆'.repeat(p.priority - 1);
    return '<div class="project-card-v2" onclick="navigateTo(\'project-detail\', {projectId: ' + p.id + '})">' +
      '<div class="project-card-header">' +
        '<div class="project-icon-sm">' + svgFolder + '</div>' +
        '<div class="project-card-info">' +
          '<h5>' + p.project_name + '</h5>' +
          '<span class="project-path">' + p.project_path + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="project-card-meta">' +
        '<span class="status-badge status-' + p.status + '">' + p.status + '</span>' +
        '<span class="role-badge ' + roleClass + '">' + p.role + '</span>' +
        '<span class="priority">' + priorityStars + '</span>' +
      '</div>' +
      '<div class="project-card-footer">' +
        '<span>最后活动: ' + timeAgo(p.last_activity) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  
  // 拓扑结构 - 紧凑版
  var topologyHtml = '<div class="topology-compact">' +
    '<div class="topology-node compact agent">' +
      '<div class="node-icon">' + svgRobot + '</div>' +
      '<div class="node-info">' +
        '<span class="node-name">' + data.agent_name + '</span>' +
        '<span class="node-type">' + data.agent_type + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="topology-connector">' +
      '<div class="connector-line"></div>' +
      '<span class="connector-count">' + (data.projects || []).length + ' 项目</span>' +
      '<div class="connector-line"></div>' +
      '<span class="connector-count">' + (data.devices || []).length + ' 设备</span>' +
      '<div class="connector-line"></div>' +
    '</div>' +
    '<div class="topology-node compact endpoint">' +
      '<div class="node-icon">' + svgFolder + '</div>' +
      '<div class="node-info">' +
        '<span class="node-name">项目</span>' +
      '</div>' +
    '</div>' +
    '<div class="topology-node compact endpoint">' +
      '<div class="node-icon">' + svgDevice + '</div>' +
      '<div class="node-info">' +
        '<span class="node-name">设备</span>' +
      '</div>' +
    '</div>' +
  '</div>';
  
  // 基本信息
  var infoHtml = '<div class="info-grid-v2">' +
    '<div class="info-item-v2"><span class="label">智能体ID</span><span class="value mono">' + data.agent_id + '</span></div>' +
    '<div class="info-item-v2"><span class="label">类型</span><span class="value">' + data.agent_type + '</span></div>' +
    '<div class="info-item-v2"><span class="label">状态</span><span class="value"><span class="status-dot-sm status-' + data.status + '"></span> ' + data.status + '</span></div>' +
    '<div class="info-item-v2"><span class="label">创建时间</span><span class="value">' + formatDate(data.created_at) + '</span></div>' +
    '<div class="info-item-v2"><span class="label">Owner</span><span class="value">' + data.owner + '</span></div>' +
    '<div class="info-item-v2"><span class="label">关联项目</span><span class="value">' + (data.projects || []).length + ' 个</span></div>' +
    '<div class="info-item-v2"><span class="label">管理设备</span><span class="value">' + (data.devices || []).length + ' 台</span></div>' +
  '</div>';
  
  container.innerHTML = '<div class="agent-detail-layout">' +
    '<div class="detail-header-v2">' +
      '<div class="detail-avatar">' + svgRobot + '</div>' +
      '<div class="detail-title">' +
        '<h3>' + data.agent_name + '</h3>' +
        '<span class="detail-type">' + data.agent_type + '</span>' +
      '</div>' +
      '<span class="status-pill-lg ' + (data.status === 'active' ? 'active' : 'inactive') + '">' + (data.status === 'active' ? '活跃' : '离线') + '</span>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h4 class="section-title">' + svgFolder + ' 基本信息</h4>' +
      infoHtml +
    '</div>' +
    '<div class="detail-section">' +
      '<h4 class="section-title">' + svgRobot + ' 拓扑结构</h4>' +
      topologyHtml +
    '</div>' +
    '<div class="detail-section">' +
      '<h4 class="section-title">' + svgFolder + ' 参与项目 (' + (data.projects || []).length + ')</h4>' +
      '<div class="projects-grid-v2">' + (projects || '<div class="empty-card">暂无项目</div>') + '</div>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h4 class="section-title">' + svgDevice + ' 管理设备 (' + (data.devices || []).length + ')</h4>' +
      '<div class="devices-grid-v2">' + (devices || '<div class="empty-card">暂无设备</div>') + '</div>' +
    '</div>' +
  '</div>';
}
