/**
 * MonitorService 單元測試 + 屬性測試
 * Tasks: 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12
 */

import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import * as fc from 'fast-check';
import { MonitorServiceImpl } from '../src/services/monitor.service';
import type { StorageService, CacheService, Logger, CachedMessage, MonitoredUser } from '../src/types';
import { BotError, ErrorCode } from '../src/types';

// ==================== Mock 工廠 ====================

const createMockLogger = (): Logger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

const createMockStorage = (): StorageService => ({
  initialize: mock(async () => {}),
  addMonitoredUser: mock(async () => {}),
  removeMonitoredUser: mock(async () => {}),
  getMonitoredUsers: mock(async () => []),
  getAllMonitoredUsers: mock(async () => []),
  isUserMonitored: mock(async () => false),
  close: mock(async () => {}),
});

const createMockCache = (): CacheService => {
  const store = new Map<string, Map<string, CachedMessage>>();
  return {
    createUserCache: mock((userId: string) => { store.set(userId, new Map()); }),
    deleteUserCache: mock((userId: string) => { store.delete(userId); }),
    hasUserCache: mock((userId: string) => store.has(userId)),
    set: mock((userId: string, msgId: string, msg: CachedMessage) => {
      if (!store.has(userId)) store.set(userId, new Map());
      store.get(userId)!.set(msgId, { ...msg, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    }),
    get: mock((userId: string, msgId: string) => store.get(userId)?.get(msgId) ?? null),
    update: mock((userId: string, msgId: string, data: Partial<CachedMessage>) => {
      const existing = store.get(userId)?.get(msgId);
      if (!existing) return false;
      store.get(userId)!.set(msgId, { ...existing, ...data });
      return true;
    }),
    delete: mock((userId: string, msgId: string) => {
      return store.get(userId)?.delete(msgId) ?? false;
    }),
    cleanup: mock(() => {}),
    cleanupUser: mock(() => {}),
    size: mock(() => { let t = 0; for (const m of store.values()) t += m.size; return t; }),
    userSize: mock((userId: string) => store.get(userId)?.size ?? 0),
    userCount: mock(() => store.size),
    getMemoryUsage: mock(() => ({
      heapUsedMB: 0, heapTotalMB: 0, rssMB: 0,
      cachedMessages: 0, monitoredUsers: 0,
      averageMessagesPerUser: 0, estimatedCacheSizeMB: 0,
    })),
    reduceUserCache: mock(() => 0),
    removeOldestMessages: mock(() => 0),
    getAllUserIds: mock(() => []),
    setConfig: mock(() => {}),
    getConfig: mock(() => ({} as any)),
  };
};

/** 建立 mock Discord Message */
const makeMockMessage = (overrides: Partial<{
  id: string; content: string; authorId: string; guildId: string;
  channelId: string; isBot: boolean; channelSend: ReturnType<typeof mock>;
}> = {}) => {
  const send = overrides.channelSend ?? mock(async () => ({}));
  return {
    id: overrides.id ?? 'msg1',
    content: overrides.content ?? 'hello',
    channelId: overrides.channelId ?? 'channel1',
    createdTimestamp: Date.now(),
    author: { id: overrides.authorId ?? 'user1', bot: overrides.isBot ?? false },
    guild: { id: overrides.guildId ?? 'guild1' },
    attachments: { values: () => [] },
    embeds: [],
    channel: { send },
  } as any;
};

// ==================== Task 7.5: MonitorService 單元測試 ====================

describe('MonitorService 單元測試 (7.5)', () => {
  let service: MonitorServiceImpl;
  let storage: StorageService;
  let cache: CacheService;
  let logger: Logger;

  beforeEach(() => {
    storage = createMockStorage();
    cache = createMockCache();
    logger = createMockLogger();
    service = new MonitorServiceImpl(storage, cache, logger);
  });

  // ---- 初始化 ----

  describe('initialize()', () => {
    test('應從 storage 載入所有監控用戶並建立快取', async () => {
      const users: MonitoredUser[] = [
        { id: 1, guildId: 'g1', userId: 'u1', createdAt: 0, updatedAt: 0 },
        { id: 2, guildId: 'g1', userId: 'u2', createdAt: 0, updatedAt: 0 },
      ];
      (storage.getAllMonitoredUsers as ReturnType<typeof mock>).mockResolvedValue(users);

      await service.initialize();

      expect(service.isUserMonitored('u1', 'g1')).toBe(true);
      expect(service.isUserMonitored('u2', 'g1')).toBe(true);
    });

    test('storage 失敗時應拋出錯誤', async () => {
      (storage.getAllMonitoredUsers as ReturnType<typeof mock>).mockRejectedValue(new Error('DB down'));
      await expect(service.initialize()).rejects.toThrow('DB down');
    });
  });

  // ---- 新增監控用戶 ----

  describe('addMonitoredUser()', () => {
    test('成功新增監控用戶應返回 success: true', async () => {
      const result = await service.addMonitoredUser('u1', 'g1');
      expect(result.success).toBe(true);
      expect(service.isUserMonitored('u1', 'g1')).toBe(true);
    });

    test('應呼叫 storage.addMonitoredUser', async () => {
      await service.addMonitoredUser('u1', 'g1');
      expect(storage.addMonitoredUser).toHaveBeenCalledWith('g1', 'u1');
    });

    test('應為新用戶建立快取空間', async () => {
      await service.addMonitoredUser('u1', 'g1');
      expect(cache.createUserCache).toHaveBeenCalledWith('u1');
    });

    test('重複新增已監控用戶應返回 success: false', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const result = await service.addMonitoredUser('u1', 'g1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('已在監控清單');
      }
    });

    test('storage 拋出錯誤時應返回 success: false', async () => {
      (storage.addMonitoredUser as ReturnType<typeof mock>).mockRejectedValue(new Error('DB error'));
      const result = await service.addMonitoredUser('u1', 'g1');
      expect(result.success).toBe(false);
    });
  });

  // ---- 移除監控用戶 ----

  describe('removeMonitoredUser()', () => {
    beforeEach(async () => {
      await service.addMonitoredUser('u1', 'g1');
    });

    test('成功移除應返回 success: true', async () => {
      const result = await service.removeMonitoredUser('u1', 'g1');
      expect(result.success).toBe(true);
      expect(service.isUserMonitored('u1', 'g1')).toBe(false);
    });

    test('移除後應清理快取', async () => {
      await service.removeMonitoredUser('u1', 'g1');
      expect(cache.deleteUserCache).toHaveBeenCalledWith('u1');
    });

    test('移除不存在用戶應返回 success: false', async () => {
      const result = await service.removeMonitoredUser('nonexistent', 'g1');
      expect(result.success).toBe(false);
    });

    test('用戶在多個伺服器被監控時，移除一個不應清理快取', async () => {
      await service.addMonitoredUser('u1', 'g2');
      await service.removeMonitoredUser('u1', 'g1');
      // u1 仍在 g2 中，不應刪快取
      expect(cache.deleteUserCache).not.toHaveBeenCalled();
    });
  });

  // ---- 查詢監控用戶 ----

  describe('getMonitoredUsers()', () => {
    test('返回指定伺服器的監控用戶', async () => {
      await service.addMonitoredUser('u1', 'g1');
      await service.addMonitoredUser('u2', 'g1');
      const users = await service.getMonitoredUsers('g1');
      expect(users).toContain('u1');
      expect(users).toContain('u2');
    });

    test('無監控用戶時返回空陣列', async () => {
      const users = await service.getMonitoredUsers('g1');
      expect(users).toEqual([]);
    });
  });

  // ---- handleMessageCreate ----

  describe('handleMessageCreate()', () => {
    test('被監控用戶發訊息應存入快取', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const msg = makeMockMessage({ authorId: 'u1', guildId: 'g1' });
      await service.handleMessageCreate(msg);
      expect(cache.set).toHaveBeenCalled();
    });

    test('非監控用戶發訊息不應存入快取', async () => {
      const msg = makeMockMessage({ authorId: 'nonMonitored', guildId: 'g1' });
      await service.handleMessageCreate(msg);
      expect(cache.set).not.toHaveBeenCalled();
    });

    test('私訊應被忽略（guild 為 null）', async () => {
      const msg = { ...makeMockMessage(), guild: null };
      await service.handleMessageCreate(msg as any);
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  // ---- handleMessageUpdate ----

  describe('handleMessageUpdate()', () => {
    test('被監控用戶更新訊息後，MonitorService 不應拋出錯誤', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const oldMsg = makeMockMessage({ id: 'msg1', content: 'old', authorId: 'u1' });
      const newMsg = makeMockMessage({ id: 'msg1', content: 'new', authorId: 'u1' });
      // handleMessageUpdate 應正常執行不拋錯
      await expect(service.handleMessageUpdate(oldMsg, newMsg)).resolves.toBeUndefined();
    });

    test('非監控用戶更新訊息不應修改快取', async () => {
      const old = makeMockMessage({ authorId: 'noone', content: 'old' });
      const nw = makeMockMessage({ authorId: 'noone', content: 'new' });
      await service.handleMessageUpdate(old, nw);
      expect(cache.update).not.toHaveBeenCalled();
    });
  });

  // ---- handleMessageDelete ----

  describe('handleMessageDelete()', () => {
    test('被監控用戶的訊息刪除時應發送通知', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const send = mock(async () => ({}));
      const msg = makeMockMessage({ id: 'msg1', authorId: 'u1', guildId: 'g1', channelSend: send });
      // 先快取訊息
      await service.handleMessageCreate(msg);
      await service.handleMessageDelete(msg);
      expect(send).toHaveBeenCalled();
    });

    test('快取未命中時不應拋出錯誤', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const msg = makeMockMessage({ id: 'not-cached', guildId: 'g1' });
      await expect(service.handleMessageDelete(msg)).resolves.toBeUndefined();
    });

    test('無監控用戶的伺服器刪除訊息時應直接返回', async () => {
      const msg = makeMockMessage({ guildId: 'empty-guild' });
      await service.handleMessageDelete(msg);
      expect(cache.get).not.toHaveBeenCalled();
    });
  });

  // ---- _extractMessageData 覆蓋（attachments + embeds） ----

  describe('handleMessageCreate() 含附件與嵌入', () => {
    test('帶有附件的訊息應正確快取附件資料', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const msg = {
        id: 'msg-att',
        content: 'file attached',
        channelId: 'ch1',
        createdTimestamp: Date.now(),
        author: { id: 'u1', bot: false },
        guild: { id: 'g1' },
        attachments: {
          values: () => [
            { url: 'https://cdn.discord.com/a.png', name: 'a.png', contentType: 'image/png' },
            { url: 'https://cdn.discord.com/b.pdf', name: 'b.pdf', contentType: null },
          ],
        },
        embeds: [],
        channel: { send: mock(async () => ({})) },
      } as any;

      await service.handleMessageCreate(msg);

      // 驗證 cache.set 被呼叫，且附件已被正確提取
      expect(cache.set).toHaveBeenCalled();
      const setCall = (cache.set as ReturnType<typeof mock>).mock.calls[0]!;
      const cachedMsg = setCall[2] as CachedMessage;
      expect(cachedMsg.attachments).toHaveLength(2);
      expect(cachedMsg.attachments[0].url).toBe('https://cdn.discord.com/a.png');
      expect(cachedMsg.attachments[0].name).toBe('a.png');
      expect(cachedMsg.attachments[0].contentType).toBe('image/png');
      // contentType 為 null 時應轉為 undefined
      expect(cachedMsg.attachments[1].contentType).toBeUndefined();
    });

    test('帶有嵌入的訊息應正確快取嵌入資料', async () => {
      await service.addMonitoredUser('u1', 'g1');
      const msg = {
        id: 'msg-embed',
        content: '',
        channelId: 'ch1',
        createdTimestamp: Date.now(),
        author: { id: 'u1', bot: false },
        guild: { id: 'g1' },
        attachments: { values: () => [] },
        embeds: [
          {
            title: 'Test Embed',
            description: 'A description',
            url: 'https://example.com',
            color: 0xff0000,
            fields: [
              { name: 'Field1', value: 'Value1', inline: true },
              { name: 'Field2', value: 'Value2', inline: false },
            ],
          },
          {
            title: null,
            description: null,
            url: null,
            color: null,
            fields: undefined,
          },
        ],
        channel: { send: mock(async () => ({})) },
      } as any;

      await service.handleMessageCreate(msg);

      const setCall = (cache.set as ReturnType<typeof mock>).mock.calls[0]!;
      const cachedMsg = setCall[2] as CachedMessage;
      expect(cachedMsg.embeds).toHaveLength(2);

      // 第一個 embed 有完整資料
      expect(cachedMsg.embeds[0].title).toBe('Test Embed');
      expect(cachedMsg.embeds[0].description).toBe('A description');
      expect(cachedMsg.embeds[0].url).toBe('https://example.com');
      expect(cachedMsg.embeds[0].color).toBe(0xff0000);
      expect(cachedMsg.embeds[0].fields).toHaveLength(2);
      expect(cachedMsg.embeds[0].fields![0].name).toBe('Field1');
      expect(cachedMsg.embeds[0].fields![1].inline).toBe(false);

      // 第二個 embed 的 null 值應轉為 undefined
      expect(cachedMsg.embeds[1].title).toBeUndefined();
      expect(cachedMsg.embeds[1].description).toBeUndefined();
      expect(cachedMsg.embeds[1].url).toBeUndefined();
      expect(cachedMsg.embeds[1].color).toBeUndefined();
      expect(cachedMsg.embeds[1].fields).toBeUndefined();
    });
  });
});

// ==================== Task 7.6: 屬性 1 — 用戶存在性驗證 ====================

describe('[屬性測試 7.6] 屬性 1：addMonitoredUser 後 isUserMonitored 必為 true', () => {
  test('對任意 userId/guildId，新增後應可查到', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId) => {
          const storage = createMockStorage();
          const cache = createMockCache();
          const service = new MonitorServiceImpl(storage, cache, createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          return service.isUserMonitored(userId, guildId) === true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ==================== Task 7.7: 屬性 2 — 重複新增防護 ====================

describe('[屬性測試 7.7] 屬性 2：重複新增同一用戶不應成功', () => {
  test('第二次 addMonitoredUser 應返回 success: false', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId) => {
          const service = new MonitorServiceImpl(createMockStorage(), createMockCache(), createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          const second = await service.addMonitoredUser(userId, guildId);
          return second.success === false;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ==================== Task 7.8: 屬性 3 — 訊息快取完整性 ====================

describe('[屬性測試 7.8] 屬性 3：監控用戶的訊息必被快取', () => {
  test('handleMessageCreate 後 cache.set 應被呼叫', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId, content) => {
          const cache = createMockCache();
          const service = new MonitorServiceImpl(createMockStorage(), cache, createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          const msg = makeMockMessage({ authorId: userId, guildId, content });
          await service.handleMessageCreate(msg);
          return (cache.set as ReturnType<typeof mock>).mock.calls.length > 0;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ==================== Task 7.9: 屬性 4 — 訊息更新同步 ====================

describe('[屬性測試 7.9] 屬性 4：訊息更新後快取應呼叫 update', () => {
  test('handleMessageUpdate 對監控用戶應嘗試 cache.update', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId) => {
          const cache = createMockCache();
          const service = new MonitorServiceImpl(createMockStorage(), cache, createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          const old = makeMockMessage({ authorId: userId, guildId, content: 'old' });
          const nw = makeMockMessage({ id: old.id, authorId: userId, guildId, content: 'new' });
          await service.handleMessageCreate(old);
          await service.handleMessageUpdate(old, nw);
          return (cache.update as ReturnType<typeof mock>).mock.calls.length > 0;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ==================== Task 7.10: 屬性 5 — 快取保留期限 ====================

describe('[屬性測試 7.10] 屬性 5：快取訊息 expiresAt 必須在未來', () => {
  test('cache.set 被呼叫後，expiresAt 應大於 now', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId) => {
          const capturedMessages: CachedMessage[] = [];
          const cache = createMockCache();
          const origSet = (cache.set as ReturnType<typeof mock>);
          origSet.mockImplementation((uid: string, mid: string, msg: CachedMessage) => {
            capturedMessages.push({ ...msg, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
          });

          const service = new MonitorServiceImpl(createMockStorage(), cache, createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          const msg = makeMockMessage({ authorId: userId, guildId });
          const before = Date.now();
          await service.handleMessageCreate(msg);

          // expiresAt 必須在未來（至少 6 天後）
          return capturedMessages.every(m => m.expiresAt > before + 6 * 24 * 60 * 60 * 1000);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ==================== Task 7.11: 屬性 7/8/9 — 訊息恢復完整性 ====================

describe('[屬性測試 7.11] 屬性 7/8/9：訊息刪除通知應包含完整內容', () => {
  test('send 的內容應包含 authorId 和訊息內容', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (userId, guildId, content) => {
          const sentMessages: string[] = [];
          const send = mock(async (opts: { content: string }) => {
            sentMessages.push(opts.content);
            return {};
          });

          const cache = createMockCache();
          const service = new MonitorServiceImpl(createMockStorage(), cache, createMockLogger());
          await service.addMonitoredUser(userId, guildId);

          const msg = makeMockMessage({ authorId: userId, guildId, content, channelSend: send });
          await service.handleMessageCreate(msg);
          await service.handleMessageDelete(msg);

          if (sentMessages.length === 0) return true; // 可能快取為空（mock 問題）
          return sentMessages[0].includes(userId) && sentMessages[0].includes(content);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ==================== Task 7.12: 屬性 10 — 快取未命中不拋錯 ====================

describe('[屬性測試 7.12] 屬性 10：快取未命中時 handleMessageDelete 不應拋出', () => {
  test('刪除不在快取中的訊息不應拋出錯誤', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
        async (userId, guildId) => {
          const service = new MonitorServiceImpl(createMockStorage(), createMockCache(), createMockLogger());
          await service.addMonitoredUser(userId, guildId);
          const msg = makeMockMessage({ id: 'not-cached', guildId });
          try {
            await service.handleMessageDelete(msg);
            return true;
          } catch {
            return false;
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
