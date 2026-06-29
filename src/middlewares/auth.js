const config = require('../config');

// 存储db实例（由app.js注入）
let db = null;

function setDatabase(database) {
  db = database;
}

// 检查Agent Key是否绑定了指定设备
function checkDeviceBond(agentId, deviceId) {
  return new Promise((resolve, reject) => {
    // 查询该Agent关联的项目所绑定的设备
    db.db.all(`
      SELECT DISTINCT pd.device_id 
      FROM project_devices pd
      JOIN agent_projects ap ON pd.project_id = ap.project_id
      WHERE ap.agent_id = ?
    `, [agentId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      // 检查目标设备是否在绑定列表中
      const bondedDevices = rows.map(r => r.device_id);
      resolve(bondedDevices.includes(deviceId));
    });
  });
}

// 根据API Key获取Agent信息
function getAgentByKey(apiKey) {
  return new Promise((resolve, reject) => {
    db.db.get('SELECT * FROM agents WHERE api_key = ?', [apiKey], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function authMiddleware(req, res, next) {
  // 支持多种Header名称
  const apiKey = req.headers['x-api-key'] || req.headers['x-edgehub-key'] || req.headers['x-edgehub-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: '缺少API Key'
      },
      timestamp: new Date().toISOString()
    });
  }
  
  // 管理员Key（edgehub_secret_key）
  if (apiKey === config.apiKey) {
    req.isAdmin = true;
    req.agent = null;
    return next();
  }
  
  // Agent Key认证
  try {
    const agent = await getAgentByKey(apiKey);
    if (agent) {
      req.isAdmin = false;
      req.agent = agent;
      return next();
    }
  } catch (err) {
    console.error('[Auth] Agent Key查询失败:', err.message);
  }
  
  return res.status(401).json({
    success: false,
    error: {
      code: 'AUTH_FAILED',
      message: '无效的API Key'
    },
    timestamp: new Date().toISOString()
  });
}

module.exports = { 
  authMiddleware, 
  setDatabase,
  checkDeviceBond,
  getAgentByKey
};
