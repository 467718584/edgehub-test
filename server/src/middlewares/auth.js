const config = require('../config');

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: '无效的API Key'
      },
      timestamp: new Date().toISOString()
    });
  }
  
  next();
}

module.exports = { authMiddleware };