# 近視管理客戶追蹤系統 (PWA + GAS)

專為近視控制、角膜塑型與視覺發育追蹤打造之臨床管理系統。

## 目錄結構
- `index.html`：PWA 應用程式入口
- `manifest.json`：Web 應用程式設定與全螢幕配置
- `sw.js`：Service Worker 離線快取核心
- `icon-192.png`、`icon-512.png`：App 桌面圖示
- `css/style.css`：手機觸控與臨床卡片最佳化樣式
- `js/db.js`：IndexedDB 本機資料庫與離線隊列 (Outbox)
- `js/api.js`：GAS Web App 通訊與 CORS 防禦封裝
- `js/chartModule.js`：Chart.js 雙眼眼軸長 (AL) 趨勢曲線繪製模組
- `js/app.js`：主互動邏輯、搜尋篩選與 CSV 匯出引擎
- `gas/Code.gs`：Google Apps Script 後端 API 程式碼

## 部署與使用方式
1. **設定 GAS 後端**：
   - 開啟《近視管理客戶資料》試算表 -> 擴充功能 -> Apps Script。
   - 將 `gas/Code.gs` 貼入並儲存。
   - 點選「部署」->「新增部署作業」-> 類型選「網頁應用程式」。
   - 存取權限設為「所有人」，複製產生的 `/exec` 網址。
2. **託管前端**：
   - 將本專案除 `gas/` 資料夾外之檔案上傳至 GitHub 專案庫並啟用 GitHub Pages。
3. **手機安裝與同步**：
   - 使用手機瀏覽器開啟 GitHub Pages 網址，點選「加到主畫面」安裝。
   - 開啟 App 後至「設定」貼入 GAS 網址並儲存。
   - 點擊「🔄」即可同步完整病歷並支援離線操作。
