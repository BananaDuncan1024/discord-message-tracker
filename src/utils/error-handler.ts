/**
 * Discord API 錯誤處理器
 *
 * 負責：
 * 1. 統一處理 Discord API 各種錯誤碼
 * 2. 實作指數退避（Exponential Backoff）重試邏輯
 * 3. 處理速率限制（Rate Limit）
 */

import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import type { Logger } from '../types/index.js';

/** 不應重試的 Discord API 錯誤碼 */
const NON_RETRYABLE_CODES = new Set([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownGuild,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownUser,
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.CannotSendMessagesToThisUser, // DM 關閉
]);

/** 重試配置 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
};

export class DiscordAPIErrorHandler {
  private readonly retryConfig: RetryConfig;

  constructor(
    private readonly logger: Logger,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * 統一處理 Discord API 錯誤
   * 返回 true 代表可以重試，false 代表不應重試
   */
  handleAPIError(error: unknown, context?: object): boolean {
    if (error instanceof DiscordAPIError) {
      // 速率限制
      if (error.status === 429) {
        this.logger.warn('Discord API 速率限制', {
          ...context,
          status: error.status,
          message: error.message,
        });
        return true; // 可以重試（需等待 retry_after）
      }

      // 無法重試的錯誤
      if (NON_RETRYABLE_CODES.has(error.code as number)) {
        this.logger.warn('Discord API 不可重試錯誤', {
          ...context,
          code: error.code,
          message: error.message,
        });
        return false;
      }

      // 伺服器端錯誤（5xx）可重試
      if (error.status >= 500) {
        this.logger.warn('Discord API 伺服器錯誤，將重試', {
          ...context,
          status: error.status,
          message: error.message,
        });
        return true;
      }

      // 其他 API 錯誤（4xx）不重試
      this.logger.error('Discord API 錯誤', error, {
        ...context,
        code: error.code,
        status: error.status,
      });
      return false;
    }

    // 非 Discord API 錯誤（網路錯誤等）可重試
    this.logger.error('非 API 錯誤，將重試', error as Error, context);
    return true;
  }

  /**
   * 使用指數退避重試執行一個非同步操作
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context?: object
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        const shouldRetry = this.handleAPIError(error, { ...context, attempt });

        if (!shouldRetry || attempt >= this.retryConfig.maxRetries) {
          break;
        }

        // 計算退避延遲
        const delay = this._calculateDelay(attempt);
        this.logger.info('等待後重試', {
          ...context,
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          delayMs: delay,
        });

        await this._sleep(delay);
      }
    }

    throw lastError;
  }

  // ==================== 私有方法 ====================

  /**
   * 計算指數退避延遲（含 jitter 以避免雷群問題）
   */
  private _calculateDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);

    if (this.retryConfig.jitter) {
      // 加入 ±25% 的隨機抖動
      const jitterFactor = 0.75 + Math.random() * 0.5;
      return Math.floor(cappedDelay * jitterFactor);
    }

    return cappedDelay;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
