/**
 * Configuration Utilities - 配置工具
 * 
 * 提供從環境變數載入配置的工具函數
 */

import type { CacheConfiguration } from '../types/index.js';

/**
 * 預設快取配置
 */
export const DEFAULT_CACHE_CONFIG: CacheConfiguration = {
  maxMessagesPerUser: 500,
  messageRetentionDays: 7,
  maxTotalMemoryMB: 700,
  memoryWarningThreshold: 0.8,
  memoryEmergencyThreshold: 0.9,
  cleanupIntervalMs: 60 * 60 * 1000, // 1 小時
  memoryCheckIntervalMs: 5 * 60 * 1000, // 5 分鐘
  useOptimizedCache: true,
  enableAggressiveCleanup: true,
};

/**
 * 從環境變數載入快取配置
 * 
 * 支援的環境變數：
 * - MAX_MESSAGES_PER_USER: 每個用戶最多快取的訊息數量
 * - MESSAGE_RETENTION_DAYS: 訊息保留天數
 * - MAX_MEMORY_MB: 最大記憶體使用量（MB）
 * - MEMORY_WARNING_THRESHOLD: 記憶體警告閾值（0.0 - 1.0）
 * - MEMORY_EMERGENCY_THRESHOLD: 記憶體緊急閾值（0.0 - 1.0）
 * - CLEANUP_INTERVAL_MS: 清理間隔（毫秒）
 * - MEMORY_CHECK_INTERVAL_MS: 記憶體檢查間隔（毫秒）
 * - USE_OPTIMIZED_CACHE: 是否使用優化快取（true/false）
 * - ENABLE_AGGRESSIVE_CLEANUP: 是否啟用主動清理（true/false）
 */
export function loadCacheConfig(): CacheConfiguration {
  const config: CacheConfiguration = { ...DEFAULT_CACHE_CONFIG };

  // 載入數值型配置
  if (process.env.MAX_MESSAGES_PER_USER) {
    const value = parseInt(process.env.MAX_MESSAGES_PER_USER, 10);
    if (!isNaN(value) && value > 0) {
      config.maxMessagesPerUser = value;
    }
  }

  if (process.env.MESSAGE_RETENTION_DAYS) {
    const value = parseInt(process.env.MESSAGE_RETENTION_DAYS, 10);
    if (!isNaN(value) && value > 0) {
      config.messageRetentionDays = value;
    }
  }

  if (process.env.MAX_MEMORY_MB) {
    const value = parseInt(process.env.MAX_MEMORY_MB, 10);
    if (!isNaN(value) && value > 0) {
      config.maxTotalMemoryMB = value;
    }
  }

  if (process.env.CLEANUP_INTERVAL_MS) {
    const value = parseInt(process.env.CLEANUP_INTERVAL_MS, 10);
    if (!isNaN(value) && value > 0) {
      config.cleanupIntervalMs = value;
    }
  }

  if (process.env.MEMORY_CHECK_INTERVAL_MS) {
    const value = parseInt(process.env.MEMORY_CHECK_INTERVAL_MS, 10);
    if (!isNaN(value) && value > 0) {
      config.memoryCheckIntervalMs = value;
    }
  }

  // 載入浮點數型配置
  if (process.env.MEMORY_WARNING_THRESHOLD) {
    const value = parseFloat(process.env.MEMORY_WARNING_THRESHOLD);
    if (!isNaN(value) && value > 0 && value <= 1) {
      config.memoryWarningThreshold = value;
    }
  }

  if (process.env.MEMORY_EMERGENCY_THRESHOLD) {
    const value = parseFloat(process.env.MEMORY_EMERGENCY_THRESHOLD);
    if (!isNaN(value) && value > 0 && value <= 1) {
      config.memoryEmergencyThreshold = value;
    }
  }

  // 載入布林型配置
  if (process.env.USE_OPTIMIZED_CACHE !== undefined) {
    config.useOptimizedCache = process.env.USE_OPTIMIZED_CACHE !== 'false';
  }

  if (process.env.ENABLE_AGGRESSIVE_CLEANUP !== undefined) {
    config.enableAggressiveCleanup = process.env.ENABLE_AGGRESSIVE_CLEANUP !== 'false';
  }

  return config;
}

/**
 * 驗證快取配置的有效性
 */
export function validateCacheConfig(config: CacheConfiguration): string[] {
  const errors: string[] = [];

  if (config.maxMessagesPerUser <= 0) {
    errors.push('maxMessagesPerUser 必須大於 0');
  }

  if (config.messageRetentionDays <= 0) {
    errors.push('messageRetentionDays 必須大於 0');
  }

  if (config.maxTotalMemoryMB <= 0) {
    errors.push('maxTotalMemoryMB 必須大於 0');
  }

  if (config.memoryWarningThreshold <= 0 || config.memoryWarningThreshold > 1) {
    errors.push('memoryWarningThreshold 必須在 0 到 1 之間');
  }

  if (config.memoryEmergencyThreshold <= 0 || config.memoryEmergencyThreshold > 1) {
    errors.push('memoryEmergencyThreshold 必須在 0 到 1 之間');
  }

  if (config.memoryWarningThreshold >= config.memoryEmergencyThreshold) {
    errors.push('memoryWarningThreshold 必須小於 memoryEmergencyThreshold');
  }

  if (config.cleanupIntervalMs <= 0) {
    errors.push('cleanupIntervalMs 必須大於 0');
  }

  if (config.memoryCheckIntervalMs <= 0) {
    errors.push('memoryCheckIntervalMs 必須大於 0');
  }

  return errors;
}
