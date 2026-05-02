/**
 * EventHandler 單元測試
 * Task: 9.2
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { EventHandlerImpl } from '../src/handlers/event.handler';
import type { MonitorService, CommandHandler, Logger } from '../src/types';

// ==================== Mock 工廠 ====================

const createMockLogger = (): Logger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

const createMockMonitorService = (): MonitorService => ({
  addMonitoredUser: mock(async () => ({ success: true as const, data: undefined })),
  removeMonitoredUser: mock(async () => ({ success: true as const, data: undefined })),
  getMonitoredUsers: mock(async () => []),
  isUserMonitored: mock(() => false),
  handleMessageCreate: mock(async () => {}),
  handleMessageUpdate: mock(async () => {}),
  handleMessageDelete: mock(async () => {}),
  initialize: mock(async () => {}),
});

const createMockCommandHandler = (): CommandHandler => ({
  registerCommands: mock(async () => {}),
  handleAddMonitor: mock(async () => {}),
  handleRemoveMonitor: mock(async () => {}),
  handleListMonitors: mock(async () => {}),
  checkPermissions: mock(() => true),
});

const makeMessage = (overrides: {
  id?: string; content?: string; authorId?: string; guildId?: string;
  isBot?: boolean; hasGuild?: boolean;
} = {}) => ({
  id: overrides.id ?? 'msg1',
  content: overrides.content ?? 'hello',
  channelId: 'ch1',
  createdTimestamp: Date.now(),
  author: { id: overrides.authorId ?? 'user1', bot: overrides.isBot ?? false },
  guild: overrides.hasGuild === false ? null : { id: overrides.guildId ?? 'guild1' },
  attachments: { values: () => [] },
  embeds: [],
} as any);

// ==================== Task 9.2: EventHandler 單元測試 ====================

describe('EventHandler 單元測試 (9.2)', () => {
  let handler: EventHandlerImpl;
  let monitorService: MonitorService;
  let commandHandler: CommandHandler;
  let logger: Logger;

  beforeEach(() => {
    monitorService = createMockMonitorService();
    commandHandler = createMockCommandHandler();
    logger = createMockLogger();
    handler = new EventHandlerImpl(monitorService, commandHandler, logger);
  });

  // ---- onReady ----

  describe('onReady()', () => {
    test('應記錄 Bot 上線訊息', () => {
      const client = {
        user: { tag: 'TestBot#0001', id: 'bot1' },
        guilds: { cache: { size: 3 } },
      } as any;
      handler.onReady(client);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  // ---- onMessageCreate ----

  describe('onMessageCreate()', () => {
    test('應分派至 monitorService.handleMessageCreate', async () => {
      const msg = makeMessage();
      await handler.onMessageCreate(msg);
      expect(monitorService.handleMessageCreate).toHaveBeenCalledWith(msg);
    });

    test('機器人訊息應被忽略', async () => {
      const msg = makeMessage({ isBot: true });
      await handler.onMessageCreate(msg);
      expect(monitorService.handleMessageCreate).not.toHaveBeenCalled();
    });

    test('私訊（無 guild）應被忽略', async () => {
      const msg = makeMessage({ hasGuild: false });
      await handler.onMessageCreate(msg);
      expect(monitorService.handleMessageCreate).not.toHaveBeenCalled();
    });

    test('monitorService 拋錯時應記錄 error 而非向上拋出', async () => {
      (monitorService.handleMessageCreate as ReturnType<typeof mock>).mockRejectedValue(
        new Error('Unexpected error')
      );
      const msg = makeMessage();
      await expect(handler.onMessageCreate(msg)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---- onMessageUpdate ----

  describe('onMessageUpdate()', () => {
    test('內容有變化時應分派至 monitorService.handleMessageUpdate', async () => {
      const old = makeMessage({ content: 'old' });
      const nw = makeMessage({ content: 'new' });
      await handler.onMessageUpdate(old, nw);
      expect(monitorService.handleMessageUpdate).toHaveBeenCalledWith(old, nw);
    });

    test('內容相同時不應分派', async () => {
      const msg = makeMessage({ content: 'same' });
      await handler.onMessageUpdate(msg, msg);
      expect(monitorService.handleMessageUpdate).not.toHaveBeenCalled();
    });

    test('機器人訊息更新應被忽略', async () => {
      const old = makeMessage({ isBot: true, content: 'old' });
      const nw = makeMessage({ isBot: true, content: 'new' });
      await handler.onMessageUpdate(old, nw);
      expect(monitorService.handleMessageUpdate).not.toHaveBeenCalled();
    });

    test('私訊更新應被忽略', async () => {
      const old = makeMessage({ hasGuild: false, content: 'old' });
      const nw = makeMessage({ hasGuild: false, content: 'new' });
      await handler.onMessageUpdate(old, nw);
      expect(monitorService.handleMessageUpdate).not.toHaveBeenCalled();
    });

    test('monitorService 拋錯時應記錄 error 而非向上拋出', async () => {
      (monitorService.handleMessageUpdate as ReturnType<typeof mock>).mockRejectedValue(
        new Error('err')
      );
      await expect(
        handler.onMessageUpdate(makeMessage({ content: 'old' }), makeMessage({ content: 'new' }))
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---- onMessageDelete ----

  describe('onMessageDelete()', () => {
    test('應分派至 monitorService.handleMessageDelete', async () => {
      const msg = makeMessage();
      await handler.onMessageDelete(msg);
      expect(monitorService.handleMessageDelete).toHaveBeenCalledWith(msg);
    });

    test('私訊刪除應被忽略', async () => {
      const msg = makeMessage({ hasGuild: false });
      await handler.onMessageDelete(msg);
      expect(monitorService.handleMessageDelete).not.toHaveBeenCalled();
    });

    test('monitorService 拋錯時應記錄 error 而非向上拋出', async () => {
      (monitorService.handleMessageDelete as ReturnType<typeof mock>).mockRejectedValue(
        new Error('err')
      );
      await expect(handler.onMessageDelete(makeMessage())).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---- onError ----

  describe('onError()', () => {
    test('應記錄錯誤', () => {
      handler.onError(new Error('Discord client error'));
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ---- onInteractionCreate ----

  describe('onInteractionCreate()', () => {
    const makeInteraction = (subcommand: string, isChatInput = true) => ({
      isChatInputCommand: () => isChatInput,
      commandName: 'monitor',
      user: { id: 'user1' },
      guildId: 'guild1',
      options: { getSubcommand: () => subcommand },
    } as any);

    test('add 子指令應分派至 commandHandler.handleAddMonitor', async () => {
      await handler.onInteractionCreate(makeInteraction('add'));
      expect(commandHandler.handleAddMonitor).toHaveBeenCalled();
    });

    test('remove 子指令應分派至 commandHandler.handleRemoveMonitor', async () => {
      await handler.onInteractionCreate(makeInteraction('remove'));
      expect(commandHandler.handleRemoveMonitor).toHaveBeenCalled();
    });

    test('list 子指令應分派至 commandHandler.handleListMonitors', async () => {
      await handler.onInteractionCreate(makeInteraction('list'));
      expect(commandHandler.handleListMonitors).toHaveBeenCalled();
    });

    test('非 ChatInputCommand 應被忽略', async () => {
      await handler.onInteractionCreate(makeInteraction('add', false));
      expect(commandHandler.handleAddMonitor).not.toHaveBeenCalled();
    });

    test('未知子指令應記錄 warn', async () => {
      await handler.onInteractionCreate(makeInteraction('unknown'));
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
