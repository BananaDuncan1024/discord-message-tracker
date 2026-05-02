/**
 * Memory Monitor Usage Example
 * 
 * 此檔案展示如何使用 MemoryMonitor 服務
 */

import { createCacheService } from '../services/cache.service.js';
import { createMemoryMonitor } from '../services/memory-monitor.service.js';
import { loadCacheConfig, validateCacheConfig } from '../utils/config.util.js';

/**
 * 範例：基本使用
 */
export function basicUsageExample() {
  // 1. 載入配置（從環境變數）
  const config = loadCacheConfig();

  // 2. 驗證配置
  const errors = validateCacheConfig(config);
  if (errors.length > 0) {
    console.error('配置驗證失敗:', errors);
    return;
  }

  // 3. 建立 CacheService
  const cacheService = createCacheService(config);

  // 4. 建立 MemoryMonitor
  const memoryMonitor = createMemoryMonitor(config, cacheService);

  // 5. 啟動記憶體監控
  memoryMonitor.start();

  // 6. 在應用程式關閉時停止監控
  process.on('SIGINT', () => {
    memoryMonitor.stop();
    process.exit(0);
  });
}

/**
 * 範例：自訂配置
 */
export function customConfigExample() {
  // 使用自訂配置
  const customConfig = {
    maxMessagesPerUser: 1000,
    messageRetentionDays: 14,
    maxTotalMemoryMB: 1024,
    memoryWarningThreshold: 0.75,
    memoryEmergencyThreshold: 0.85,
    cleanupIntervalMs: 30 * 60 * 1000, // 30 分鐘
    memoryCheckIntervalMs: 2 * 60 * 1000, // 2 分鐘
    useOptimizedCache: true,
    enableAggressiveCleanup: true,
  };

  const cacheService = createCacheService(customConfig);
  const memoryMonitor = createMemoryMonitor(customConfig, cacheService);

  memoryMonitor.start();
}

/**
 * 範例：手動觸發清理
 */
export function manualCleanupExample() {
  const config = loadCacheConfig();
  const cacheService = createCacheService(config);
  const memoryMonitor = createMemoryMonitor(config, cacheService);

  // 手動檢查記憶體
  memoryMonitor.checkMemoryUsage();

  // 手動執行主動清理
  memoryMonitor.performAggressiveCleanup();

  // 手動執行緊急清理
  memoryMonitor.performEmergencyCleanup();

  // 手動縮減快取（保留 50%）
  memoryMonitor.reduceUserCaches(0.5);
}

/**
 * 範例：動態更新配置
 */
export function dynamicConfigExample() {
  const config = loadCacheConfig();
  const cacheService = createCacheService(config);
  const memoryMonitor = createMemoryMonitor(config, cacheService);

  memoryMonitor.start();

  // 稍後更新配置
  setTimeout(() => {
    memoryMonitor.updateConfig({
      maxTotalMemoryMB: 512,
      memoryWarningThreshold: 0.7,
    });
  }, 60000); // 1 分鐘後
}
