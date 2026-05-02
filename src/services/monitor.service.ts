/**
 * Monitor Service - 核心業務邏輯服務
 *
 * 負責：
 * 1. 管理監控用戶清單（新增、移除、查詢）
 * 2. 監控訊息建立、更新與刪除事件
 * 3. 訊息刪除偵測與恢復（ghost ping / deleted message 功能）
 * 4. 整合 StorageService（持久化）與 CacheService（記憶體快取）
 */

import type { Message, PartialMessage, TextChannel, GuildMember } from 'discord.js';
import type {
  MonitorService,
  StorageService,
  CacheService,
  Logger,
  Result,
  CachedMessage,
  AttachmentData,
  EmbedData,
} from '../types/index.js';
import { ErrorCode, BotError } from '../types/index.js';
import { DiscordAPIErrorHandler } from '../utils/error-handler.js';


export class MonitorServiceImpl implements MonitorService {
  /** 記憶體中的監控用戶清單（guildId -> Set<userId>），避免每次查詢資料庫 */
  private monitoredUsers: Map<string, Set<string>>;
  private readonly errorHandler: DiscordAPIErrorHandler;

  constructor(
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    private readonly logger: Logger
  ) {
    this.monitoredUsers = new Map();
    this.errorHandler = new DiscordAPIErrorHandler(logger);
  }

  // ==================== 初始化 ====================

  /**
   * 初始化：從持久化儲存載入已監控用戶並建立對應快取
   */
  async initialize(): Promise<void> {
    try {
      const allUsers = await this.storage.getAllMonitoredUsers();

      for (const user of allUsers) {
        // 建立記憶體索引
        this._addToMemoryIndex(user.guildId, user.userId);
        // 建立快取空間
        if (!this.cache.hasUserCache(user.userId)) {
          this.cache.createUserCache(user.userId);
        }
      }

      this.logger.info('MonitorService 初始化完成', {
        totalUsers: allUsers.length,
      });
    } catch (error) {
      this.logger.error('MonitorService 初始化失敗', error as Error);
      throw error;
    }
  }

  // ==================== 用戶管理 ====================

  /**
   * 新增監控用戶
   * - 驗證用戶是否存在於伺服器
   * - 防止重複新增
   * - 同步至資料庫和記憶體快取
   */
  async addMonitoredUser(userId: string, guildId: string): Promise<Result<void>> {
    try {
      // 從環境變數讀取上限，預設為 5
      const maxUsers = parseInt(process.env.MAX_MONITORED_USERS_PER_GUILD || '5', 10);
      
      // 檢查是否超過人數上限
      const currentUsers = this.monitoredUsers.get(guildId);
      if (currentUsers && currentUsers.size >= maxUsers) {
        return {
          success: false,
          error: `每個伺服器最多只能監控 ${maxUsers} 名用戶`,
          details: { userId, guildId, code: ErrorCode.MONITOR_LIMIT_EXCEEDED },
        };
      }

      // 防止重複新增（記憶體層快速檢查）
      if (this.isUserMonitored(userId, guildId)) {
        return {
          success: false,
          error: '用戶已在監控清單中',
          details: { userId, guildId, code: ErrorCode.USER_ALREADY_MONITORED },
        };
      }

      // 持久化
      await this.storage.addMonitoredUser(guildId, userId);

      // 更新記憶體索引
      this._addToMemoryIndex(guildId, userId);

      // 建立快取空間
      if (!this.cache.hasUserCache(userId)) {
        this.cache.createUserCache(userId);
      }

      this.logger.info('新增監控用戶成功', { userId, guildId });
      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof BotError && error.code === ErrorCode.USER_ALREADY_MONITORED) {
        return {
          success: false,
          error: '用戶已在監控清單中',
          details: { userId, guildId },
        };
      }

      this.logger.error('新增監控用戶失敗', error as Error, { userId, guildId });
      return {
        success: false,
        error: '新增監控用戶時發生錯誤',
        details: error,
      };
    }
  }

  /**
   * 移除監控用戶
   * - 從資料庫移除
   * - 清理記憶體索引
   * - 清理快取
   */
  async removeMonitoredUser(userId: string, guildId: string): Promise<Result<void>> {
    try {
      if (!this.isUserMonitored(userId, guildId)) {
        return {
          success: false,
          error: '用戶不在監控清單中',
          details: { userId, guildId, code: ErrorCode.USER_NOT_MONITORED },
        };
      }

      // 從資料庫移除
      await this.storage.removeMonitoredUser(guildId, userId);

      // 更新記憶體索引
      this._removeFromMemoryIndex(guildId, userId);

      // 如果此用戶在所有伺服器都不再被監控，則清理快取
      if (!this._isUserMonitoredAnywhere(userId)) {
        this.cache.deleteUserCache(userId);
      }

      this.logger.info('移除監控用戶成功', { userId, guildId });
      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof BotError && error.code === ErrorCode.USER_NOT_MONITORED) {
        return {
          success: false,
          error: '用戶不在監控清單中',
          details: { userId, guildId },
        };
      }

      this.logger.error('移除監控用戶失敗', error as Error, { userId, guildId });
      return {
        success: false,
        error: '移除監控用戶時發生錯誤',
        details: error,
      };
    }
  }

  /**
   * 查詢指定伺服器的所有監控用戶
   */
  async getMonitoredUsers(guildId: string): Promise<string[]> {
    const guildUsers = this.monitoredUsers.get(guildId);
    if (!guildUsers) {
      return [];
    }
    return Array.from(guildUsers);
  }

  /**
   * 檢查用戶是否被監控（記憶體層，O(1)）
   */
  isUserMonitored(userId: string, guildId: string): boolean {
    return this.monitoredUsers.get(guildId)?.has(userId) ?? false;
  }

  // ==================== 訊息處理 ====================

  /**
   * 處理訊息建立事件
   * 若作者為被監控用戶，則將訊息快取
   */
  async handleMessageCreate(message: Message): Promise<void> {
    if (!message.guild) return;

    const { author, id: messageId, channelId, guild } = message;

    if (!this.isUserMonitored(author.id, guild.id)) {
      return;
    }

    const cachedMessage = this._extractMessageData(message);
    this.cache.set(author.id, messageId, cachedMessage);

    this.logger.debug('已快取被監控用戶訊息', {
      userId: author.id,
      messageId,
      channelId,
      guildId: guild.id,
    });
  }

  /**
   * 處理訊息更新事件
   * 更新快取中的訊息內容
   */
  async handleMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void> {
    if (!newMessage.guild) return;

    const { author, id: messageId, guild } = newMessage;

    if (!this.isUserMonitored(author.id, guild.id)) {
      return;
    }

    const updatedData = this._extractMessageData(newMessage);
    const updated = this.cache.update(author.id, messageId, updatedData);

    if (updated) {
      this.logger.debug('已更新快取訊息', {
        userId: author.id,
        messageId,
        guildId: guild.id,
      });
    } else {
      // 訊息不在快取中（例如機器人重啟前的舊訊息），直接快取新版本
      this.cache.set(author.id, messageId, updatedData);
      this.logger.debug('訊息不在快取中，已重新快取', {
        userId: author.id,
        messageId,
        guildId: guild.id,
      });
    }
  }

  /**
   * 處理訊息刪除事件
   * 從快取檢索被刪除的訊息並發送至通知頻道
   */
  async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild) return;

    // Discord 刪除事件可能是 partial message，無法直接得知作者
    // 需要遍歷所有被監控用戶的快取來尋找
    const guildId = message.guild.id;
    const messageId = message.id;
    const channelId = message.channelId;

    const guildUsers = this.monitoredUsers.get(guildId);
    if (!guildUsers || guildUsers.size === 0) {
      return;
    }

    // 在各監控用戶的快取中尋找此訊息
    for (const userId of guildUsers) {
      const cachedMsg = this.cache.get(userId, messageId);
      if (cachedMsg) {
        // 找到了，發送通知
        await this._sendDeletedMessageNotification(message, cachedMsg, guildId);
        // 從快取移除
        this.cache.delete(userId, messageId);
        return;
      }
    }

    // 快取未命中：訊息不在快取中（可能已過期或是機器人重啟前的舊訊息）
    this.logger.debug('刪除訊息不在快取中（快取未命中）', {
      messageId,
      channelId,
      guildId,
    });
  }

  // ==================== 私有方法 ====================

  /**
   * 從 Discord Message 物件提取訊息資料
   */
  private _extractMessageData(message: Message): CachedMessage {
    const attachments: AttachmentData[] = Array.from(message.attachments.values()).map((a) => ({
      url: a.url,
      name: a.name,
      contentType: a.contentType ?? undefined,
    }));

    const embeds: EmbedData[] = message.embeds.map((e) => ({
      title: e.title ?? undefined,
      description: e.description ?? undefined,
      url: e.url ?? undefined,
      color: e.color ?? undefined,
      fields: e.fields?.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline,
      })),
    }));

    return {
      messageId: message.id,
      channelId: message.channelId,
      guildId: message.guild!.id,
      authorId: message.author.id,
      content: message.content ?? '',
      attachments,
      embeds,
      timestamp: message.createdTimestamp,
      expiresAt: 0, // 由 CacheService.set() 設定
    };
  }

  /**
   * 發送被刪除訊息的通知
   */
  private async _sendDeletedMessageNotification(
    deletedMessage: Message | PartialMessage,
    cachedMsg: CachedMessage,
    guildId: string
  ): Promise<void> {
    const channel = deletedMessage.channel as TextChannel;
    if (!channel?.send) {
      this.logger.warn('無法取得通知頻道', { channelId: deletedMessage.channelId });
      return;
    }

    const deletedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const sentAt = new Date(cachedMsg.timestamp).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
    });

    let content = `🗑️ **被刪除的訊息 [監控記錄]**\n`;
    content += `👤 用戶：<@${cachedMsg.authorId}> (\`${cachedMsg.authorId}\`)\n`;
    content += `📍 頻道：<#${cachedMsg.channelId}>\n`;
    content += `🕐 發送時間：${sentAt}\n`;
    content += `🕑 刪除時間：${deletedAt}\n`;

    if (cachedMsg.content) {
      content += `\n📝 **訊息內容：**\n${cachedMsg.content}`;
    }

    if (cachedMsg.attachments.length > 0) {
      content += `\n\n📎 **附件：**\n`;
      content += cachedMsg.attachments.map((a) => `• [${a.name}](${a.url})`).join('\n');
    }

    const context = {
      messageId: cachedMsg.messageId,
      channelId: cachedMsg.channelId,
      guildId,
    };

    // 使用指數退避重試發送通知
    try {
      await this.errorHandler.withRetry(
        () =>
          channel.send({
            content,
            allowedMentions: { parse: [] }, // 避免 ping 任何人
          }),
        context
      );

      this.logger.info('已發送被刪除訊息通知', {
        userId: cachedMsg.authorId,
        ...context,
      });
    } catch (error) {
      this.logger.error('發送被刪除訊息通知失敗（已重試）', error as Error, context);
    }
  }

  /** 新增至記憶體索引 */
  private _addToMemoryIndex(guildId: string, userId: string): void {
    if (!this.monitoredUsers.has(guildId)) {
      this.monitoredUsers.set(guildId, new Set());
    }
    this.monitoredUsers.get(guildId)!.add(userId);
  }

  /** 從記憶體索引移除 */
  private _removeFromMemoryIndex(guildId: string, userId: string): void {
    const guildUsers = this.monitoredUsers.get(guildId);
    if (guildUsers) {
      guildUsers.delete(userId);
      if (guildUsers.size === 0) {
        this.monitoredUsers.delete(guildId);
      }
    }
  }

  /** 檢查用戶是否在任意伺服器被監控 */
  private _isUserMonitoredAnywhere(userId: string): boolean {
    for (const userSet of this.monitoredUsers.values()) {
      if (userSet.has(userId)) return true;
    }
    return false;
  }
}
