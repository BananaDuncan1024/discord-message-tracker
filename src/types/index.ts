/**
 * 基礎型別定義
 */

import type { Message, PartialMessage, CommandInteraction, Client } from 'discord.js';

// ==================== 快取相關型別 ====================

/**
 * 附件資料
 */
export interface AttachmentData {
  url: string;
  name: string;
  contentType?: string;
}

/**
 * 嵌入內容資料
 */
export interface EmbedData {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

/**
 * 快取的訊息
 */
export interface CachedMessage {
  messageId: string;
  channelId: string;
  guildId: string;
  authorId: string;
  content: string;
  attachments: AttachmentData[];
  embeds: EmbedData[];
  timestamp: number;
  expiresAt: number;
}

/**
 * 優化的快取訊息（記憶體優化版本）
 */
export interface OptimizedCachedMessage {
  messageId: string;
  channelId: string;
  authorId: string;
  content: string;
  timestamp: number;
  expiresAt: number;
  attachmentUrls?: string[];
  embedData?: string;
}

// ==================== 儲存相關型別 ====================

/**
 * 監控用戶資料
 */
export interface MonitoredUser {
  id: number;
  guildId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

// ==================== 配置相關型別 ====================

/**
 * 快取配置
 */
export interface CacheConfiguration {
  maxMessagesPerUser: number;
  messageRetentionDays: number;
  maxTotalMemoryMB: number;
  memoryWarningThreshold: number;
  memoryEmergencyThreshold: number;
  cleanupIntervalMs: number;
  memoryCheckIntervalMs: number;
  useOptimizedCache: boolean;
  enableAggressiveCleanup: boolean;
}

/**
 * 記憶體使用統計
 */
export interface MemoryUsageStats {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  cachedMessages: number;
  monitoredUsers: number;
  averageMessagesPerUser: number;
  estimatedCacheSizeMB: number;
}

// ==================== 結果型別 ====================

/**
 * 操作結果（成功）
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * 操作結果（失敗）
 */
export interface Failure {
  success: false;
  error: string;
  details?: unknown;
}

/**
 * 操作結果聯合型別
 */
export type Result<T> = Success<T> | Failure;

// ==================== 服務介面 ====================

/**
 * Cache Service 介面
 */
export interface CacheService {
  // 用戶快取管理
  createUserCache(userId: string): void;
  deleteUserCache(userId: string): void;
  hasUserCache(userId: string): boolean;

  // 訊息操作
  set(userId: string, messageId: string, message: CachedMessage): void;
  get(userId: string, messageId: string): CachedMessage | null;
  update(userId: string, messageId: string, message: Partial<CachedMessage>): boolean;
  delete(userId: string, messageId: string): boolean;

  // 清理操作
  cleanup(): void;
  cleanupUser(userId: string): void;

  // 統計資訊
  size(): number;
  userSize(userId: string): number;
  userCount(): number;

  // 記憶體管理
  getMemoryUsage(): MemoryUsageStats;
  reduceUserCache(userId: string, targetSize: number): number;
  removeOldestMessages(userId: string, count: number): number;
  getAllUserIds(): string[];
  setConfig(config: Partial<CacheConfiguration>): void;
  getConfig(): CacheConfiguration;
}

/**
 * Storage Service 介面
 */
export interface StorageService {
  initialize(): Promise<void>;
  addMonitoredUser(guildId: string, userId: string): Promise<void>;
  removeMonitoredUser(guildId: string, userId: string): Promise<void>;
  getMonitoredUsers(guildId: string): Promise<string[]>;
  getAllMonitoredUsers(): Promise<MonitoredUser[]>;
  isUserMonitored(guildId: string, userId: string): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Monitor Service 介面
 */
export interface MonitorService {
  // 用戶管理
  addMonitoredUser(userId: string, guildId: string): Promise<Result<void>>;
  removeMonitoredUser(userId: string, guildId: string): Promise<Result<void>>;
  getMonitoredUsers(guildId: string): Promise<string[]>;
  isUserMonitored(userId: string, guildId: string): boolean;

  // 訊息處理
  handleMessageCreate(message: Message): Promise<void>;
  handleMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void>;
  handleMessageDelete(message: Message | PartialMessage): Promise<void>;

  // 初始化
  initialize(): Promise<void>;
}

/**
 * Logger 介面
 */
export interface Logger {
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, error?: Error, meta?: object): void;
  debug(message: string, meta?: object): void;
}

/**
 * Command Handler 介面
 */
export interface CommandHandler {
  registerCommands(client: Client): Promise<void>;
  handleAddMonitor(interaction: CommandInteraction): Promise<void>;
  handleRemoveMonitor(interaction: CommandInteraction): Promise<void>;
  handleListMonitors(interaction: CommandInteraction): Promise<void>;
  checkPermissions(interaction: CommandInteraction): boolean;
}

/**
 * Event Handler 介面
 */
export interface EventHandler {
  onReady(client: Client): void;
  onMessageCreate(message: Message): Promise<void>;
  onMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void>;
  onMessageDelete(message: Message | PartialMessage): Promise<void>;
  onError(error: Error): void;
}

// ==================== 錯誤型別 ====================

/**
 * 自定義錯誤類別
 */
export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'BotError';
  }
}

/**
 * 錯誤代碼
 */
export enum ErrorCode {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_MONITORED = 'USER_ALREADY_MONITORED',
  USER_NOT_MONITORED = 'USER_NOT_MONITORED',
  CACHE_MISS = 'CACHE_MISS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DISCORD_API_ERROR = 'DISCORD_API_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  MONITOR_LIMIT_EXCEEDED = 'MONITOR_LIMIT_EXCEEDED',
}
