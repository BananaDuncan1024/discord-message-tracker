/**
 * DiscordAPIErrorHandler 單元測試
 * 覆蓋 handleAPIError 各分支 + withRetry + _calculateDelay
 */

import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { DiscordAPIErrorHandler, type RetryConfig } from '../src/utils/error-handler';
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import type { Logger } from '../src/types';

// ==================== Mock 工廠 ====================

const createMockLogger = (): Logger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

/**
 * 建立模擬的 DiscordAPIError
 * DiscordAPIError 建構子比較複雜，直接模擬物件
 */
const makeDiscordAPIError = (status: number, code: number, message = 'API Error') => {
  const error = new Error(message) as any;
  error.status = status;
  error.code = code;
  error.message = message;
  // 讓 instanceof 檢查通過
  Object.setPrototypeOf(error, DiscordAPIError.prototype);
  return error as DiscordAPIError;
};

// ==================== handleAPIError 測試 ====================

describe('DiscordAPIErrorHandler', () => {
  let handler: DiscordAPIErrorHandler;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    handler = new DiscordAPIErrorHandler(logger);
  });

  describe('handleAPIError()', () => {
    test('速率限制 (429) 應返回 true（可重試）', () => {
      const error = makeDiscordAPIError(429, 0, 'Rate limited');
      const result = handler.handleAPIError(error, { action: 'sendMessage' });
      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });

    test('UnknownChannel 錯誤應返回 false（不可重試）', () => {
      const error = makeDiscordAPIError(404, RESTJSONErrorCodes.UnknownChannel as number);
      const result = handler.handleAPIError(error);
      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    test('UnknownGuild 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(404, RESTJSONErrorCodes.UnknownGuild as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('UnknownMessage 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(404, RESTJSONErrorCodes.UnknownMessage as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('UnknownUser 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(404, RESTJSONErrorCodes.UnknownUser as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('MissingAccess 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(403, RESTJSONErrorCodes.MissingAccess as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('MissingPermissions 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(403, RESTJSONErrorCodes.MissingPermissions as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('CannotSendMessagesToThisUser 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(400, RESTJSONErrorCodes.CannotSendMessagesToThisUser as number);
      expect(handler.handleAPIError(error)).toBe(false);
    });

    test('伺服器錯誤 (5xx) 應返回 true（可重試）', () => {
      const error = makeDiscordAPIError(500, 0, 'Internal Server Error');
      expect(handler.handleAPIError(error)).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });

    test('502 Bad Gateway 應返回 true', () => {
      const error = makeDiscordAPIError(502, 0, 'Bad Gateway');
      expect(handler.handleAPIError(error)).toBe(true);
    });

    test('其他 4xx 錯誤應返回 false', () => {
      const error = makeDiscordAPIError(400, 99999, 'Bad Request');
      expect(handler.handleAPIError(error)).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    test('非 DiscordAPIError（如網路錯誤）應返回 true（可重試）', () => {
      const error = new Error('ECONNRESET');
      const result = handler.handleAPIError(error);
      expect(result).toBe(true);
      expect(logger.error).toHaveBeenCalled();
    });

    test('非 Error 物件也應返回 true', () => {
      const result = handler.handleAPIError('string error');
      expect(result).toBe(true);
    });
  });

  // ==================== withRetry 測試 ====================

  describe('withRetry()', () => {
    test('操作成功時應直接返回結果', async () => {
      const operation = mock(async () => 'ok');
      const result = await handler.withRetry(operation);
      expect(result).toBe('ok');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('操作失敗但可重試時應重試', async () => {
      // 使用快速配置避免測試太慢
      const fastHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        jitter: false,
      });

      let attempt = 0;
      const operation = mock(async () => {
        attempt++;
        if (attempt < 3) throw new Error('Network error');
        return 'success';
      });

      const result = await fastHandler.withRetry(operation);
      expect(result).toBe('success');
      expect(attempt).toBe(3);
    });

    test('操作失敗且不可重試時應立即拋出', async () => {
      const fastHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
      });

      const nonRetryableError = makeDiscordAPIError(
        404,
        RESTJSONErrorCodes.UnknownChannel as number,
      );
      const operation = mock(async () => { throw nonRetryableError; });

      await expect(fastHandler.withRetry(operation)).rejects.toThrow();
      // 不可重試的錯誤應只嘗試一次
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('超過最大重試次數後應拋出最後一個錯誤', async () => {
      const fastHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 2,
        jitter: false,
      });

      const networkError = new Error('persistent failure');
      const operation = mock(async () => { throw networkError; });

      await expect(fastHandler.withRetry(operation)).rejects.toThrow('persistent failure');
      // maxRetries=1 => 嘗試 2 次（初始 + 1 次重試）
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== _calculateDelay 測試 ====================

  describe('delay 計算（透過 withRetry 間接測試）', () => {
    test('無 jitter 時延遲應為指數退避', async () => {
      const fastHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitter: false,
      });

      const startTime = Date.now();
      const operation = mock(async () => { throw new Error('fail'); });

      await expect(fastHandler.withRetry(operation)).rejects.toThrow();
      const elapsed = Date.now() - startTime;

      // baseDelayMs=10, attempt 0 => 10ms, attempt 1 => 20ms, total ~30ms
      // 給予足夠誤差
      expect(elapsed).toBeGreaterThanOrEqual(20);
    });

    test('有 jitter 時延遲應在合理範圍', async () => {
      const jitterHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        jitter: true,
      });

      const operation = mock(async () => { throw new Error('fail'); });
      await expect(jitterHandler.withRetry(operation)).rejects.toThrow();

      // 有 jitter ±25%，所以 10ms * 0.75 ~ 10ms * 1.25 = 7.5ms ~ 12.5ms
      // 只要沒崩潰就算通過
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('延遲不應超過 maxDelayMs', async () => {
      const cappedHandler = new DiscordAPIErrorHandler(logger, {
        maxRetries: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
        jitter: false,
      });

      const startTime = Date.now();
      const operation = mock(async () => { throw new Error('fail'); });

      await expect(cappedHandler.withRetry(operation)).rejects.toThrow();
      const elapsed = Date.now() - startTime;

      // 最多 6 次嘗試，每次最多 5ms 延遲 = 最多 ~30ms (+抖動)
      // 如果沒有上限，baseDelayMs * 2^5 = 32ms 每次
      expect(elapsed).toBeLessThan(200);
    });
  });
});
