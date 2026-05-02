/**
 * Event Handler - Discord 事件處理器
 *
 * 負責訂閱並處理 Discord 事件，然後分派至 MonitorService：
 * - ready：Bot 連線成功
 * - messageCreate：新訊息建立
 * - messageUpdate：訊息更新
 * - messageDelete：訊息刪除
 * - error：Discord Client 錯誤
 */

import type { Client, Message, PartialMessage } from 'discord.js';
import type { EventHandler, MonitorService, CommandHandler, Logger } from '../types/index.js';

export class EventHandlerImpl implements EventHandler {
  constructor(
    private readonly monitorService: MonitorService,
    private readonly commandHandler: CommandHandler,
    private readonly logger: Logger
  ) {}

  // ==================== 事件處理方法 ====================

  /**
   * Bot 就緒事件：連線 Discord 後觸發
   */
  onReady(client: Client): void {
    this.logger.info(`✅ Bot 已上線，登入身份：${client.user?.tag}`, {
      userId: client.user?.id,
      guilds: client.guilds.cache.size,
    });
  }

  /**
   * 訊息建立事件：分派至 MonitorService
   */
  async onMessageCreate(message: Message): Promise<void> {
    // 忽略機器人訊息
    if (message.author.bot) return;
    // 忽略私訊
    if (!message.guild) return;

    try {
      await this.monitorService.handleMessageCreate(message);
    } catch (error) {
      this.logger.error('處理訊息建立事件失敗', error as Error, {
        messageId: message.id,
        guildId: message.guild?.id,
      });
    }
  }

  /**
   * 訊息更新事件
   */
  async onMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void> {
    // 忽略機器人或私訊
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;
    // 如果內容沒有變化，忽略
    if (oldMessage.content === newMessage.content) return;

    try {
      await this.monitorService.handleMessageUpdate(oldMessage, newMessage);
    } catch (error) {
      this.logger.error('處理訊息更新事件失敗', error as Error, {
        messageId: newMessage.id,
        guildId: newMessage.guild?.id,
      });
    }
  }

  /**
   * 訊息刪除事件
   */
  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild) return;

    try {
      await this.monitorService.handleMessageDelete(message);
    } catch (error) {
      this.logger.error('處理訊息刪除事件失敗', error as Error, {
        messageId: message.id,
        guildId: message.guild?.id,
      });
    }
  }

  /**
   * Discord Client 錯誤事件
   */
  onError(error: Error): void {
    this.logger.error('Discord Client 發生錯誤', error);
  }

  // ==================== 指令互動事件 ====================

  /**
   * 處理斜線指令互動（interactionCreate）
   */
  async onInteractionCreate(interaction: import('discord.js').Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'monitor') return;

    const subcommand = interaction.options.getSubcommand();

    this.logger.debug('收到斜線指令', {
      command: `monitor ${subcommand}`,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    switch (subcommand) {
      case 'add':
        await this.commandHandler.handleAddMonitor(interaction);
        break;
      case 'remove':
        await this.commandHandler.handleRemoveMonitor(interaction);
        break;
      case 'list':
        await this.commandHandler.handleListMonitors(interaction);
        break;
      default:
        this.logger.warn('未知的子指令', { subcommand });
    }
  }
}
