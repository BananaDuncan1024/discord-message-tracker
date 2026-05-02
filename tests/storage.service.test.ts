/**
 * SQLiteStorageService 單元測試
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteStorageService } from '../src/services/storage.service';
import { BotError, ErrorCode } from '../src/types';
import type { Logger } from '../src/types';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock Logger
const createMockLogger = (): Logger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
});

describe('SQLiteStorageService', () => {
  let storage: SQLiteStorageService;
  let tempDir: string;
  let dbPath: string;
  const logger = createMockLogger();

  beforeEach(async () => {
    // 建立臨時資料夾以隔離測試
    tempDir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    dbPath = join(tempDir, 'test.db');
    storage = new SQLiteStorageService(logger, dbPath);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    // 清理臨時檔案
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ==================== 初始化測試 ====================

  describe('initialize()', () => {
    test('應成功初始化資料庫並建立資料表', async () => {
      // 資料表已在 beforeEach 建立，驗證可以執行查詢
      const users = await storage.getAllMonitoredUsers();
      expect(users).toEqual([]);
    });

    test('重複呼叫 initialize 不應拋出錯誤', async () => {
      // CREATE TABLE IF NOT EXISTS 應允許重複呼叫
      await expect(storage.initialize()).resolves.toBeUndefined();
    });
  });

  // ==================== addMonitoredUser 測試 ====================

  describe('addMonitoredUser()', () => {
    test('應成功新增監控用戶', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      const users = await storage.getMonitoredUsers('guild1');
      expect(users).toContain('user1');
    });

    test('應成功新增多個不同用戶', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild1', 'user2');
      await storage.addMonitoredUser('guild1', 'user3');

      const users = await storage.getMonitoredUsers('guild1');
      expect(users).toHaveLength(3);
      expect(users).toContain('user1');
      expect(users).toContain('user2');
      expect(users).toContain('user3');
    });

    test('重複新增同一用戶應拋出 USER_ALREADY_MONITORED 錯誤', async () => {
      await storage.addMonitoredUser('guild1', 'user1');

      await expect(storage.addMonitoredUser('guild1', 'user1')).rejects.toMatchObject({
        code: ErrorCode.USER_ALREADY_MONITORED,
      });
    });

    test('同一用戶可以在不同伺服器被監控', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild2', 'user1');

      const guild1Users = await storage.getMonitoredUsers('guild1');
      const guild2Users = await storage.getMonitoredUsers('guild2');

      expect(guild1Users).toContain('user1');
      expect(guild2Users).toContain('user1');
    });
  });

  // ==================== removeMonitoredUser 測試 ====================

  describe('removeMonitoredUser()', () => {
    test('應成功移除監控用戶', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.removeMonitoredUser('guild1', 'user1');

      const users = await storage.getMonitoredUsers('guild1');
      expect(users).not.toContain('user1');
    });

    test('移除不存在的用戶應拋出 USER_NOT_MONITORED 錯誤', async () => {
      await expect(storage.removeMonitoredUser('guild1', 'nonexistent')).rejects.toMatchObject({
        code: ErrorCode.USER_NOT_MONITORED,
      });
    });

    test('移除特定伺服器的用戶不影響其他伺服器', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild2', 'user1');

      await storage.removeMonitoredUser('guild1', 'user1');

      const guild1Users = await storage.getMonitoredUsers('guild1');
      const guild2Users = await storage.getMonitoredUsers('guild2');

      expect(guild1Users).not.toContain('user1');
      expect(guild2Users).toContain('user1');
    });
  });

  // ==================== getMonitoredUsers 測試 ====================

  describe('getMonitoredUsers()', () => {
    test('無監控用戶時應返回空陣列', async () => {
      const users = await storage.getMonitoredUsers('guild1');
      expect(users).toEqual([]);
    });

    test('應只返回指定伺服器的用戶', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild2', 'user2');

      const guild1Users = await storage.getMonitoredUsers('guild1');
      expect(guild1Users).toContain('user1');
      expect(guild1Users).not.toContain('user2');
    });

    test('應按新增順序返回用戶', async () => {
      await storage.addMonitoredUser('guild1', 'userA');
      await storage.addMonitoredUser('guild1', 'userB');
      await storage.addMonitoredUser('guild1', 'userC');

      const users = await storage.getMonitoredUsers('guild1');
      expect(users[0]).toBe('userA');
      expect(users[1]).toBe('userB');
      expect(users[2]).toBe('userC');
    });
  });

  // ==================== getAllMonitoredUsers 測試 ====================

  describe('getAllMonitoredUsers()', () => {
    test('無資料時應返回空陣列', async () => {
      const users = await storage.getAllMonitoredUsers();
      expect(users).toEqual([]);
    });

    test('應返回所有伺服器的監控用戶', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild2', 'user2');

      const users = await storage.getAllMonitoredUsers();
      expect(users).toHaveLength(2);
    });

    test('返回的用戶資料應包含完整欄位', async () => {
      await storage.addMonitoredUser('guild1', 'user1');

      const users = await storage.getAllMonitoredUsers();
      expect(users[0]).toMatchObject({
        guildId: 'guild1',
        userId: 'user1',
      });
      expect(typeof users[0].id).toBe('number');
      expect(typeof users[0].createdAt).toBe('number');
      expect(typeof users[0].updatedAt).toBe('number');
    });
  });

  // ==================== isUserMonitored 測試 ====================

  describe('isUserMonitored()', () => {
    test('已監控的用戶應返回 true', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      const result = await storage.isUserMonitored('guild1', 'user1');
      expect(result).toBe(true);
    });

    test('未監控的用戶應返回 false', async () => {
      const result = await storage.isUserMonitored('guild1', 'nonexistent');
      expect(result).toBe(false);
    });

    test('同一用戶在不同伺服器應各自獨立', async () => {
      await storage.addMonitoredUser('guild1', 'user1');

      expect(await storage.isUserMonitored('guild1', 'user1')).toBe(true);
      expect(await storage.isUserMonitored('guild2', 'user1')).toBe(false);
    });

    test('移除用戶後應返回 false', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.removeMonitoredUser('guild1', 'user1');

      const result = await storage.isUserMonitored('guild1', 'user1');
      expect(result).toBe(false);
    });
  });

  // ==================== 資料持久化測試 ====================

  describe('資料持久化', () => {
    test('關閉後重新開啟應保留資料', async () => {
      await storage.addMonitoredUser('guild1', 'user1');
      await storage.addMonitoredUser('guild1', 'user2');
      await storage.close();

      // 重新開啟相同資料庫
      const newStorage = new SQLiteStorageService(logger, dbPath);
      await newStorage.initialize();

      const users = await newStorage.getMonitoredUsers('guild1');
      expect(users).toContain('user1');
      expect(users).toContain('user2');

      await newStorage.close();
    });
  });

  // ==================== close() 測試 ====================

  describe('close()', () => {
    test('應成功關閉資料庫連線', async () => {
      await expect(storage.close()).resolves.toBeUndefined();
    });
  });
});
