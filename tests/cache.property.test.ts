/**
 * CacheService 屬性測試
 * Tasks: 4.5, 4.6
 */

import { describe, test, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import { CacheServiceImpl } from '../src/services/cache.service';
import type { CachedMessage } from '../src/types';

const makeMsg = (overrides: Partial<CachedMessage> = {}): CachedMessage => ({
  messageId: overrides.messageId ?? 'msg1',
  channelId: overrides.channelId ?? 'ch1',
  guildId: overrides.guildId ?? 'g1',
  authorId: overrides.authorId ?? 'u1',
  content: overrides.content ?? 'hello',
  attachments: [],
  embeds: [],
  timestamp: overrides.timestamp ?? Date.now(),
  expiresAt: overrides.expiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
});

// ==================== Task 4.5: 屬性 19 — 用戶快取隔離 ====================

describe('[屬性測試 4.5] 屬性 19：用戶快取互不影響', () => {
  let cache: CacheServiceImpl;

  beforeEach(() => {
    cache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
  });

  afterEach(() => {
    cache.destroy();
  });

  test('不同用戶的訊息互不可見', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userA, userB, msgId) => {
          if (userA === userB) return true; // 跳過相同用戶
          const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });

          freshCache.createUserCache(userA);
          freshCache.createUserCache(userB);
          freshCache.set(userA, msgId, makeMsg({ messageId: msgId, authorId: userA }));

          // userB 不應看到 userA 的訊息
          const result = freshCache.get(userB, msgId);
          freshCache.destroy();
          return result === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('刪除一個用戶快取不影響其他用戶', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userA, userB, msgId) => {
          if (userA === userB) return true;
          const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });

          freshCache.createUserCache(userA);
          freshCache.createUserCache(userB);
          freshCache.set(userA, msgId, makeMsg({ messageId: msgId }));
          freshCache.set(userB, msgId, makeMsg({ messageId: msgId }));

          freshCache.deleteUserCache(userA);

          // userB 仍應存在
          const result = freshCache.get(userB, msgId);
          freshCache.destroy();
          return result !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('set 到不存在的用戶快取不應影響其他用戶的快取大小', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (existingUser, nonExistingUser, msgId) => {
          if (existingUser === nonExistingUser) return true;
          const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });

          freshCache.createUserCache(existingUser);
          freshCache.set(existingUser, msgId, makeMsg({ messageId: msgId }));
          const sizeBefore = freshCache.userSize(existingUser);

          // 嘗試 set 到不存在的用戶（應被忽略）
          freshCache.set(nonExistingUser, 'msg2', makeMsg({ messageId: 'msg2' }));

          const sizeAfter = freshCache.userSize(existingUser);
          freshCache.destroy();
          return sizeBefore === sizeAfter;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==================== Task 4.6: 屬性 20 — 快取生命週期同步 ====================

describe('[屬性測試 4.6] 屬性 20：快取生命週期同步', () => {
  test('createUserCache 後 hasUserCache 必為 true', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (userId) => {
        const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
        freshCache.createUserCache(userId);
        const result = freshCache.hasUserCache(userId);
        freshCache.destroy();
        return result === true;
      }),
      { numRuns: 100 }
    );
  });

  test('deleteUserCache 後 hasUserCache 必為 false', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (userId) => {
        const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
        freshCache.createUserCache(userId);
        freshCache.deleteUserCache(userId);
        const result = freshCache.hasUserCache(userId);
        freshCache.destroy();
        return result === false;
      }),
      { numRuns: 100 }
    );
  });

  test('已設定的訊息在過期前必能取回', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string(),
        (userId, msgId, content) => {
          const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
          freshCache.createUserCache(userId);
          const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
          const msg = makeMsg({ messageId: msgId, authorId: userId, content, expiresAt: future });
          freshCache.set(userId, msgId, msg);
          const retrieved = freshCache.get(userId, msgId);
          freshCache.destroy();
          return retrieved !== null && retrieved.content === content;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('已過期的訊息取回必返回 null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId, msgId) => {
          const freshCache = new CacheServiceImpl({ cleanupIntervalMs: 999_999_999 });
          freshCache.createUserCache(userId);
          const past = Date.now() - 1; // 已過期
          const msg = makeMsg({ messageId: msgId, authorId: userId, expiresAt: past });
          // 直接設定（繞過 set 的 expiresAt 計算，需要直接操作）
          // 使用 update 前先 set 然後手動改 expiresAt
          freshCache.set(userId, msgId, msg);
          freshCache.update(userId, msgId, { expiresAt: past });
          const retrieved = freshCache.get(userId, msgId);
          freshCache.destroy();
          return retrieved === null;
        }
      ),
      { numRuns: 50 }
    );
  });
});
