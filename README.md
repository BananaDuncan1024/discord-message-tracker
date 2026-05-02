# Discord 訊息監控系統

> 🤖 Discord bot，用於監控特定用戶的訊息活動，並在訊息被刪除時自動恢復並通知。

## 功能特色

| 功能 | 說明 |
|------|------|
| 🔍 **訊息監控** | 監控指定用戶在伺服器內所有頻道的訊息 |
| 🔄 **訊息恢復** | 偵測被刪除的訊息，自動在原頻道發送恢復通知 |
| 💾 **智慧快取** | 保留 7 天訊息快取，支援 LRU 淘汰策略 |
| 🔐 **權限控制** | 斜線指令僅限管理員操作 |
| 📊 **記憶體監控** | 自動監控記憶體使用量，超過閾值時主動清理 |
| 📝 **完整日誌** | Winston 日誌輪替（10MB 上限，保留 5 個檔案） |
| 🔁 **自動重試** | Discord API 錯誤時使用指數退避重試 |
| 🗄️ **持久化儲存** | SQLite 確保重啟後監控設定不遺失 |

## 技術棧

- **執行環境**: Bun v1.0+
- **Discord 函式庫**: Discord.js v14
- **資料儲存**: SQLite（使用 Bun 內建的 `bun:sqlite`）
- **日誌管理**: Winston
- **程式語言**: TypeScript
- **測試框架**: Bun 內建測試執行器

## 快速開始

### 1. 安裝依賴

```bash
bun install
```

### 2. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，至少填入：

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
```

### 3. 在 Discord Developer Portal 設定

1. 至 [Discord Developer Portal](https://discord.com/developers/applications) 建立應用程式
2. 於 **Bot** 頁籤啟用以下 **Privileged Gateway Intents**：
   - `MESSAGE CONTENT INTENT`
   - `SERVER MEMBERS INTENT`
3. 複製 Bot Token 填入 `.env`

### 4. 啟動 Bot

```bash
# 開發模式（推薦）
bun dev

# 正式模式
bun start
```

## Discord 斜線指令

> ⚠️ 所有指令均需要 **管理員** 權限

| 指令 | 說明 |
|------|------|
| `/monitor add <@user>` | 新增要監控的用戶 |
| `/monitor remove <@user>` | 停止監控指定用戶 |
| `/monitor list` | 列出目前所有監控中的用戶 |

## 環境變數說明

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `DISCORD_TOKEN` | Discord Bot Token（必填） | — |
| `DISCORD_CLIENT_ID` | Discord 應用程式 ID（必填） | — |
| `DB_PATH` | SQLite 資料庫路徑 | `data/monitor.db` |
| `MAX_MESSAGES_PER_USER` | 每用戶最大快取訊息數 | `500` |
| `MAX_TOTAL_MEMORY_MB` | 最大記憶體使用量（MB） | `700` |
| `LOG_LEVEL` | 日誌等級（debug/info/warn/error） | `info` |

## 專案結構

```
.
├── src/
│   ├── services/
│   │   ├── logger.service.ts       # Winston 日誌服務
│   │   ├── storage.service.ts      # SQLite 持久化服務
│   │   ├── cache.service.ts        # 訊息快取服務（含 LRU）
│   │   ├── memory-monitor.service.ts # 記憶體監控服務
│   │   ├── monitor.service.ts      # 核心業務邏輯（監控、快取、恢復）
│   │   └── index.ts
│   ├── handlers/
│   │   ├── command.handler.ts      # 斜線指令處理器
│   │   ├── event.handler.ts        # Discord 事件處理器
│   │   └── index.ts
│   ├── utils/
│   │   └── error-handler.ts        # Discord API 錯誤處理（含重試）
│   ├── types/
│   │   └── index.ts                # 所有 TypeScript 型別定義
│   ├── bot.ts                      # DiscordBot 組裝類別
│   └── index.ts                    # 主程式入口
├── tests/
│   ├── storage.service.test.ts     # StorageService 單元測試（21 cases）
│   ├── cache.service.test.ts       # CacheService 單元測試（46 cases）
│   └── logger.service.test.ts      # Logger 單元測試
├── data/                           # SQLite 資料庫（自動建立）
├── logs/                           # 日誌檔案（自動建立）
├── .env.example                    # 環境變數範本
└── tsconfig.json
```

## 授權

MIT

