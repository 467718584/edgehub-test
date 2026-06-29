const fs = require('fs');
const path = require('path');

class Logger {
  constructor(logPath = './logs/') {
    this.logPath = logPath;
    
    // 确保日志目录存在
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }
    
    this.accessLog = fs.createWriteStream(path.join(logPath, 'access.log'), { flags: 'a' });
    this.errorLog = fs.createWriteStream(path.join(logPath, 'error.log'), { flags: 'a' });
  }
  
  format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}\n`;
  }
  
  info(message) {
    const log = this.format('INFO', message);
    process.stdout.write(log);
    this.accessLog.write(log);
  }
  
  error(message) {
    const log = this.format('ERROR', message);
    process.stderr.write(log);
    this.errorLog.write(log);
  }
  
  warn(message) {
    const log = this.format('WARN', message);
    process.stdout.write(log);
    this.accessLog.write(log);
  }
  
  debug(message) {
    if (process.env.NODE_ENV !== 'production') {
      const log = this.format('DEBUG', message);
      process.stdout.write(log);
    }
  }
  
  close() {
    this.accessLog.end();
    this.errorLog.end();
  }
}

module.exports = Logger;