# 部署與 SEO

## GitHub 原始碼

本專案分階段提交至 `KYStr/machine-dashboard-demo`。請從 GitHub clone 最新 main；既有交付 ZIP 的提交雜湊不同，不要以 force push 覆寫遠端。

程式碼提交不會自動發佈網站。每次 push 的測試結果見 Actions；不能只由 README 推定已通過。

## GitHub Pages

在 Repo Settings → Pages 選擇 GitHub Actions 作為來源，再手動執行 `Publish accepted demo to Pages`。此 workflow 只有 `workflow_dispatch`，不因每次 push 自動部署。

Pages 建置使用正式 `base_url` 產生 SEO，部署 `dist/`；資源採相對路徑，支援 repo 子路徑。**Pages 不執行 Node**，訪客使用各自獨立的本機模擬資料。

## Node 共享模擬後端

在可執行長時間 Node 程序與 SSE 的主機上：

```sh
npm run build -- --site-url https://YOUR-DOMAIN.example/
HOST=0.0.0.0 PORT=3000 npm run preview
```

替換正式網址，在反向代理配置 HTTPS，停用 `/api/events` 的回應緩衝，給予適當 idle timeout。不要快取 API 或 SSE。此版本只在同一服務實例共享記憶體；多副本不會自動同步。

## SEO 範圍

建置包含繁體中文語意標記、主頁與靜態關於頁、各自 canonical、Open Graph／Twitter Card、1200×630 分享圖、WebApplication／AboutPage JSON-LD、robots 與 sitemap。未填 SITE_URL 時 noindex，設定後改為 index。

應用內的 hash 導覽仍是同一看板，不虛構不同落地頁。搜尋引擎實際收錄及排名需部署後另外確認，不作保證。

## 快取與資料

Service Worker 使用內容雜湊版本，只快取 app shell／靜態資源，不攔截 API、SSE、外部來源或寫入。Node 中斷時保留最後讀值並標示中斷；離線重載可改用本機模擬，來源必須清楚標示。

## 安全邊界

沒有真實資料或金鑰。示範設定 API 可被訪客操作，不適合作為正式設備控制。正式環境應移除示範寫入，並實作身分驗證、權限、稽核、持久儲存與流量限制。
