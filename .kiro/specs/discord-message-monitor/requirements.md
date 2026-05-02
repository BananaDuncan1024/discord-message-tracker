# 需求文件

## 簡介

Discord 訊息監控系統是一個 Discord bot，用於監控特定用戶在伺服器內所有頻道的訊息活動。當被監控的用戶刪除訊息時，系統會自動重新發送被刪除的內容，確保訊息記錄的完整性。

## 術語表

- **Bot**: Discord 訊息監控系統
- **Monitored_User**: 被設定為監控對象的 Discord 用戶
- **Message_Cache**: Bot 用於儲存訊息內容的暫存機制
- **Guild**: Discord 伺服器
- **Channel**: Discord 頻道（包含文字頻道、公告頻道等）
- **Administrator**: 具有管理權限的 Discord 用戶

## 需求

### 需求 1：監控用戶設定

**使用者故事：** 作為管理員，我想要設定需要監控的用戶，以便追蹤特定用戶的訊息活動。

#### 驗收標準

1. THE Bot SHALL 提供指令讓 Administrator 新增 Monitored_User
2. THE Bot SHALL 提供指令讓 Administrator 移除 Monitored_User
3. THE Bot SHALL 提供指令讓 Administrator 查看當前所有 Monitored_User 清單
4. WHEN Administrator 新增 Monitored_User 時，THE Bot SHALL 確認該用戶存在於 Guild 中
5. WHEN Administrator 新增已存在的 Monitored_User 時，THE Bot SHALL 回傳提示訊息表示該用戶已在監控清單中
6. WHEN Administrator 嘗試新增 Bot 自身為 Monitored_User 時，THE Bot SHALL 拒絕該操作並回傳錯誤訊息

### 需求 2：訊息監控與快取

**使用者故事：** 作為系統，我需要即時監控並儲存被監控用戶的訊息，以便在訊息被刪除時能夠恢復。

#### 驗收標準

1. WHEN Monitored_User 在任何 Channel 發送訊息時，THE Bot SHALL 將訊息內容儲存至 Message_Cache
2. THE Bot SHALL 儲存訊息的文字內容、附件連結、嵌入內容和時間戳記
3. THE Bot SHALL 監控 Guild 內所有 Channel 的訊息活動
4. WHEN Monitored_User 編輯訊息時，THE Bot SHALL 更新 Message_Cache 中對應的訊息內容
5. THE Message_Cache SHALL 保留每則訊息至少 7 天

### 需求 3：訊息刪除偵測與恢復

**使用者故事：** 作為管理員，我想要在被監控用戶刪除訊息時自動恢復該訊息，以便保持訊息記錄的完整性。

#### 驗收標準

1. WHEN Monitored_User 刪除訊息時，THE Bot SHALL 偵測到刪除事件
2. WHEN Bot 偵測到 Monitored_User 的訊息被刪除時，THE Bot SHALL 從 Message_Cache 中檢索該訊息內容
3. WHEN Bot 檢索到被刪除的訊息內容時，THE Bot SHALL 在相同 Channel 重新發送該訊息
4. WHEN Bot 重新發送訊息時，THE Bot SHALL 標註原始發送者、原始發送時間和刪除時間
5. WHEN Bot 重新發送訊息時，THE Bot SHALL 包含原始訊息的所有文字內容和附件連結
6. IF Message_Cache 中找不到被刪除的訊息時，THEN THE Bot SHALL 記錄錯誤並發送通知訊息

### 需求 4：權限控制

**使用者故事：** 作為系統管理員，我想要確保只有授權用戶能夠管理監控設定，以防止未授權的操作。

#### 驗收標準

1. WHEN 用戶嘗試執行管理指令時，THE Bot SHALL 驗證該用戶是否具有 Administrator 權限
2. IF 用戶不具有 Administrator 權限時，THEN THE Bot SHALL 拒絕執行指令並回傳權限不足的訊息
3. THE Bot SHALL 要求具有「管理伺服器」或「管理員」權限才能執行管理指令

### 需求 5：Bot 連線與初始化

**使用者故事：** 作為系統，我需要正確連線到 Discord 並初始化必要的功能，以確保 bot 能夠正常運作。

#### 驗收標準

1. WHEN Bot 啟動時，THE Bot SHALL 使用有效的 Discord token 進行身份驗證
2. WHEN Bot 成功連線時，THE Bot SHALL 註冊所有必要的事件監聽器
3. WHEN Bot 成功連線時，THE Bot SHALL 載入已儲存的 Monitored_User 清單
4. THE Bot SHALL 啟用 MESSAGE_CONTENT 特權意圖以讀取訊息內容
5. THE Bot SHALL 啟用 GUILD_MESSAGES 特權意圖以監控訊息事件
6. IF Bot 連線失敗時，THEN THE Bot SHALL 記錄錯誤訊息並嘗試重新連線

### 需求 6：資料持久化

**使用者故事：** 作為系統，我需要持久化儲存監控設定，以便在 bot 重啟後能夠恢復監控狀態。

#### 驗收標準

1. WHEN Administrator 修改 Monitored_User 清單時，THE Bot SHALL 將變更儲存至持久化儲存
2. WHEN Bot 啟動時，THE Bot SHALL 從持久化儲存載入 Monitored_User 清單
3. THE Bot SHALL 使用檔案系統或資料庫作為持久化儲存機制
4. IF 持久化儲存讀取失敗時，THEN THE Bot SHALL 使用空的 Monitored_User 清單並記錄警告訊息

### 需求 7：錯誤處理與日誌記錄

**使用者故事：** 作為開發者，我需要完整的錯誤處理和日誌記錄，以便診斷和修復問題。

#### 驗收標準

1. WHEN Bot 遇到錯誤時，THE Bot SHALL 記錄錯誤訊息、堆疊追蹤和相關上下文資訊
2. WHEN Bot 執行關鍵操作時，THE Bot SHALL 記錄操作日誌
3. THE Bot SHALL 將日誌輸出至控制台和日誌檔案
4. WHEN 日誌檔案大小超過 10MB 時，THE Bot SHALL 執行日誌輪替並保留最近 5 個日誌檔案
5. IF Discord API 請求失敗時，THEN THE Bot SHALL 記錄失敗原因並在適當時進行重試
6. WHEN Bot 無法重新發送被刪除的訊息時，THE Bot SHALL 記錄失敗原因並通知 Administrator
