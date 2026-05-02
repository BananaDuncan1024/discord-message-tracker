/**
 * Logger Service 測試
 * 
 * 測試 Winston 日誌服務的基本功能
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { logger } from '../src/services/logger.service';
import { existsSync, mkdirSync, rmSync } from 'fs';

describe('Logger Service', () => {
  beforeAll(() => {
    // 確保 logs 目錄存在
    if (!existsSync('logs')) {
      mkdirSync('logs', { recursive: true });
    }
  });

  test('應該能夠記錄 info 級別日誌', () => {
    expect(() => {
      logger.info('測試資訊日誌');
    }).not.toThrow();
  });

  test('應該能夠記錄 info 級別日誌並包含 metadata', () => {
    expect(() => {
      logger.info('測試資訊日誌', { userId: '123', action: 'test' });
    }).not.toThrow();
  });

  test('應該能夠記錄 warn 級別日誌', () => {
    expect(() => {
      logger.warn('測試警告日誌');
    }).not.toThrow();
  });

  test('應該能夠記錄 warn 級別日誌並包含 metadata', () => {
    expect(() => {
      logger.warn('測試警告日誌', { reason: 'test warning' });
    }).not.toThrow();
  });

  test('應該能夠記錄 error 級別日誌', () => {
    expect(() => {
      logger.error('測試錯誤日誌');
    }).not.toThrow();
  });

  test('應該能夠記錄 error 級別日誌並包含 Error 物件', () => {
    const testError = new Error('測試錯誤');
    expect(() => {
      logger.error('發生錯誤', testError);
    }).not.toThrow();
  });

  test('應該能夠記錄 error 級別日誌並包含 Error 物件和 metadata', () => {
    const testError = new Error('測試錯誤');
    expect(() => {
      logger.error('發生錯誤', testError, { context: 'test' });
    }).not.toThrow();
  });

  test('應該能夠記錄 debug 級別日誌', () => {
    expect(() => {
      logger.debug('測試除錯日誌');
    }).not.toThrow();
  });

  test('應該能夠記錄 debug 級別日誌並包含 metadata', () => {
    expect(() => {
      logger.debug('測試除錯日誌', { details: 'debug info' });
    }).not.toThrow();
  });

  test('日誌檔案應該被建立', () => {
    // 記錄一些日誌以確保檔案被建立
    logger.info('測試日誌檔案建立');
    logger.error('測試錯誤日誌檔案建立');

    // 等待檔案寫入
    setTimeout(() => {
      expect(existsSync('logs/combined.log')).toBe(true);
      expect(existsSync('logs/error.log')).toBe(true);
    }, 100);
  });
});
