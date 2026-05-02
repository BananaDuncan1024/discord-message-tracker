/**
 * Discord Bot - 主要入口類別
 *
 * 負責：
 * 1. 初始化 Discord Client（設定 Intents）
 * 2. 組裝所有服務（Logger, Storage, Cache, Monitor, Command, Event）
 * 3. 啟動 Bot 並連線至 Discord
 * 4. 優雅關閉（graceful shutdown）
 */

import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { logger } from './services/logger.service.js';
import { SQLiteStorageService } from './services/storage.service.js';
import { createCacheService, CacheServiceImpl } from './services/cache.service.js';
import { MonitorServiceImpl } from './services/monitor.service.js';
import { CommandHandlerImpl } from './handlers/command.handler.js';
import { EventHandlerImpl } from './handlers/event.handler.js';

export class DiscordBot {
  private client: Client;
  private eventHandler!: EventHandlerImpl;
  private isShuttingDown = false;

  constructor() {
    // 初始化 Discord Client，設定必要的 Intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // 需要在 Developer Portal 啟用
        GatewayIntentBits.GuildMembers,
      ],
      partials: [
        Partials.Message, // 允許接收 partial message 刪除事件
        Partials.Channel,
      ],
    });
  }

  /**
   * 啟動 Bot
   */
  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('缺少 DISCORD_TOKEN 環境變數');
    }

    logger.info('正在初始化所有服務...');

    // 初始化 StorageService
    const dbPath = process.env.DB_PATH || 'data/monitor.db';
    const storage = new SQLiteStorageService(logger, dbPath);
    await storage.initialize();

    // 初始化 CacheService
    const cache = createCacheService({
      maxMessagesPerUser: Number(process.env.MAX_MESSAGES_PER_USER) || 500,
      maxTotalMemoryMB: Number(process.env.MAX_TOTAL_MEMORY_MB) || 700,
    });

    // 初始化 MonitorService
    const monitorService = new MonitorServiceImpl(storage, cache, logger);
    await monitorService.initialize();

    // 初始化 CommandHandler
    const commandHandler = new CommandHandlerImpl(monitorService, logger);

    // 初始化 EventHandler
    this.eventHandler = new EventHandlerImpl(monitorService, commandHandler, logger);

    // 註冊 Discord 事件
    this._registerHandlers(commandHandler);

    // 連線至 Discord
    logger.info('正在連線至 Discord...');
    await this.client.login(token);
  }

  /**
   * 優雅關閉 Bot
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('正在關閉 Bot...');

    try {
      this.client.destroy();
      logger.info('Bot 已成功關閉');
    } catch (error) {
      logger.error('關閉 Bot 時發生錯誤', error as Error);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 向 Discord Client 註冊事件監聽器
   */
  private _registerHandlers(commandHandler: CommandHandlerImpl): void {
    // Bot 就緒
    this.client.once(Events.ClientReady, (client) => {
      this.eventHandler.onReady(client);

      // 就緒後才註冊斜線指令（此時 client.user 已就緒）
      commandHandler.registerCommands(client).catch((err) => {
        logger.error('斜線指令註冊失敗', err);
      });
    });

    // 訊息建立
    this.client.on(Events.MessageCreate, async (message) => {
      await this.eventHandler.onMessageCreate(message);
    });

    // 訊息更新
    this.client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
      // Discord.js 中 messageUpdate 可能傳入 partial，需確保 full message
      if (!oldMsg.partial && !newMsg.partial) {
        await this.eventHandler.onMessageUpdate(oldMsg, newMsg);
      }
    });

    // 訊息刪除
    this.client.on(Events.MessageDelete, async (message) => {
      await this.eventHandler.onMessageDelete(message);
    });

    // 斜線指令互動
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await this.eventHandler.onInteractionCreate(interaction);
    });

    // Discord Client 錯誤
    this.client.on(Events.Error, (error) => {
      this.eventHandler.onError(error);
    });

    logger.info('Discord 事件監聽器已註冊');
  }
}
