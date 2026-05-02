/**
 * CommandHandler 單元測試 + 屬性測試
 * Tasks: 8.3, 8.4
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import * as fc from 'fast-check';
import { CommandHandlerImpl } from '../src/handlers/command.handler';
import type { MonitorService, Logger } from '../src/types';
import { PermissionFlagsBits } from 'discord.js';

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

/** 建立 mock ChatInputCommandInteraction */
const makeMockInteraction = (overrides: {
  guildId?: string;
  userId?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  subcommand?: string;
  targetUserId?: string;
  targetUserTag?: string;
  hasGuild?: boolean;
  hasMember?: boolean;
  deferred?: boolean;
} = {}) => {
  const {
    guildId = 'guild1',
    userId = 'exec1',
    isOwner = false,
    isAdmin = false,
    subcommand = 'list',
    targetUserId = 'target1',
    targetUserTag = 'target#0001',
    hasGuild = true,
    hasMember = true,
    deferred = false,
  } = overrides;

  const editReply = mock(async (_arg: any) => ({}));
  const reply = mock(async (_arg: any) => ({}));
  const deferReply = mock(async (_arg?: any) => {});

  const interaction = {
    guildId,
    user: { id: userId },
    deferred,
    guild: hasGuild
      ? {
          id: guildId,
          ownerId: isOwner ? userId : 'other-owner',
        }
      : null,
    member: hasMember
      ? {
          permissions: {
            has: (bit: bigint) => isAdmin && bit === PermissionFlagsBits.Administrator,
          },
        }
      : null,
    options: {
      getUser: mock(() => ({ id: targetUserId, tag: targetUserTag })),
      getSubcommand: mock(() => subcommand),
    },
    client: {
      user: { id: 'bot-id' }
    },
    editReply,
    reply,
    deferReply,
  };
  return { interaction: interaction as any, editReply, reply, deferReply };
};

// ==================== Task 8.3: CommandHandler 單元測試 ====================

describe('CommandHandler 單元測試 (8.3)', () => {
  let handler: CommandHandlerImpl;
  let monitorService: MonitorService;
  let logger: Logger;

  beforeEach(() => {
    monitorService = createMockMonitorService();
    logger = createMockLogger();
    handler = new CommandHandlerImpl(monitorService, logger);
  });

  // ---- registerCommands ----

  describe('registerCommands()', () => {
    const originalEnv = { ...process.env };

    test('缺少 DISCORD_TOKEN 時應拋出錯誤', async () => {
      delete process.env.DISCORD_TOKEN;
      delete process.env.DISCORD_CLIENT_ID;
      const client = {} as any;
      await expect(handler.registerCommands(client)).rejects.toThrow('缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID');
      // 恢復環境變數
      process.env = { ...originalEnv };
    });

    test('缺少 DISCORD_CLIENT_ID 時應拋出錯誤', async () => {
      process.env.DISCORD_TOKEN = 'test-token';
      delete process.env.DISCORD_CLIENT_ID;
      const client = {} as any;
      await expect(handler.registerCommands(client)).rejects.toThrow('缺少 DISCORD_TOKEN 或 DISCORD_CLIENT_ID');
      process.env = { ...originalEnv };
    });
  });

  // ---- checkPermissions ----

  describe('checkPermissions()', () => {
    test('沒有 guild 時應返回 false', () => {
      const { interaction } = makeMockInteraction({ hasGuild: false });
      expect(handler.checkPermissions(interaction)).toBe(false);
    });

    test('沒有 member 時應返回 false', () => {
      const { interaction } = makeMockInteraction({ hasMember: false });
      expect(handler.checkPermissions(interaction)).toBe(false);
    });

    test('伺服器擁有者應返回 true', () => {
      const { interaction } = makeMockInteraction({ isOwner: true });
      expect(handler.checkPermissions(interaction)).toBe(true);
    });

    test('具有 Administrator 權限的成員應返回 true', () => {
      const { interaction } = makeMockInteraction({ isAdmin: true });
      expect(handler.checkPermissions(interaction)).toBe(true);
    });

    test('無 Administrator 權限的成員應返回 false', () => {
      const { interaction } = makeMockInteraction({ isAdmin: false, isOwner: false });
      expect(handler.checkPermissions(interaction)).toBe(false);
    });
  });

  // ---- handleAddMonitor ----

  describe('handleAddMonitor()', () => {
    test('無權限時應回覆錯誤訊息', async () => {
      const { interaction, reply } = makeMockInteraction({ isAdmin: false, isOwner: false });
      await handler.handleAddMonitor(interaction);
      expect(reply).toHaveBeenCalled();
      const replyContent = reply.mock.calls[0]![0].content as string;
      expect(replyContent).toContain('❌');
    });

    test('嘗試將機器人本身加入監控清單時應回覆錯誤訊息', async () => {
      const { interaction, reply } = makeMockInteraction({ isAdmin: true, targetUserId: 'bot-id' });
      await handler.handleAddMonitor(interaction);
      expect(reply).toHaveBeenCalled();
      const replyContent = reply.mock.calls[0]![0].content as string;
      expect(replyContent).toContain('❌');
      expect(replyContent).toContain('無法將機器人本身加入監控清單');
    });

    test('有權限且成功時應回覆成功訊息', async () => {
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleAddMonitor(interaction);
      expect(editReply).toHaveBeenCalled();
      expect(String(editReply.mock.calls[0]![0])).toContain('✅');
    });

    test('有權限但 service 返回失敗時應回覆失敗訊息', async () => {
      (monitorService.addMonitoredUser as ReturnType<typeof mock>).mockResolvedValue({
        success: false, error: '用戶已在監控清單中',
      });
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleAddMonitor(interaction);
      expect(String(editReply.mock.calls[0]![0])).toContain('❌');
    });

    test('應呼叫 monitorService.addMonitoredUser', async () => {
      const { interaction } = makeMockInteraction({ isAdmin: true, targetUserId: 'u1' });
      await handler.handleAddMonitor(interaction);
      expect(monitorService.addMonitoredUser).toHaveBeenCalledWith('u1', 'guild1');
    });
  });

  // ---- handleRemoveMonitor ----

  describe('handleRemoveMonitor()', () => {
    test('無權限時應回覆錯誤訊息', async () => {
      const { interaction, reply } = makeMockInteraction({ isAdmin: false, isOwner: false });
      await handler.handleRemoveMonitor(interaction);
      expect(reply).toHaveBeenCalled();
    });

    test('有權限且成功時應回覆成功訊息', async () => {
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleRemoveMonitor(interaction);
      expect(String(editReply.mock.calls[0]![0])).toContain('✅');
    });

    test('service 返回失敗時應回覆失敗訊息', async () => {
      (monitorService.removeMonitoredUser as ReturnType<typeof mock>).mockResolvedValue({
        success: false, error: '用戶不在監控清單中',
      });
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleRemoveMonitor(interaction);
      expect(String(editReply.mock.calls[0]![0])).toContain('❌');
    });
  });

  // ---- handleListMonitors ----

  describe('handleListMonitors()', () => {
    test('無監控用戶時應回覆空清單訊息', async () => {
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleListMonitors(interaction);
      expect(String(editReply.mock.calls[0]![0])).toContain('沒有');
    });

    test('有監控用戶時應列出所有用戶', async () => {
      (monitorService.getMonitoredUsers as ReturnType<typeof mock>).mockResolvedValue(['u1', 'u2']);
      const { interaction, editReply } = makeMockInteraction({ isAdmin: true });
      await handler.handleListMonitors(interaction);
      const reply = String(editReply.mock.calls[0]![0]);
      expect(reply).toContain('u1');
      expect(reply).toContain('u2');
    });

    test('無權限時應回覆錯誤訊息', async () => {
      const { interaction, reply } = makeMockInteraction({ isAdmin: false, isOwner: false });
      await handler.handleListMonitors(interaction);
      expect(reply).toHaveBeenCalled();
    });
  });
});

// ==================== Task 8.4: 屬性 11 — 權限控制 ====================

describe('[屬性測試 8.4] 屬性 11：無 Admin 權限的任意用戶不應通過 checkPermissions', () => {
  test('非 owner 且非 admin 的任意用戶返回 false', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // userId
        fc.string({ minLength: 1 }), // guildId
        fc.string({ minLength: 1 }), // ownerId（不等於 userId）
        (userId, guildId, ownerSuffix) => {
          const handler = new CommandHandlerImpl(createMockMonitorService(), createMockLogger());
          const ownerId = userId + '_' + ownerSuffix; // 確保不同
          const interaction = {
            guild: { id: guildId, ownerId },
            user: { id: userId },
            member: {
              permissions: { has: () => false }, // 無 Admin
            },
          } as any;
          return handler.checkPermissions(interaction) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Owner 的任意 userId 都應通過', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId, guildId) => {
          const handler = new CommandHandlerImpl(createMockMonitorService(), createMockLogger());
          const interaction = {
            guild: { id: guildId, ownerId: userId }, // userId === ownerId
            user: { id: userId },
            member: {
              permissions: { has: () => false },
            },
          } as any;
          return handler.checkPermissions(interaction) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
