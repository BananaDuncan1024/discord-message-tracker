# 開發文件

## 架構說明

本系統採用**分層架構（Layered Architecture）**，各層職責清晰分離：

```
Discord Events
      │
      ▼
┌─────────────────┐
│  EventHandler   │  ← 接收 Discord 事件，過濾並分派
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ MonitorService  │ ←── │  CommandHandler  │  ← 斜線指令處理
└────────┬────────┘     └──────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌──────┐  ┌──────┐
│Cache │  │Store │  ← 雙層持久化（記憶體快取 + SQLite）
└──────┘  └──────┘
```

### 各層說明

| 層級 | 元件 | 職責 |
|------|------|------|
| **事件層** | `EventHandler` | 訂閱 Discord 原始事件，過濾機器人訊息，分派至業務層 |
| **指令層** | `CommandHandler` | 解析斜線指令，驗證權限，回應 Discord Interaction |
| **業務層** | `MonitorService` | 核心邏輯：用戶管理、訊息快取、刪除偵測與恢復通知 |
| **快取層** | `CacheService` | 雙層 Map 結構，O(1) 查詢，支援 LRU 淘汰與自動過期 |
| **儲存層** | `StorageService` | SQLite 持久化，確保 Bot 重啟後監控設定不遺失 |
| **基礎設施** | `Logger`, `MemoryMonitor`, `ErrorHandler` | 跨層服務 |

### 訊息刪除偵測流程

```
1. Discord 觸發 messageDelete 事件
2. EventHandler.onMessageDelete() 接收事件
3. MonitorService.handleMessageDelete() 檢查此 guild 有無監控用戶
4. 遍歷監控用戶快取尋找被刪除的訊息 ID
5. 找到 → 格式化恢復訊息 → 使用 withRetry 發送至原頻道
6. 未找到 → 記錄 cache miss 日誌（訊息可能已過期或 bot 重啟前產生）
```

## 開發環境設定

### 先決條件

- [Bun](https://bun.sh/) v1.0+（安裝：`curl -fsSL https://bun.sh/install | bash`）
- Node.js 18+（部分工具依賴）

### 初始化

```bash
# clone 專案
git clone <repo-url>
cd dis_bot_apple

# 安裝依賴
bun install

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 DISCORD_TOKEN 和 DISCORD_CLIENT_ID
```

### 開發指令

```bash
# 啟動開發模式（Bun 監看檔案變動）
bun dev

# 執行所有測試
bun test

# 執行單一測試檔案
bun test tests/storage.service.test.ts

# 監看模式執行測試
bun test --watch

# TypeScript 型別檢查
bun run tsc --noEmit
```

## 測試執行指南

### 測試結構

```
tests/
├── storage.service.test.ts   # 21 個測試：CRUD、持久化、錯誤處理
├── cache.service.test.ts     # 46 個測試：快取操作、LRU、過期清理
└── logger.service.test.ts    # 2 個測試：Logger 介面驗證
```

### 測試原則

- **隔離性**：每個測試使用獨立的臨時資料庫（`mkdtempSync`），避免互相影響
- **冪等性**：測試可重複執行，結果一致
- **明確性**：測試名稱清楚描述預期行為（given/when/then）

### 覆蓋率目標

| 指標 | 目標 |
|------|------|
| 語句覆蓋率 | > 80% |
| 分支覆蓋率 | > 75% |
| 函數覆蓋率 | > 85% |

## 關鍵設計決策

### 為什麼用雙層儲存？

- **快取層（記憶體）**：O(1) 查詢速度，訊息刪除事件需要即時響應（< 1ms）
- **持久化層（SQLite）**：Bot 重啟後恢復監控清單，不需要重新設定

### 為什麼監控用戶索引放在記憶體？

`monitoredUsers: Map<guildId, Set<userId>>` 的記憶體索引讓 `isUserMonitored()` 達到 O(1)，每則訊息都會呼叫此方法，高頻操作需要零延遲。

### 訊息刪除的 Partial Message 問題

Discord 刪除事件可能是 `PartialMessage`（當訊息不在 Discord 內部快取時），此時無法直接獲知作者 ID。解決方案：遍歷所有監控用戶的快取尋找 `messageId`，這樣即使 Discord 不提供作者資訊，我們依然能恢復訊息。

### 通知發送的重試機制

使用指數退避（Exponential Backoff + Jitter）避免雷群效應（Thundering Herd）：
- 基礎延遲：1 秒
- 最大延遲：30 秒
- 最大重試次數：3 次
- Jitter 範圍：±25%

## 貢獻指南

1. Fork 並建立功能分支：`git checkout -b feat/your-feature`
2. 撰寫或更新測試
3. 確保所有測試通過：`bun test`
4. 確保型別檢查通過：`bun run tsc --noEmit`
5. 提交 PR，附上清楚的描述
