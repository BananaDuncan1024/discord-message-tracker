/**
 * Memory Monitor Service - 記憶體監控服務
 * 
 * 負責監控系統記憶體使用量，並在超過閾值時執行清理操作。
 * 定期檢查記憶體使用狀況，防止記憶體溢出。
 */

import type { CacheService, CacheConfiguration } from '../types/index.js';
import { logger } from './logger.service.js';

/**
 * MemoryMonitor 類別
 * 
 * 提供記憶體監控和自動清理功能
 */
export class MemoryMonitor {
  private config: CacheConfiguration;
  private cacheService: CacheService;
  private monitorInterval: Timer | null;

  constructor(config: CacheConfiguration, cacheService: CacheService) {
    this.config = config;
    this.cacheService = cacheService;
    this.monitorInterval = null;
  }

  /**
   * 啟動記憶體監控
   */
  start(): void {
    if (this.monitorInterval) {
      logger.warn('記憶體監控已在運行中');
      return;
    }

    this.monitorInterval = setInterval(
      () => this.checkMemoryUsage(),
      this.config.memoryCheckIntervalMs
    );

    logger.info('記憶體監控已啟動', {
      checkIntervalMs: this.config.memoryCheckIntervalMs,
      maxTotalMemoryMB: this.config.maxTotalMemoryMB,
      warningThreshold: this.config.memoryWarningThreshold,
      emergencyThreshold: this.config.memoryEmergencyThreshold,
    });
  }

  /**
   * 停止記憶體監控
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('記憶體監控已停止');
    }
  }

  /**
   * 檢查記憶體使用量
   */
  checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const rssUsedMB = memoryUsage.rss / 1024 / 1024;
    const stats = this.cacheService.getMemoryUsage();

    logger.debug('記憶體使用狀況', {
      heapUsedMB: heapUsedMB.toFixed(2),
      rssUsedMB: rssUsedMB.toFixed(2),
      cachedMessages: stats.cachedMessages,
      monitoredUsers: stats.monitoredUsers,
      estimatedCacheSizeMB: stats.estimatedCacheSizeMB.toFixed(2),
    });

    // 檢查是否超過警告閾值
    const warningThresholdMB = this.config.maxTotalMemoryMB * this.config.memoryWarningThreshold;
    const emergencyThresholdMB = this.config.maxTotalMemoryMB * this.config.memoryEmergencyThreshold;

    if (heapUsedMB > emergencyThresholdMB) {
      logger.error('記憶體使用嚴重超標，執行緊急清理', undefined, {
        heapUsedMB: heapUsedMB.toFixed(2),
        threshold: emergencyThresholdMB.toFixed(2),
        percentage: ((heapUsedMB / this.config.maxTotalMemoryMB) * 100).toFixed(1) + '%',
      });
      this.performEmergencyCleanup();
    } else if (heapUsedMB > warningThresholdMB) {
      logger.warn('記憶體使用接近上限，開始主動清理', {
        heapUsedMB: heapUsedMB.toFixed(2),
        threshold: warningThresholdMB.toFixed(2),
        percentage: ((heapUsedMB / this.config.maxTotalMemoryMB) * 100).toFixed(1) + '%',
      });
      this.performAggressiveCleanup();
    }
  }

  /**
   * 執行主動清理（記憶體使用超過 80%）
   */
  performAggressiveCleanup(): void {
    logger.info('開始執行主動清理');

    // 1. 清理所有過期訊息
    this.cacheService.cleanup();

    // 2. 檢查記憶體是否仍然過高
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const targetThresholdMB = this.config.maxTotalMemoryMB * 0.75;

    if (heapUsedMB > targetThresholdMB) {
      logger.warn('清理後記憶體仍然過高，縮減用戶快取', {
        heapUsedMB: heapUsedMB.toFixed(2),
        targetThresholdMB: targetThresholdMB.toFixed(2),
      });
      this.reduceUserCaches(0.5); // 每個用戶保留 50% 的訊息
    }

    const finalMemoryUsage = process.memoryUsage();
    const finalHeapUsedMB = finalMemoryUsage.heapUsed / 1024 / 1024;
    logger.info('主動清理完成', {
      beforeMB: heapUsedMB.toFixed(2),
      afterMB: finalHeapUsedMB.toFixed(2),
      freedMB: (heapUsedMB - finalHeapUsedMB).toFixed(2),
      remainingMessages: this.cacheService.size(),
    });
  }

  /**
   * 執行緊急清理（記憶體使用超過 90%）
   */
  performEmergencyCleanup(): void {
    logger.error('開始執行緊急記憶體清理');

    const beforeMemory = process.memoryUsage();
    const beforeHeapUsedMB = beforeMemory.heapUsed / 1024 / 1024;

    // 1. 清理所有過期訊息
    this.cacheService.cleanup();

    // 2. 大幅縮減快取（只保留 30%）
    this.reduceUserCaches(0.3);

    // 3. 強制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
      logger.info('已執行強制垃圾回收');
    } else {
      logger.warn('強制垃圾回收不可用（需要使用 --expose-gc 標誌啟動）');
    }

    const afterMemory = process.memoryUsage();
    const afterHeapUsedMB = afterMemory.heapUsed / 1024 / 1024;

    logger.error('緊急清理完成', undefined, {
      beforeMB: beforeHeapUsedMB.toFixed(2),
      afterMB: afterHeapUsedMB.toFixed(2),
      freedMB: (beforeHeapUsedMB - afterHeapUsedMB).toFixed(2),
      remainingMessages: this.cacheService.size(),
    });
  }

  /**
   * 縮減所有用戶的快取
   * @param keepRatio 保留比例（0.0 - 1.0）
   */
  reduceUserCaches(keepRatio: number): void {
    if (keepRatio < 0 || keepRatio > 1) {
      logger.error('無效的保留比例', undefined, { keepRatio });
      return;
    }

    const userIds = this.cacheService.getAllUserIds();
    let totalRemoved = 0;

    for (const userId of userIds) {
      const currentSize = this.cacheService.userSize(userId);
      const targetSize = Math.floor(currentSize * keepRatio);
      const toRemove = currentSize - targetSize;

      if (toRemove > 0) {
        const removed = this.cacheService.removeOldestMessages(userId, toRemove);
        totalRemoved += removed;
      }
    }

    logger.info('快取縮減完成', {
      keepRatio,
      totalRemoved,
      remainingMessages: this.cacheService.size(),
      affectedUsers: userIds.length,
    });
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CacheConfiguration>): void {
    this.config = { ...this.config, ...config };
    logger.info('記憶體監控配置已更新', config);

    // 如果檢查間隔改變，重啟監控
    if (config.memoryCheckIntervalMs !== undefined && this.monitorInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * 取得當前配置
   */
  getConfig(): CacheConfiguration {
    return { ...this.config };
  }
}

/**
 * 建立 MemoryMonitor 實例
 */
export function createMemoryMonitor(
  config: CacheConfiguration,
  cacheService: CacheService
): MemoryMonitor {
  return new MemoryMonitor(config, cacheService);
}
