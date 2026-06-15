#!/usr/bin/env python3
"""
日志工具
"""

import os
import sys
import logging
from logging.handlers import RotatingFileHandler


def setup_logger(name='edgeagent', log_file='/var/log/edgeagent.log', level=logging.INFO):
    """
    设置日志记录器
    
    Args:
        name: 日志记录器名称
        log_file: 日志文件路径
        level: 日志级别
        
    Returns:
        logging.Logger: 配置好的日志记录器
    """
    # 确保日志目录存在
    log_dir = os.path.dirname(log_file)
    if log_dir and not os.path.exists(log_dir):
        try:
            os.makedirs(log_dir, exist_ok=True)
        except:
            # 如果无法创建日志目录，使用临时目录
            log_file = f'/tmp/edgeagent_{os.getpid()}.log'
    
    # 创建logger
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # 清除已有的handler
    logger.handlers.clear()
    
    # 日志格式
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # 控制台handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # 文件handler
    try:
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        logger.warning(f"无法创建日志文件 {log_file}: {e}")
    
    return logger


# 创建默认logger实例
logger = setup_logger()