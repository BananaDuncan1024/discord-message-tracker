/**
 * Discord 訊息監控系統 - 主程式入口
 *
 * 負責：
 * 1. 載入環境變數（.env）
 * 2. 初始化並啟動 Discord Bot
 * 3. 實作全域錯誤處理（unhandledRejection, uncaughtException）
 * 4. 實作優雅關閉（SIGINT, SIGTERM）
 */

import { logger } from './services/logger.service.js';
import { DiscordBot } from './bot.js';

// 載入環境變數
// Bun 會自動載入 .env，不需要額外的 dotenv 套件

const bot = new DiscordBot();

// ==================== 全域錯誤處理 ====================

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未處理的 Promise 拒絕', reason as Error, {
    promise: String(promise),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('未捕捉的例外', error);
  // 對於未捕捉的例外，安全關閉後退出
  bot.stop().finally(() => process.exit(1));
});

// ==================== 優雅關閉 ====================

const shutdown = async (signal: string) => {
  logger.info(`收到 ${signal} 訊號，正在優雅關閉...`);
  await bot.stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ==================== 啟動 ====================

logger.info('Discord 訊息監控系統啟動中...');

bot.start().catch((error) => {
  logger.error('Bot 啟動失敗', error);
  process.exit(1);
});

