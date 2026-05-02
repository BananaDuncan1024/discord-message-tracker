/**
 * Cache Service - 訊息快取管理服務
 * 
 * 負責管理訊息的記憶體快取，包含自動過期機制。
 * 每個被監控用戶擁有獨立的快取空間。
 */

import type {
  CacheService,
  CachedMessage,
  CacheConfiguration,
  MemoryUsageStats,
} from '../types/index.js';
import { logger } from './logger.service.js';

/**
 * 預設快取配置
 */
const DEFAULT_CONFIG: CacheConfiguration = {
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
 * CacheService 實作
 * 
 * 使用雙層 Map 結構：Map<userId, Map<messageId, CachedMessage>>
 * 提供 O(1) 的查詢效能，並按用戶隔離快取
 */
export class CacheServiceImpl implements CacheService {
  private userCaches: Map<string, Map<string, CachedMessage>>;
  private cleanupInterval: Timer | null;
  private config: CacheConfiguration;

  constructor(config?: Partial<CacheConfiguration>) {
    this.userCaches = new Map();
    this.cleanupInterval = null;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 啟動自動清理定時器
    this.startCleanupTimer();

    logger.info('CacheService 初始化完成', {
      maxMessagesPerUser: this.config.maxMessagesPerUser,
      messageRetentionDays: this.config.messageRetentionDays,
      cleanupIntervalMs: this.config.cleanupIntervalMs,
    });
  }

  // ==================== 用戶快取管理 ====================

  /**
   * 為新用戶建立快取空間
   */
  createUserCache(userId: string): void {
    if (!this.userCaches.has(userId)) {
      this.userCaches.set(userId, new Map());
      logger.debug('建立用戶快取空間', { userId });
    }
  }

  /**
   * 刪除用戶的所有快取
   */
  deleteUserCache(userId: string): void {
    const userCache = this.userCaches.get(userId);
    if (userCache) {
      const messageCount = userCache.size;
      this.userCaches.delete(userId);
      logger.info('刪除用戶快取空間', { userId, deletedMessages: messageCount });
    }
  }

  /**
   * 檢查用戶快取是否存在
   */
  hasUserCache(userId: string): boolean {
    return this.userCaches.has(userId);
  }

  // ==================== 訊息操作 ====================

  /**
   * 儲存訊息到快取（設定 7 天過期時間）
   */
  set(userId: string, messageId: string, message: CachedMessage): void {
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      logger.warn('用戶快取不存在，無法儲存訊息', { userId, messageId });
      return;
    }

    // 檢查是否超過單用戶限制（LRU 策略）
    if (userCache.size >= this.config.maxMessagesPerUser) {
      this.evictOldestMessage(userId);
    }

    // 設定過期時間（7 天）
    const retentionMs = this.config.messageRetentionDays * 24 * 60 * 60 * 1000;
    message.expiresAt = Date.now() + retentionMs;

    userCache.set(messageId, message);
    logger.debug('訊息已快取', {
      userId,
      messageId,
      channelId: message.channelId,
      expiresAt: new Date(message.expiresAt).toISOString(),
    });
  }

  /**
   * 從快取檢索訊息
   */
  get(userId: string, messageId: string): CachedMessage | null {
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      return null;
    }

    const message = userCache.get(messageId);
    if (!message) {
      return null;
    }

    // 檢查是否過期
    if (message.expiresAt < Date.now()) {
      userCache.delete(messageId);
      logger.debug('訊息已過期並移除', { userId, messageId });
      return null;
    }

    return message;
  }

  /**
   * 更新快取中的訊息內容
   */
  update(userId: string, messageId: string, message: Partial<CachedMessage>): boolean {
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      return false;
    }

    const existing = userCache.get(messageId);
    if (!existing) {
      return false;
    }

    // 合併更新
    const updated = { ...existing, ...message };
    userCache.set(messageId, updated);

    logger.debug('訊息已更新', { userId, messageId });
    return true;
  }

  /**
   * 從快取刪除單則訊息
   */
  delete(userId: string, messageId: string): boolean {
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      return false;
    }

    const deleted = userCache.delete(messageId);
    if (deleted) {
      logger.debug('訊息已從快取移除', { userId, messageId });
    }
    return deleted;
  }

  // ==================== 清理操作 ====================

  /**
   * 清理所有用戶的過期訊息
   */
  cleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [userId, userCache] of this.userCaches.entries()) {
      let userCleaned = 0;
      for (const [messageId, message] of userCache.entries()) {
        if (message.expiresAt < now) {
          userCache.delete(messageId);
          userCleaned++;
          totalCleaned++;
        }
      }

      if (userCleaned > 0) {
        logger.debug('清理用戶過期訊息', { userId, cleaned: userCleaned });
      }
    }

    if (totalCleaned > 0) {
      logger.info('快取清理完成', {
        totalCleaned,
        remainingMessages: this.size(),
        monitoredUsers: this.userCount(),
      });
    }
  }

  /**
   * 清理特定用戶的過期訊息
   */
  cleanupUser(userId: string): void {
    const now = Date.now();
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      return;
    }

    let cleaned = 0;
    for (const [messageId, message] of userCache.entries()) {
      if (message.expiresAt < now) {
        userCache.delete(messageId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('清理用戶過期訊息', { userId, cleaned });
    }
  }

  // ==================== 統計資訊 ====================

  /**
   * 取得總訊息數
   */
  size(): number {
    let total = 0;
    for (const userCache of this.userCaches.values()) {
      total += userCache.size;
    }
    return total;
  }

  /**
   * 取得特定用戶的訊息數
   */
  userSize(userId: string): number {
    return this.userCaches.get(userId)?.size || 0;
  }

  /**
   * 取得被監控用戶數量
   */
  userCount(): number {
    return this.userCaches.size;
  }

  // ==================== 記憶體管理 ====================

  /**
   * 取得記憶體使用統計
   */
  getMemoryUsage(): MemoryUsageStats {
    const memoryUsage = process.memoryUsage();
    const cachedMessages = this.size();
    const monitoredUsers = this.userCount();

    return {
      heapUsedMB: memoryUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memoryUsage.heapTotal / 1024 / 1024,
      rssMB: memoryUsage.rss / 1024 / 1024,
      cachedMessages,
      monitoredUsers,
      averageMessagesPerUser: monitoredUsers > 0 ? cachedMessages / monitoredUsers : 0,
      estimatedCacheSizeMB: (cachedMessages * 0.5) / 1024, // 假設每則訊息約 0.5 KB
    };
  }

  /**
   * 縮減用戶快取至目標大小
   */
  reduceUserCache(userId: string, targetSize: number): number {
    const userCache = this.userCaches.get(userId);
    if (!userCache) {
      return 0;
    }

    const currentSize = userCache.size;
    if (currentSize <= targetSize) {
      return 0;
    }

    const toRemove = currentSize - targetSize;
    return this.removeOldestMessages(userId, toRemove);
  }

  /**
   * 移除指定數量的最舊訊息
   */
  removeOldestMessages(userId: string, count: number): number {
    const userCache = this.userCaches.get(userId);
    if (!userCache || count <= 0) {
      return 0;
    }

    // 收集所有訊息並按時間戳記排序
    const messages = Array.from(userCache.entries()).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp
    );

    let removed = 0;
    for (let i = 0; i < Math.min(count, messages.length); i++) {
      const [messageId] = messages[i];
      userCache.delete(messageId);
      removed++;
    }

    if (removed > 0) {
      logger.debug('移除最舊訊息', { userId, removed });
    }

    return removed;
  }

  /**
   * 取得所有用戶 ID
   */
  getAllUserIds(): string[] {
    return Array.from(this.userCaches.keys());
  }

  /**
   * 設定配置
   */
  setConfig(config: Partial<CacheConfiguration>): void {
    this.config = { ...this.config, ...config };
    logger.info('快取配置已更新', config);

    // 重啟清理定時器（如果間隔時間改變）
    if (config.cleanupIntervalMs !== undefined) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * 取得配置
   */
  getConfig(): CacheConfiguration {
    return { ...this.config };
  }

  // ==================== 私有方法 ====================

  /**
   * 移除最舊的訊息（LRU 策略）
   */
  private evictOldestMessage(userId: string): void {
    const userCache = this.userCaches.get(userId);
    if (!userCache || userCache.size === 0) {
      return;
    }

    let oldestMessageId: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [messageId, message] of userCache.entries()) {
      if (message.timestamp < oldestTimestamp) {
        oldestTimestamp = message.timestamp;
        oldestMessageId = messageId;
      }
    }

    if (oldestMessageId) {
      userCache.delete(oldestMessageId);
      logger.debug('LRU 清理：移除最舊訊息', {
        userId,
        messageId: oldestMessageId,
        timestamp: oldestTimestamp,
      });
    }
  }

  /**
   * 啟動自動清理定時器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      logger.debug('執行定期快取清理');
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    logger.info('快取清理定時器已啟動', {
      intervalMs: this.config.cleanupIntervalMs,
    });
  }

  /**
   * 停止自動清理定時器
   */
  private stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('快取清理定時器已停止');
    }
  }

  /**
   * 關閉服務（清理資源）
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.userCaches.clear();
    logger.info('CacheService 已關閉');
  }
}

/**
 * 建立 CacheService 實例
 */
export function createCacheService(config?: Partial<CacheConfiguration>): CacheService {
  return new CacheServiceImpl(config);
}
