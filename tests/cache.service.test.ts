/**
 * Cache Service 單元測試
 * 
 * 測試訊息快取管理服務的所有功能
 * 需求：2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createCacheService } from '../src/services/cache.service';
import type { CacheService, CachedMessage } from '../src/types/index.js';

describe('CacheService - 用戶快取管理', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // 建立測試用的 CacheService 實例（禁用自動清理以便測試）
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999, // 設定很長的間隔以避免測試期間自動清理
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    // 清理資源
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('應該能夠建立用戶快取空間', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    
    expect(cacheService.hasUserCache(userId)).toBe(true);
    expect(cacheService.userCount()).toBe(1);
    expect(cacheService.userSize(userId)).toBe(0);
  });

  test('應該能夠重複建立相同用戶的快取空間而不出錯', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    cacheService.createUserCache(userId);
    
    expect(cacheService.hasUserCache(userId)).toBe(true);
    expect(cacheService.userCount()).toBe(1);
  });

  test('應該能夠刪除用戶快取空間', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    expect(cacheService.hasUserCache(userId)).toBe(true);
    
    cacheService.deleteUserCache(userId);
    
    expect(cacheService.hasUserCache(userId)).toBe(false);
    expect(cacheService.userCount()).toBe(0);
  });

  test('刪除用戶快取應該移除該用戶的所有訊息', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    expect(cacheService.userSize(userId)).toBe(1);
    
    cacheService.deleteUserCache(userId);
    
    expect(cacheService.hasUserCache(userId)).toBe(false);
    expect(cacheService.size()).toBe(0);
  });

  test('刪除不存在的用戶快取應該不會出錯', () => {
    expect(() => {
      cacheService.deleteUserCache('nonexistent');
    }).not.toThrow();
  });
});

describe('CacheService - 訊息操作', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('應該能夠儲存訊息到快取', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    
    expect(cacheService.userSize(userId)).toBe(1);
    expect(cacheService.size()).toBe(1);
  });

  test('應該能夠檢索已快取的訊息', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    
    const retrieved = cacheService.get(userId, 'msg1');
    
    expect(retrieved).not.toBeNull();
    expect(retrieved?.messageId).toBe('msg1');
    expect(retrieved?.content).toBe('Test message content');
    expect(retrieved?.authorId).toBe(userId);
  });

  test('檢索不存在的訊息應該返回 null', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    
    const retrieved = cacheService.get(userId, 'nonexistent');
    
    expect(retrieved).toBeNull();
  });

  test('從不存在的用戶快取檢索訊息應該返回 null', () => {
    const retrieved = cacheService.get('nonexistent', 'msg1');
    
    expect(retrieved).toBeNull();
  });

  test('應該能夠更新已快取的訊息', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    
    const updated = cacheService.update(userId, 'msg1', {
      content: 'Updated content',
    });
    
    expect(updated).toBe(true);
    
    const retrieved = cacheService.get(userId, 'msg1');
    expect(retrieved?.content).toBe('Updated content');
  });

  test('更新不存在的訊息應該返回 false', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    
    const updated = cacheService.update(userId, 'nonexistent', {
      content: 'Updated content',
    });
    
    expect(updated).toBe(false);
  });

  test('應該能夠刪除已快取的訊息', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    expect(cacheService.userSize(userId)).toBe(1);
    
    const deleted = cacheService.delete(userId, 'msg1');
    
    expect(deleted).toBe(true);
    expect(cacheService.userSize(userId)).toBe(0);
    expect(cacheService.get(userId, 'msg1')).toBeNull();
  });

  test('刪除不存在的訊息應該返回 false', () => {
    const userId = 'user123';
    
    cacheService.createUserCache(userId);
    
    const deleted = cacheService.delete(userId, 'nonexistent');
    
    expect(deleted).toBe(false);
  });

  test('儲存訊息時應該自動設定過期時間', () => {
    const userId = 'user123';
    const message = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', message);
    
    const retrieved = cacheService.get(userId, 'msg1');
    
    expect(retrieved).not.toBeNull();
    expect(retrieved!.expiresAt).toBeGreaterThan(Date.now());
    
    // 檢查過期時間約為 7 天後（允許 1 秒誤差）
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(retrieved!.expiresAt - expectedExpiry)).toBeLessThan(1000);
  });

  test('嘗試儲存訊息到不存在的用戶快取應該不會出錯', () => {
    const message = createTestMessage('msg1', 'user123');
    
    expect(() => {
      cacheService.set('nonexistent', 'msg1', message);
    }).not.toThrow();
    
    // 訊息不應該被儲存
    expect(cacheService.size()).toBe(0);
  });
});

describe('CacheService - 快取隔離', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('不同用戶的快取應該完全隔離', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    const message1 = createTestMessage('msg1', user1);
    const message2 = createTestMessage('msg2', user2);
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, 'msg1', message1);
    cacheService.set(user2, 'msg2', message2);
    
    // 每個用戶應該只能看到自己的訊息
    expect(cacheService.get(user1, 'msg1')).not.toBeNull();
    expect(cacheService.get(user1, 'msg2')).toBeNull();
    expect(cacheService.get(user2, 'msg2')).not.toBeNull();
    expect(cacheService.get(user2, 'msg1')).toBeNull();
  });

  test('刪除一個用戶的訊息不應影響其他用戶', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    const message1 = createTestMessage('msg1', user1);
    const message2 = createTestMessage('msg2', user2);
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, 'msg1', message1);
    cacheService.set(user2, 'msg2', message2);
    
    cacheService.delete(user1, 'msg1');
    
    expect(cacheService.get(user1, 'msg1')).toBeNull();
    expect(cacheService.get(user2, 'msg2')).not.toBeNull();
  });

  test('刪除一個用戶的快取不應影響其他用戶', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    const message1 = createTestMessage('msg1', user1);
    const message2 = createTestMessage('msg2', user2);
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, 'msg1', message1);
    cacheService.set(user2, 'msg2', message2);
    
    cacheService.deleteUserCache(user1);
    
    expect(cacheService.hasUserCache(user1)).toBe(false);
    expect(cacheService.hasUserCache(user2)).toBe(true);
    expect(cacheService.get(user2, 'msg2')).not.toBeNull();
  });

  test('多個用戶可以有相同的訊息 ID', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    const messageId = 'same-id';
    const message1 = createTestMessage(messageId, user1);
    const message2 = createTestMessage(messageId, user2);
    message2.content = 'Different content';
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, messageId, message1);
    cacheService.set(user2, messageId, message2);
    
    const retrieved1 = cacheService.get(user1, messageId);
    const retrieved2 = cacheService.get(user2, messageId);
    
    expect(retrieved1?.content).toBe('Test message content');
    expect(retrieved2?.content).toBe('Different content');
  });
});

describe('CacheService - 過期訊息清理', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('應該能夠清理過期的訊息', () => {
    const userId = 'user123';
    const expiredMessage = createTestMessage('msg1', userId);
    expiredMessage.expiresAt = Date.now() - 1000; // 已過期
    
    cacheService.createUserCache(userId);
    // 直接設定過期訊息（繞過 set 方法的自動過期時間設定）
    (cacheService as any).userCaches.get(userId).set('msg1', expiredMessage);
    
    expect(cacheService.userSize(userId)).toBe(1);
    
    cacheService.cleanup();
    
    expect(cacheService.userSize(userId)).toBe(0);
  });

  test('清理操作不應移除未過期的訊息', () => {
    const userId = 'user123';
    const validMessage = createTestMessage('msg1', userId);
    
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', validMessage);
    
    expect(cacheService.userSize(userId)).toBe(1);
    
    cacheService.cleanup();
    
    expect(cacheService.userSize(userId)).toBe(1);
    expect(cacheService.get(userId, 'msg1')).not.toBeNull();
  });

  test('應該能夠清理特定用戶的過期訊息', () => {
    const userId = 'user123';
    const expiredMessage = createTestMessage('msg1', userId);
    expiredMessage.expiresAt = Date.now() - 1000;
    
    cacheService.createUserCache(userId);
    (cacheService as any).userCaches.get(userId).set('msg1', expiredMessage);
    
    expect(cacheService.userSize(userId)).toBe(1);
    
    cacheService.cleanupUser(userId);
    
    expect(cacheService.userSize(userId)).toBe(0);
  });

  test('檢索過期訊息時應該自動移除並返回 null', () => {
    const userId = 'user123';
    const expiredMessage = createTestMessage('msg1', userId);
    expiredMessage.expiresAt = Date.now() - 1000;
    
    cacheService.createUserCache(userId);
    (cacheService as any).userCaches.get(userId).set('msg1', expiredMessage);
    
    expect(cacheService.userSize(userId)).toBe(1);
    
    const retrieved = cacheService.get(userId, 'msg1');
    
    expect(retrieved).toBeNull();
    expect(cacheService.userSize(userId)).toBe(0);
  });

  test('清理操作應該處理多個用戶的過期訊息', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    const expiredMessage1 = createTestMessage('msg1', user1);
    const expiredMessage2 = createTestMessage('msg2', user2);
    const validMessage = createTestMessage('msg3', user1);
    
    expiredMessage1.expiresAt = Date.now() - 1000;
    expiredMessage2.expiresAt = Date.now() - 1000;
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    (cacheService as any).userCaches.get(user1).set('msg1', expiredMessage1);
    (cacheService as any).userCaches.get(user2).set('msg2', expiredMessage2);
    cacheService.set(user1, 'msg3', validMessage);
    
    expect(cacheService.size()).toBe(3);
    
    cacheService.cleanup();
    
    expect(cacheService.size()).toBe(1);
    expect(cacheService.get(user1, 'msg3')).not.toBeNull();
  });
});

describe('CacheService - 統計方法', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('size() 應該返回總訊息數', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, 'msg1', createTestMessage('msg1', user1));
    cacheService.set(user1, 'msg2', createTestMessage('msg2', user1));
    cacheService.set(user2, 'msg3', createTestMessage('msg3', user2));
    
    expect(cacheService.size()).toBe(3);
  });

  test('userSize() 應該返回特定用戶的訊息數', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    cacheService.set(user1, 'msg1', createTestMessage('msg1', user1));
    cacheService.set(user1, 'msg2', createTestMessage('msg2', user1));
    cacheService.set(user2, 'msg3', createTestMessage('msg3', user2));
    
    expect(cacheService.userSize(user1)).toBe(2);
    expect(cacheService.userSize(user2)).toBe(1);
  });

  test('userSize() 對不存在的用戶應該返回 0', () => {
    expect(cacheService.userSize('nonexistent')).toBe(0);
  });

  test('userCount() 應該返回被監控用戶數量', () => {
    cacheService.createUserCache('user1');
    cacheService.createUserCache('user2');
    cacheService.createUserCache('user3');
    
    expect(cacheService.userCount()).toBe(3);
  });

  test('統計方法應該在操作後正確更新', () => {
    const userId = 'user123';
    
    expect(cacheService.userCount()).toBe(0);
    expect(cacheService.size()).toBe(0);
    
    cacheService.createUserCache(userId);
    expect(cacheService.userCount()).toBe(1);
    
    cacheService.set(userId, 'msg1', createTestMessage('msg1', userId));
    cacheService.set(userId, 'msg2', createTestMessage('msg2', userId));
    expect(cacheService.size()).toBe(2);
    expect(cacheService.userSize(userId)).toBe(2);
    
    cacheService.delete(userId, 'msg1');
    expect(cacheService.size()).toBe(1);
    expect(cacheService.userSize(userId)).toBe(1);
    
    cacheService.deleteUserCache(userId);
    expect(cacheService.userCount()).toBe(0);
    expect(cacheService.size()).toBe(0);
  });
});

describe('CacheService - LRU 策略', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 3, // 設定較小的限制以便測試
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('超過限制時應該移除最舊的訊息', () => {
    const userId = 'user123';
    cacheService.createUserCache(userId);
    
    // 新增 3 則訊息（達到限制）
    const msg1 = createTestMessage('msg1', userId);
    msg1.timestamp = 1000;
    cacheService.set(userId, 'msg1', msg1);
    
    const msg2 = createTestMessage('msg2', userId);
    msg2.timestamp = 2000;
    cacheService.set(userId, 'msg2', msg2);
    
    const msg3 = createTestMessage('msg3', userId);
    msg3.timestamp = 3000;
    cacheService.set(userId, 'msg3', msg3);
    
    expect(cacheService.userSize(userId)).toBe(3);
    
    // 新增第 4 則訊息，應該移除最舊的 msg1
    const msg4 = createTestMessage('msg4', userId);
    msg4.timestamp = 4000;
    cacheService.set(userId, 'msg4', msg4);
    
    expect(cacheService.userSize(userId)).toBe(3);
    expect(cacheService.get(userId, 'msg1')).toBeNull();
    expect(cacheService.get(userId, 'msg2')).not.toBeNull();
    expect(cacheService.get(userId, 'msg3')).not.toBeNull();
    expect(cacheService.get(userId, 'msg4')).not.toBeNull();
  });

  test('LRU 策略應該只影響單一用戶', () => {
    const user1 = 'user1';
    const user2 = 'user2';
    
    cacheService.createUserCache(user1);
    cacheService.createUserCache(user2);
    
    // user1 達到限制
    for (let i = 1; i <= 3; i++) {
      const msg = createTestMessage(`msg${i}`, user1);
      msg.timestamp = i * 1000;
      cacheService.set(user1, `msg${i}`, msg);
    }
    
    // user2 新增訊息
    cacheService.set(user2, 'msg1', createTestMessage('msg1', user2));
    
    // user1 新增第 4 則訊息，應該觸發 LRU
    const msg4 = createTestMessage('msg4', user1);
    msg4.timestamp = 4000;
    cacheService.set(user1, 'msg4', msg4);
    
    // user1 應該只有 3 則訊息，user2 不受影響
    expect(cacheService.userSize(user1)).toBe(3);
    expect(cacheService.userSize(user2)).toBe(1);
    expect(cacheService.get(user2, 'msg1')).not.toBeNull();
  });
});

describe('CacheService - 記憶體管理', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('getMemoryUsage() 應該返回記憶體使用統計', () => {
    const userId = 'user123';
    cacheService.createUserCache(userId);
    cacheService.set(userId, 'msg1', createTestMessage('msg1', userId));
    
    const stats = cacheService.getMemoryUsage();
    
    expect(stats.heapUsedMB).toBeGreaterThan(0);
    expect(stats.heapTotalMB).toBeGreaterThan(0);
    expect(stats.rssMB).toBeGreaterThan(0);
    expect(stats.cachedMessages).toBe(1);
    expect(stats.monitoredUsers).toBe(1);
    expect(stats.averageMessagesPerUser).toBe(1);
    expect(stats.estimatedCacheSizeMB).toBeGreaterThan(0);
  });

  test('getAllUserIds() 應該返回所有用戶 ID', () => {
    cacheService.createUserCache('user1');
    cacheService.createUserCache('user2');
    cacheService.createUserCache('user3');
    
    const userIds = cacheService.getAllUserIds();
    
    expect(userIds).toHaveLength(3);
    expect(userIds).toContain('user1');
    expect(userIds).toContain('user2');
    expect(userIds).toContain('user3');
  });

  test('removeOldestMessages() 應該移除指定數量的最舊訊息', () => {
    const userId = 'user123';
    cacheService.createUserCache(userId);
    
    // 新增 5 則訊息
    for (let i = 1; i <= 5; i++) {
      const msg = createTestMessage(`msg${i}`, userId);
      msg.timestamp = i * 1000;
      cacheService.set(userId, `msg${i}`, msg);
    }
    
    expect(cacheService.userSize(userId)).toBe(5);
    
    // 移除 2 則最舊的訊息
    const removed = cacheService.removeOldestMessages(userId, 2);
    
    expect(removed).toBe(2);
    expect(cacheService.userSize(userId)).toBe(3);
    expect(cacheService.get(userId, 'msg1')).toBeNull();
    expect(cacheService.get(userId, 'msg2')).toBeNull();
    expect(cacheService.get(userId, 'msg3')).not.toBeNull();
  });

  test('reduceUserCache() 應該縮減快取至目標大小', () => {
    const userId = 'user123';
    cacheService.createUserCache(userId);
    
    // 新增 5 則訊息
    for (let i = 1; i <= 5; i++) {
      const msg = createTestMessage(`msg${i}`, userId);
      msg.timestamp = i * 1000;
      cacheService.set(userId, `msg${i}`, msg);
    }
    
    expect(cacheService.userSize(userId)).toBe(5);
    
    // 縮減至 3 則訊息
    const removed = cacheService.reduceUserCache(userId, 3);
    
    expect(removed).toBe(2);
    expect(cacheService.userSize(userId)).toBe(3);
  });

  test('reduceUserCache() 當目標大小大於當前大小時不應移除訊息', () => {
    const userId = 'user123';
    cacheService.createUserCache(userId);
    
    cacheService.set(userId, 'msg1', createTestMessage('msg1', userId));
    cacheService.set(userId, 'msg2', createTestMessage('msg2', userId));
    
    const removed = cacheService.reduceUserCache(userId, 10);
    
    expect(removed).toBe(0);
    expect(cacheService.userSize(userId)).toBe(2);
  });
});

describe('CacheService - 配置管理', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = createCacheService({
      cleanupIntervalMs: 999999999,
      maxMessagesPerUser: 500,
      messageRetentionDays: 7,
    });
  });

  afterEach(() => {
    if (cacheService && 'destroy' in cacheService) {
      (cacheService as any).destroy();
    }
  });

  test('getConfig() 應該返回當前配置', () => {
    const config = cacheService.getConfig();
    
    expect(config.maxMessagesPerUser).toBe(500);
    expect(config.messageRetentionDays).toBe(7);
    expect(config.cleanupIntervalMs).toBe(999999999);
  });

  test('setConfig() 應該更新配置', () => {
    cacheService.setConfig({
      maxMessagesPerUser: 1000,
    });
    
    const config = cacheService.getConfig();
    
    expect(config.maxMessagesPerUser).toBe(1000);
    expect(config.messageRetentionDays).toBe(7); // 其他配置不變
  });
});

// ==================== 輔助函數 ====================

/**
 * 建立測試用的訊息物件
 */
function createTestMessage(messageId: string, authorId: string): CachedMessage {
  return {
    messageId,
    channelId: 'channel123',
    guildId: 'guild123',
    authorId,
    content: 'Test message content',
    attachments: [
      {
        url: 'https://example.com/image.png',
        name: 'image.png',
        contentType: 'image/png',
      },
    ],
    embeds: [
      {
        title: 'Test Embed',
        description: 'Test embed description',
        color: 0x5865f2,
      },
    ],
    timestamp: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}
