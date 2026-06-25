/**
 * transfers.js - 文件传输页面逻辑
 */

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleString('zh-CN', { hour12: false });
}

// 加载传输列表
async function loadTransfers() {
  const tbody = document.getElementById('transfers-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="8" class="loading">加载中...</td></tr>';
  
  try {
    const resp = await fetch('/edgehub-api/v1/transfers', {
      headers: { 'X-API-Key': 'edgehub_secret_key' }
    });
    const json = await resp.json();
    
    if (!json.success || !json.data || json.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无传输记录</td></tr>';
      updateTransferStats({ total: 0, completed: 0, in_progress: 0, failed: 0 });
      return;
    }
    
    const transfers = json.data;
    
    // 更新统计
    const stats = {
      total: transfers.length,
      completed: transfers.filter(t => t.status === 'completed').length,
      in_progress: transfers.filter(t => ['pending', 'transferring', 'initiating'].includes(t.status)).length,
      failed: transfers.filter(t => ['failed', 'cancelled'].includes(t.status)).length
    };
    updateTransferStats(stats);
    
    // 渲染表格
    tbody.innerHTML = transfers.map(t => `
      <tr class="${t.status}">
        <td><code>${t.id.substring(0, 16)}...</code></td>
        <td>
          <span class="direction-badge ${t.direction}">
            ${t.direction === 'push' ? '⬆ 推送' : '⬇ 拉取'}
          </span>
        </td>
        <td>${t.device_id ? t.device_id.substring(0, 12) + '...' : '-'}</td>
        <td>${t.file_name || '-'}</td>
        <td>${t.file_size ? formatSize(t.file_size) : '-'}</td>
        <td>
          ${t.status === 'completed' ? '100%' : 
            t.status === 'transferring' && t.total_chunks ? 
              Math.round((t.transferred_chunks || 0) / t.total_chunks * 100) + '%' : '-'}
        </td>
        <td>
          <span class="status-badge ${t.status}">${getStatusText(t.status)}</span>
        </td>
        <td>${formatTime(t.created_at)}</td>
      </tr>
    `).join('');
    
  } catch (e) {
    console.error('loadTransfers error:', e);
    tbody.innerHTML = '<tr><td colspan="8" class="error">加载失败: ' + e.message + '</td></tr>';
  }
}

// 更新统计卡片
function updateTransferStats(stats) {
  const el = (id) => document.getElementById(id);
  if (el('transfer-total')) el('transfer-total').textContent = stats.total || 0;
  if (el('transfer-completed')) el('transfer-completed').textContent = stats.completed || 0;
  if (el('transfer-inprogress')) el('transfer-inprogress').textContent = stats.in_progress || 0;
  if (el('transfer-failed')) el('transfer-failed').textContent = stats.failed || 0;
}

// 状态文字
function getStatusText(status) {
  const map = {
    'pending': '等待中',
    'initiating': '初始化',
    'transferring': '传输中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消'
  };
  return map[status] || status;
}

// 显示推送弹窗
async function showPushModal() {
  const modal = document.getElementById('push-modal');
  const deviceSelect = document.getElementById('push-device');
  
  // 加载设备列表
  try {
    const resp = await fetch('/edgehub-api/v1/devices', {
      headers: { 'X-API-Key': 'edgehub_secret_key' }
    });
    const json = await resp.json();
    
    if (json.success && json.data) {
      deviceSelect.innerHTML = '<option value="">请选择设备</option>' + 
        json.data.filter(d => d.status === 'online')
          .map(d => `<option value="${d.device_id}">${d.device_name || d.device_id} (${d.status})</option>`)
          .join('');
    }
  } catch (e) {
    console.error('load devices error:', e);
  }
  
  modal.style.display = 'flex';
}

// 显示拉取弹窗
async function showPullModal() {
  const modal = document.getElementById('pull-modal');
  const deviceSelect = document.getElementById('pull-device');
  
  // 加载设备列表
  try {
    const resp = await fetch('/edgehub-api/v1/devices', {
      headers: { 'X-API-Key': 'edgehub_secret_key' }
    });
    const json = await resp.json();
    
    if (json.success && json.data) {
      deviceSelect.innerHTML = '<option value="">请选择设备</option>' + 
        json.data.filter(d => d.status === 'online')
          .map(d => `<option value="${d.device_id}">${d.device_name || d.device_id} (${d.status})</option>`)
          .join('');
    }
  } catch (e) {
    console.error('load devices error:', e);
  }
  
  modal.style.display = 'flex';
}

// 关闭弹窗
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

// 初始化表单事件
document.addEventListener('DOMContentLoaded', function() {
  // 推送表单提交
  const pushForm = document.getElementById('push-form');
  if (pushForm) {
    pushForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const deviceId = document.getElementById('push-device').value;
      const localPath = document.getElementById('push-local-path').value;
      const remotePath = document.getElementById('push-remote-path').value;
      
      if (!deviceId || !localPath || !remotePath) {
        alert('请填写所有字段');
        return;
      }
      
      try {
        const resp = await fetch('/edgehub-api/v1/transfers/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'edgehub_secret_key'
          },
          body: JSON.stringify({
            device_id: deviceId,
            local_path: localPath,
            remote_path: remotePath
          })
        });
        
        const json = await resp.json();
        
        if (json.success) {
          alert('传输任务已创建: ' + json.data.transfer_id);
          closeModal('push-modal');
          loadTransfers();
        } else {
          alert('创建失败: ' + (json.error?.message || json.error));
        }
      } catch (e) {
        alert('请求失败: ' + e.message);
      }
    });
  }
  
  // 拉取表单提交
  const pullForm = document.getElementById('pull-form');
  if (pullForm) {
    pullForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const deviceId = document.getElementById('pull-device').value;
      const remotePath = document.getElementById('pull-remote-path').value;
      
      if (!deviceId || !remotePath) {
        alert('请填写所有字段');
        return;
      }
      
      try {
        const resp = await fetch('/edgehub-api/v1/transfers/pull', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'edgehub_secret_key'
          },
          body: JSON.stringify({
            device_id: deviceId,
            remote_path: remotePath
          })
        });
        
        const json = await resp.json();
        
        if (json.success) {
          alert('拉取任务已创建: ' + json.data.transfer_id);
          closeModal('pull-modal');
          loadTransfers();
        } else {
          alert('创建失败: ' + (json.error?.message || json.error));
        }
      } catch (e) {
        alert('请求失败: ' + e.message);
      }
    });
  }
  
  // 点击弹窗背景关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.style.display = 'none';
      }
    });
  });
});

// 页面显示时加载数据
window.loadTransfersPage = loadTransfers;
