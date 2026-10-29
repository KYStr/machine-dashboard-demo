# Machine Signal · 機台訊號即時看板

## About · 專案簡介

**讓機台狀態、即時趨勢與異常事件，在桌面與手機上都一目了然。**

Machine Signal 是繁體中文機台監控展示專案，提供可擴充的多機台總覽、溫度／轉速／產量即時折線圖、門檻警示與解除紀錄，以及最近一小時／最近一天的歷史查詢。響應式介面支援桌面卡片與手機機台列表，搭配 Node.js REST／SSE 模擬後端，也可使用純靜態、單檔預覽與 PWA 模式展示。

A responsive machine monitoring dashboard demo with live charts, threshold alerts, 24-hour history, and a Node.js REST/SSE mock backend. Built with vanilla JavaScript, with PWA support and a Capacitor wrapper configuration for future mobile packaging.

**所有機台、數值與歷史事件都是模擬資料，不連接真實工廠設備。這是展示與學習用範例，不是可直接控制真實設備的工業系統；也尚未產出原生 APK／IPA。**

### Topics · 專案關鍵字

`machine-monitoring` · `industrial-dashboard` · `realtime-dashboard` · `data-visualization` · `time-series` · `alerts` · `simulated-data` · `mock-api` · `server-sent-events` · `nodejs` · `javascript` · `responsive-design` · `pwa` · `capacitor`

以上是本專案的分類關鍵字。README 文字不會自動設定 GitHub 右側的 About／Topics；可直接套用的簡介、topics 與設定方式見 [GitHub 專案資訊設定](docs/GITHUB-ABOUT.md)。

## 啟動

需要 Node.js 22 以上。網頁與 Node 服務使用內建 API，沒有必要的第三方執行依賴。

```sh
git clone https://github.com/KYStr/machine-dashboard-demo.git
cd machine-dashboard-demo
npm start
```

開啟 `http://127.0.0.1:3000`。`npm start` 會先建置，再啟動 Node 模擬後端；不必先執行 `npm install`。

```sh
npm run dev     # 開發：重新建置與 Node watch
npm test        # 核心、警示、HTTP/SSE 與建置測試
npm run build   # dist/ 網站及 artifacts/preview.html 單檔預覽
npm run check   # 測試與建置
```

單檔預覽可以下載後直接用瀏覽器開啟；它使用獨立的本機模擬資料，不是已部署網站。記憶體資料在重新載入或服務重啟後重建。

## 展示與驗收

預設 3 台：A 運轉、B 高溫異常、C 待機。主畫面提供 **3／12／30／60 台**切換，選擇後立即套用；30／60 台先顯示 12 張卡片，清楚列出已顯示及剩餘數，並提供「顯示全部」。切換數量會清除舊搜尋及狀態篩選。

- 溫度、RPM、產出速率持續更新；今日累計產量與件／分鐘分開標示。
- 展示設定可調整 1／3／5／10 秒更新、暫停，以及指定機台高溫／恢復。
- 超標會變紅並留下事件；持續同一異常不重複洗版，解除事件保留。
- 最近一小時／最近一天、三種指標、最多六台比較、CSV 匯出。
- 手機雙欄卡片／單欄列表與固定導覽；點卡片看單機完整圖表。
- 支援鍵盤操作、明確的連線／模擬來源標示與深淺外觀。

詳見 [人工驗收清單](docs/ACCEPTANCE.md)。[畫面與測試產物](docs/screenshots/README.md)由瀏覽器測試產生，不把大型截圖當成執行依賴。

## 架構

```text
src/app.js                  狀態、事件、畫面與操作
src/charts.js               有實際座標的 SVG 圖表
src/styles-base.css         基礎桌面／手機樣式
src/styles.css              手機可讀性及台數控制補強
src/data-client.js          單一資料存取邊界
  ├─ Node：REST + EventSource / SSE
  └─ 靜態／單檔：相同規則的本機模擬器
shared/simulator.mjs        可重現、有容量上限的模擬引擎
shared/alerts.mjs           門檻、遲滯、警示狀態轉換
server/index.mjs            Node HTTP、靜態檔案、API、SSE
public/                    HTML、PWA、SEO 與圖示來源
scripts/build.mjs          dist、SEO、快取版本、單檔預覽
```

**Node 模式**：同一個服務實例的訪客共享記憶體狀態，SSE 推送更新。**靜態模式**：每位訪客獨立模擬，不具跨裝置同步。不存在永久資料庫或真正設備連線；前端不會假裝離線時仍收到後端資料。

每台保留約 24 小時分鐘資料與近十分鐘高頻資料，事件上限 500 筆，保留未解除事件優先。初始歷史僅供展示，不作生產稽核。[API 契約與警示規則](docs/API.md)。

## SEO 與部署

```sh
npm run build -- --site-url https://YOUR-DOMAIN.example/
```

請替換成真實正式網址。建置會產生 canonical、Open Graph、Twitter Card、JSON-LD、robots 與 sitemap。未設定網址時預設 **noindex**；不宣稱已被搜尋引擎收錄或保證排名。`public/about.html` 提供不依賴 JavaScript 的介紹內容。

GitHub Pages workflow 為手動啟動；**提交程式碼不等於已部署網站**。Pages 為純靜態／各瀏覽器本機模擬。需要共享 REST／SSE，應部署 Node 服務並配置 HTTPS 及反向代理。[部署文件](docs/DEPLOYMENT.md)。

## 手機與 App

已提供 PWA Manifest、圖示、Service Worker、Capacitor 設定與 `native:prepare`。嵌入已有導覽列的 App 可用 `?embed=1` 隱藏網頁底部列。

這些準備**不代表已產出或簽章 APK／IPA，也不代表實體 iPhone／Android 安裝已驗證**。[手機與原生容器說明](docs/MOBILE.md)。

## 瀏覽器測試

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install --with-deps chromium
npm run test:e2e
python tests/count-switch.py
```

預設測試啟動真實 Node 服務，包含多分頁 SSE、離線重新載入及不同螢幕尺寸。受限環境可用 `BROWSER_TEST_MODE=embedded` 執行隔離的單檔互動測試，但那不證明實際來源的 Service Worker／瀏覽器 SSE 整合。

測試會寫出 `artifacts/` 下的 JSON 報告、截圖及 CSV；GitHub Actions 的實際結果請看 [Actions](https://github.com/KYStr/machine-dashboard-demo/actions)。已安裝原生 SDK、簽章、商店發佈不在這些測試範圍內。

## 安全與限制

公開展示只有模擬資料。`/api/demo/config`、`/api/demo/scenario` 是刻意開放的示範寫入，**不是具身分驗證的工業控制介面**。請勿替換成真實設備寫入 API 後直接公開。正式產品需另行處理認證授權、資料庫、稽核、流量限制及多實例同步。

伺服器限制 JSON 大小、機台數與 SSE 連線數，阻擋跨來源瀏覽器寫入與私有檔案存取；這不等於完整安全稽核。專案不需要 API Key，不包含真實機台資料。

## 提交歷程與交付差異

功能分成版面、資料、警示、互動、PWA／SEO、修正、測試、文件與 v1.0.1 台數操作等階段逐筆提交；沒有壓成一筆初始提交。GitHub 發佈保留既有遠端歷史，不重寫分支。因透過 GitHub 建立提交，遠端 SHA 不等於交付 ZIP 內的原始 SHA。

發佈版採尺寸最佳化的圖示、輕量分享圖，並把樣式拆成基礎與追加規則；單檔預覽仍內嵌完整樣式。驗收截圖改由測試產生，完整原始截圖仍在先前交付包中。程式功能與模擬規則不因這些包裝調整而改變。

MIT License，見 [LICENSE](LICENSE)。
