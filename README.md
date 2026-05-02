# Discord 訊息監控系統

Discord bot 用於監控特定用戶在伺服器內所有頻道的訊息活動，並在訊息被刪除時自動恢復。

## 功能特色

- 🔍 監控特定用戶的所有訊息
- 🔄 自動恢復被刪除的訊息
- 💾 訊息快取（保留 7 天）
- 🔐 權限控制（僅管理員可操作）
- 📊 記憶體優化與監控
- 📝 完整的日誌記錄

## 技術棧

- **執行環境**: Bun v1.0+
- **Discord 函式庫**: Discord.js v14
- **資料儲存**: SQLite (Bun 內建)
- **日誌管理**: Winston
- **程式語言**: TypeScript

## 安裝

```bash
# 安裝依賴
bun install

# 複製環境變數範本
cp .env.example .env

# 編輯 .env 並填入你的 Discord bot token
```

## 配置

編輯 `.env` 檔案：

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
```

## 使用

```bash
# 啟動 bot
bun start

# 開發模式（自動重載）
bun dev

# 執行測試
bun test
```

## Discord 指令

- `/monitor add <user>` - 新增被監控用戶
- `/monitor remove <user>` - 移除被監控用戶
- `/monitor list` - 列出所有被監控用戶

## 專案結構

```
.
├── src/
│   ├── services/       # 核心服務
│   ├── handlers/       # 事件與指令處理器
│   ├── types/          # TypeScript 型別定義
│   ├── utils/          # 工具函數
│   └── index.ts        # 主程式入口
├── tests/              # 測試檔案
├── data/               # SQLite 資料庫
├── logs/               # 日誌檔案
└── .env                # 環境變數
```

## 開發

本專案使用 Bun 作為執行環境，提供更快的啟動速度和執行效能。

```bash
# 執行測試（含覆蓋率）
bun test:coverage

# 監看模式
bun test:watch
```

## 授權

MIT
