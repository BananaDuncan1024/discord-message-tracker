/**
 * Command Handler - 斜線指令處理器
 *
 * 負責：
 * 1. 定義並註冊 Discord 斜線指令（/monitor add, remove, list）
 * 2. 驗證使用者是否具有管理員權限
 * 3. 分派指令至 MonitorService 執行業務邏輯
 * 4. 以統一格式回應指令結果
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type Client,
  type CommandInteraction,
  type ChatInputCommandInteraction,
  REST,
  Routes,
  GuildMember,
} from 'discord.js';
import type { CommandHandler, MonitorService, Logger } from '../types/index.js';

export class CommandHandlerImpl implements CommandHandler {
  /** 斜線指令定義 */
  private readonly commands = [
    new SlashCommandBuilder()
      .setName('monitor')
      .setDescription('管理 Discord 訊息監控')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('新增監控用戶')
          .addUserOption((opt) =>
            opt.setName('user').setDescription('要監控的用戶').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('移除監控用戶')
          .addUserOption((opt) =>
            opt.setName('user').setDescription('要取消監控的用戶').setRequired(true)
          )
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('列出所有監控中的用戶'))
      .toJSON(),
  ];

  constructor(
    private readonly monitorService: MonitorService,
    private readonly logger: Logger
  ) {}

  // ==================== 指令註冊 ====================

  /**
   * 向 Discord 註冊斜線指令
   */
  async registerCommands(client: Client): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
      throw new Error('缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID 環境變數');
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
      this.logger.info('正在向 Discord 註冊斜線指令...');
      await rest.put(Routes.applicationCommands(clientId), { body: this.commands });
      this.logger.info('斜線指令註冊成功', { count: this.commands.length });
    } catch (error) {
      this.logger.error('斜線指令註冊失敗', error as Error);
      throw error;
    }
  }

  // ==================== 指令分派 ====================

  /**
   * 處理新增監控指令：/monitor add @user
   */
  async handleAddMonitor(interaction: CommandInteraction): Promise<void> {
    const cmd = interaction as ChatInputCommandInteraction;

    if (!this.checkPermissions(interaction)) {
      await this._replyError(cmd, '❌ 你沒有執行此指令的權限（需要管理員權限）。');
      return;
    }

    const targetUser = cmd.options.getUser('user', true);
    
    if (targetUser.id === interaction.client.user?.id) {
      await this._replyError(cmd, '❌ 無法將機器人本身加入監控清單。');
      return;
    }

    const guildId = cmd.guildId!;

    await cmd.deferReply({ ephemeral: true });

    const result = await this.monitorService.addMonitoredUser(targetUser.id, guildId);

    if (result.success) {
      await cmd.editReply(`✅ 已開始監控用戶 <@${targetUser.id}> (\`${targetUser.tag}\`)`);
      this.logger.info('指令：新增監控成功', {
        userId: targetUser.id,
        guildId,
        executorId: cmd.user.id,
      });
    } else {
      await cmd.editReply(`❌ 新增監控失敗：${result.error}`);
    }
  }

  /**
   * 處理移除監控指令：/monitor remove @user
   */
  async handleRemoveMonitor(interaction: CommandInteraction): Promise<void> {
    const cmd = interaction as ChatInputCommandInteraction;

    if (!this.checkPermissions(interaction)) {
      await this._replyError(cmd, '❌ 你沒有執行此指令的權限（需要管理員權限）。');
      return;
    }

    const targetUser = cmd.options.getUser('user', true);
    const guildId = cmd.guildId!;

    await cmd.deferReply({ ephemeral: true });

    const result = await this.monitorService.removeMonitoredUser(targetUser.id, guildId);

    if (result.success) {
      await cmd.editReply(`✅ 已停止監控用戶 <@${targetUser.id}> (\`${targetUser.tag}\`)`);
      this.logger.info('指令：移除監控成功', {
        userId: targetUser.id,
        guildId,
        executorId: cmd.user.id,
      });
    } else {
      await cmd.editReply(`❌ 移除監控失敗：${result.error}`);
    }
  }

  /**
   * 處理列出監控指令：/monitor list
   */
  async handleListMonitors(interaction: CommandInteraction): Promise<void> {
    const cmd = interaction as ChatInputCommandInteraction;

    if (!this.checkPermissions(interaction)) {
      await this._replyError(cmd, '❌ 你沒有執行此指令的權限（需要管理員權限）。');
      return;
    }

    const guildId = cmd.guildId!;

    await cmd.deferReply({ ephemeral: true });

    const users = await this.monitorService.getMonitoredUsers(guildId);

    if (users.length === 0) {
      await cmd.editReply('📋 目前沒有任何監控中的用戶。');
      return;
    }

    const userList = users.map((id, index) => `${index + 1}. <@${id}> (\`${id}\`)`).join('\n');
    await cmd.editReply(`📋 **監控中的用戶列表（共 ${users.length} 位）：**\n${userList}`);
  }

  // ==================== 權限驗證 ====================

  /**
   * 驗證執行者是否具有管理員權限
   */
  checkPermissions(interaction: CommandInteraction): boolean {
    if (!interaction.guild) {
      return false;
    }

    const member = interaction.member as GuildMember | null;
    if (!member) {
      return false;
    }

    // 伺服器擁有者永遠有權限
    if (interaction.guild.ownerId === interaction.user.id) {
      return true;
    }

    // 檢查管理員權限位元
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }

  // ==================== 私有輔助方法 ====================

  private async _replyError(
    interaction: ChatInputCommandInteraction,
    message: string
  ): Promise<void> {
    if (interaction.deferred) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
}
