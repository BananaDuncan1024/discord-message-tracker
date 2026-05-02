/**
 * Logger Service - Winston 日誌服務實作
 * 
 * 功能：
 * - 提供統一的日誌記錄介面（info, warn, error, debug）
 * - 日誌輸出至控制台和檔案
 * - 日誌輪替機制（10MB 上限，保留 5 個檔案）
 * 
 * 需求：7.2, 7.3, 7.4
 */

import winston from 'winston';
import type { Logger } from '../types/index.js';

/**
 * Winston Logger 實作
 */
class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      transports: [
        // 控制台輸出
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 
                ? `\n${JSON.stringify(meta, null, 2)}` 
                : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          ),
        }),
        
        // 檔案輸出 - 所有日誌
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
        
        // 檔案輸出 - 錯誤日誌
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
      ],
    });
  }

  /**
   * 記錄資訊級別日誌
   */
  info(message: string, meta?: object): void {
    this.logger.info(message, meta);
  }

  /**
   * 記錄警告級別日誌
   */
  warn(message: string, meta?: object): void {
    this.logger.warn(message, meta);
  }

  /**
   * 記錄錯誤級別日誌
   */
  error(message: string, error?: Error, meta?: object): void {
    const errorMeta = error
      ? {
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          ...meta,
        }
      : meta;

    this.logger.error(message, errorMeta);
  }

  /**
   * 記錄除錯級別日誌
   */
  debug(message: string, meta?: object): void {
    this.logger.debug(message, meta);
  }
}

/**
 * 單例 Logger 實例
 */
export const logger = new WinstonLogger();
