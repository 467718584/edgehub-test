function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  const message = err.message || '内部服务器错误';
  
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: message,
      details: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    },
    timestamp: new Date().toISOString()
  });
}

module.exports = { errorHandler };