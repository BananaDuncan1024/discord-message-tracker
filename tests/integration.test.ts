/**
 * 整合測試 + 屬性測試
 * Tasks: 13.1, 13.2, 13.3
 *
 * 整合真實的 SQLiteStorageService + CacheServiceImpl + MonitorServiceImpl
 * 驗證完整的端到端流程
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import { SQLiteStorageService } from '../src/services/storage.service';
import { CacheServiceImpl } from '../src/services/cache.service';
import { MonitorServiceImpl } from '../src/services/monitor.service';
import type { Logger, CachedMessage } from '../src/types';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ==================== 輔助工具 ====================

const createMockLogger = (): Logger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
});

const makeMsg = (overrides: Partial<{
  id: string; authorId: string; guildId: string; content: string;
  channelSend: (opts: any) => Promise<any>;
}> = {}): any => {
  const send = overrides.channelSend ?? (async () => ({}));
  return {
    id: overrides.id ?? 'msg1',
    content: overrides.content ?? 'hello',
    channelId: 'ch1',
    createdTimestamp: Date.now(),
    author: { id: overrides.authorId ?? 'user1', bot: false },
    guild: { id: overrides.guildId ?? 'guild1' },
    attachments: { values: () => [] },
    embeds: [],
    channel: { send },
  };
};

/** 建立隔離的整合測試環境 */
const createTestEnv = (tempDir: string) => {
  const dbPath = join(tempDir, `test-${Date.now()}-${Math.random()}.db`);
  const logger = createMockLogger();
  const storage = new SQLiteStorageService(logger, dbPath);
  const cache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
  const monitor = new MonitorServiceImpl(storage, cache, logger);
  return { storage, cache, monitor, dbPath, logger };
};

// ==================== Task 13.1: 完整流程整合測試 ====================

describe('整合測試 13.1 — 完整流程', () => {
  let tempDir: string;
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'integration-test-'));
    env = createTestEnv(tempDir);
    await env.storage.initialize();
  });

  afterEach(async () => {
    env.cache.destroy();
    await env.storage.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('完整流程：新增監控 → 發訊息 → 刪訊息 → 恢復通知', async () => {
    const { monitor } = env;
    const sentMessages: string[] = [];
    const send = async (opts: { content: string }) => { sentMessages.push(opts.content); return {}; };

    // 1. 新增監控
    const addResult = await monitor.addMonitoredUser('user1', 'guild1');
    expect(addResult.success).toBe(true);
    expect(monitor.isUserMonitored('user1', 'guild1')).toBe(true);

    // 2. 發送訊息（快取）
    const msg = makeMsg({ id: 'msg1', authorId: 'user1', guildId: 'guild1', content: '超秘密內容', channelSend: send });
    await monitor.handleMessageCreate(msg);

    // 3. 刪除訊息 → 應觸發通知
    await monitor.handleMessageDelete(msg);

    // 驗證通知包含訊息內容
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain('user1');
    expect(sentMessages[0]).toContain('超秘密內容');
  });

  test('移除監控用戶應清理快取', async () => {
    const { monitor, cache } = env;

    await monitor.addMonitoredUser('user1', 'guild1');
    expect(cache.hasUserCache('user1')).toBe(true);

    await monitor.removeMonitoredUser('user1', 'guild1');
    expect(cache.hasUserCache('user1')).toBe(false);
    expect(monitor.isUserMonitored('user1', 'guild1')).toBe(false);
  });

  test('多用戶隔離：不同用戶的快取互不影響', async () => {
    const { monitor, cache } = env;

    await monitor.addMonitoredUser('user1', 'guild1');
    await monitor.addMonitoredUser('user2', 'guild1');

    const msg1 = makeMsg({ id: 'msg_u1', authorId: 'user1', guildId: 'guild1', content: 'user1 msg' });
    const msg2 = makeMsg({ id: 'msg_u2', authorId: 'user2', guildId: 'guild1', content: 'user2 msg' });

    await monitor.handleMessageCreate(msg1);
    await monitor.handleMessageCreate(msg2);

    // user1 的訊息不應在 user2 的快取中
    expect(cache.get('user1', 'msg_u2')).toBeNull();
    expect(cache.get('user2', 'msg_u1')).toBeNull();

    // 各自的訊息應在各自快取中
    expect(cache.get('user1', 'msg_u1')).not.toBeNull();
    expect(cache.get('user2', 'msg_u2')).not.toBeNull();
  });

  test('快取命中後訊息應從快取移除（避免重複通知）', async () => {
    const { monitor, cache } = env;
    let notifyCount = 0;
    const send = async () => { notifyCount++; return {}; };

    await monitor.addMonitoredUser('user1', 'guild1');
    const msg = makeMsg({ id: 'msg1', authorId: 'user1', guildId: 'guild1', channelSend: send });

    await monitor.handleMessageCreate(msg);
    await monitor.handleMessageDelete(msg);

    // 第二次刪除（已從快取移除）不應再發通知
    await monitor.handleMessageDelete(msg);
    expect(notifyCount).toBe(1);
  });

  test('initialize 應從 DB 載入持久化的監控用戶', async () => {
    const { storage, cache, logger } = env;

    // 先在 DB 中新增用戶
    await storage.addMonitoredUser('guild1', 'persistedUser');

    // 用相同 DB 路徑建立新的 MonitorService
    const newMonitor = new MonitorServiceImpl(storage, cache, logger);
    await newMonitor.initialize();

    expect(newMonitor.isUserMonitored('persistedUser', 'guild1')).toBe(true);
    expect(cache.hasUserCache('persistedUser')).toBe(true);
  });

  test('非監控用戶的訊息不應被快取', async () => {
    const { monitor, cache } = env;

    await monitor.addMonitoredUser('monitoredUser', 'guild1');

    const msg = makeMsg({ id: 'msg1', authorId: 'notMonitored', guildId: 'guild1' });
    await monitor.handleMessageCreate(msg);

    // 非監控用戶沒有快取空間
    expect(cache.hasUserCache('notMonitored')).toBe(false);
  });
});

// ==================== Task 13.2: 屬性 12 — 持久化往返 ====================

describe('[屬性測試 13.2] 屬性 12：監控設定持久化往返', () => {
  test('寫入的監控用戶在重新載入後仍可查到', async () => {
    let tempDir: string | null = null;
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              guildId: fc.string({ minLength: 1, maxLength: 20 }),
              userId: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (userPairs) => {
            tempDir = mkdtempSync(join(tmpdir(), 'prop12-'));
            const dbPath = join(tempDir, 'test.db');
            const logger = createMockLogger();

            // 寫入
            const storage1 = new SQLiteStorageService(logger, dbPath);
            await storage1.initialize();

            const unique = new Map<string, { guildId: string; userId: string }>();
            for (const { guildId, userId } of userPairs) {
              const key = `${guildId}::${userId}`;
              if (!unique.has(key)) {
                unique.set(key, { guildId, userId });
                await storage1.addMonitoredUser(guildId, userId);
              }
            }
            await storage1.close();

            // 重新載入
            const storage2 = new SQLiteStorageService(logger, dbPath);
            await storage2.initialize();
            const cache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
            const monitor = new MonitorServiceImpl(storage2, cache, logger);
            await monitor.initialize();

            // 驗證所有寫入的用戶都能查到
            let allFound = true;
            for (const { guildId, userId } of unique.values()) {
              if (!monitor.isUserMonitored(userId, guildId)) {
                allFound = false;
                break;
              }
            }

            cache.destroy();
            await storage2.close();
            rmSync(tempDir, { recursive: true, force: true });
            tempDir = null;
            return allFound;
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ==================== Task 13.3: 屬性 13 — 持久化降級 ====================

describe('[屬性測試 13.3] 屬性 13：持久化載入失敗時 MonitorService 應能降級', () => {
  test('storage.getAllMonitoredUsers 失敗時 initialize 應拋出錯誤（讓呼叫者決定降級策略）', async () => {
    // 建立一個總是失敗的 storage mock
    const failingStorage = {
      initialize: async () => {},
      addMonitoredUser: async () => {},
      removeMonitoredUser: async () => {},
      getMonitoredUsers: async () => [],
      getAllMonitoredUsers: async () => { throw new Error('DB connection failed'); },
      isUserMonitored: async () => false,
      close: async () => {},
    };

    const cache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
    const monitor = new MonitorServiceImpl(failingStorage as any, cache, createMockLogger());

    // initialize 應拋出錯誤，讓呼叫者（bot.ts）決定如何降級
    await expect(monitor.initialize()).rejects.toThrow('DB connection failed');
    cache.destroy();
  });

  test('initialize 失敗後，isUserMonitored 應返回 false（空狀態）', async () => {
    const failingStorage = {
      initialize: async () => {},
      addMonitoredUser: async () => {},
      removeMonitoredUser: async () => {},
      getMonitoredUsers: async () => [],
      getAllMonitoredUsers: async () => { throw new Error('DB error'); },
      isUserMonitored: async () => false,
      close: async () => {},
    };

    const cache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
    const monitor = new MonitorServiceImpl(failingStorage as any, cache, createMockLogger());

    try { await monitor.initialize(); } catch { /* 預期失敗 */ }

    // 失敗後記憶體狀態應為空
    expect(monitor.isUserMonitored('anyUser', 'anyGuild')).toBe(false);
    cache.destroy();
  });
});
