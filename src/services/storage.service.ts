/**
 * SQLite Storage Service
 * 使用 Bun 內建的 bun:sqlite 模組管理監控設定的持久化儲存
 */

import { Database } from 'bun:sqlite';
import type { StorageService, MonitoredUser, Logger } from '../types';
import { ErrorCode, BotError } from '../types';

export class SQLiteStorageService implements StorageService {
  private db: Database;
  private dbPath: string;
  private logger: Logger;

  constructor(logger: Logger, dbPath: string = 'data/monitor.db') {
    this.logger = logger;
    this.dbPath = dbPath;
    this.db = new Database(dbPath, { create: true });
  }

  /**
   * 初始化資料庫（建立資料表和索引）
   */
  async initialize(): Promise<void> {
    try {
      // 建立監控用戶資料表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS monitored_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(guild_id, user_id)
        )
      `);

      // 建立索引以加速查詢
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_guild_id 
        ON monitored_users(guild_id)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_user_id 
        ON monitored_users(user_id)
      `);

      this.logger.info('SQLite 資料庫初始化完成', { dbPath: this.dbPath });
    } catch (error) {
      this.logger.error('資料庫初始化失敗', error as Error, { dbPath: this.dbPath });
      throw new BotError(
        '資料庫初始化失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 新增監控用戶至資料庫
   */
  async addMonitoredUser(guildId: string, userId: string): Promise<void> {
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO monitored_users (guild_id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(guildId, userId, now, now);

      this.logger.info('新增監控用戶至資料庫', { guildId, userId });
    } catch (error: any) {
      // 處理唯一性約束違反（重複新增）
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        this.logger.warn('用戶已在監控清單中', { guildId, userId });
        throw new BotError(
          '用戶已在監控清單中',
          ErrorCode.USER_ALREADY_MONITORED,
          { guildId, userId }
        );
      }

      // 處理資料庫忙碌錯誤
      if (error.message && error.message.includes('database is locked')) {
        this.logger.error('資料庫忙碌', error, { guildId, userId });
        throw new BotError(
          '資料庫忙碌，請稍後再試',
          ErrorCode.DATABASE_ERROR,
          error
        );
      }

      // 其他資料庫錯誤
      this.logger.error('新增監控用戶失敗', error, { guildId, userId });
      throw new BotError(
        '新增監控用戶失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 從資料庫移除監控用戶
   */
  async removeMonitoredUser(guildId: string, userId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM monitored_users 
        WHERE guild_id = ? AND user_id = ?
      `);

      const result = stmt.run(guildId, userId);

      if (result.changes === 0) {
        this.logger.warn('用戶不在監控清單中', { guildId, userId });
        throw new BotError(
          '用戶不在監控清單中',
          ErrorCode.USER_NOT_MONITORED,
          { guildId, userId }
        );
      }

      this.logger.info('從資料庫移除監控用戶', { guildId, userId });
    } catch (error) {
      // 如果是我們自己拋出的錯誤，直接重新拋出
      if (error instanceof BotError) {
        throw error;
      }

      // 其他資料庫錯誤
      this.logger.error('移除監控用戶失敗', error as Error, { guildId, userId });
      throw new BotError(
        '移除監控用戶失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 查詢指定伺服器的監控用戶
   */
  async getMonitoredUsers(guildId: string): Promise<string[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id FROM monitored_users 
        WHERE guild_id = ?
        ORDER BY created_at ASC
      `);

      const rows = stmt.all(guildId) as Array<{ user_id: string }>;
      
      this.logger.debug('查詢監控用戶', { 
        guildId, 
        count: rows.length 
      });

      return rows.map(row => row.user_id);
    } catch (error) {
      this.logger.error('查詢監控用戶失敗', error as Error, { guildId });
      throw new BotError(
        '查詢監控用戶失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 查詢所有監控用戶
   */
  async getAllMonitoredUsers(): Promise<MonitoredUser[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, guild_id, user_id, created_at, updated_at 
        FROM monitored_users
        ORDER BY guild_id, created_at ASC
      `);

      const rows = stmt.all() as Array<{
        id: number;
        guild_id: string;
        user_id: string;
        created_at: number;
        updated_at: number;
      }>;

      this.logger.debug('查詢所有監控用戶', { count: rows.length });

      return rows.map(row => ({
        id: row.id,
        guildId: row.guild_id,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      this.logger.error('查詢所有監控用戶失敗', error as Error);
      throw new BotError(
        '查詢所有監控用戶失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 檢查用戶是否被監控
   */
  async isUserMonitored(guildId: string, userId: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM monitored_users 
        WHERE guild_id = ? AND user_id = ?
      `);

      const result = stmt.get(guildId, userId) as { count: number };
      
      const isMonitored = result.count > 0;
      
      this.logger.debug('檢查用戶監控狀態', { 
        guildId, 
        userId, 
        isMonitored 
      });

      return isMonitored;
    } catch (error) {
      this.logger.error('檢查用戶監控狀態失敗', error as Error, { guildId, userId });
      throw new BotError(
        '檢查用戶監控狀態失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }

  /**
   * 關閉資料庫連線
   */
  async close(): Promise<void> {
    try {
      this.db.close();
      this.logger.info('SQLite 資料庫連線已關閉');
    } catch (error) {
      this.logger.error('關閉資料庫連線失敗', error as Error);
      throw new BotError(
        '關閉資料庫連線失敗',
        ErrorCode.DATABASE_ERROR,
        error
      );
    }
  }
}
