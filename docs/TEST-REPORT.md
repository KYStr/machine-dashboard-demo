# GitHub 發佈版測試紀錄

日期：2026-10-28。此文件記錄本機發佈工作副本的驗證，不代替 GitHub Actions 實際執行紀錄。

| 檢查 | 本機結果 |
|---|---|
| Node 核心、API／SSE、警示、建置測試 | 41 通過，0 失敗 |
| npm run build | 通過，產生 dist 與單檔預覽 |
| e2e.py，BROWSER_TEST_MODE=embedded | 39 通過，0 失敗 |
| count-switch.py，隔離瀏覽器模式 | 27 通過，0 失敗 |
| 60 台全部展開的水平溢出 | 320、360、375、390、430、768、1024、1440px 全部通過 |

本機完整 URL 瀏覽器模式嘗試因環境政策 `ERR_BLOCKED_BY_ADMINISTRATOR` 無法導覽 localhost，沒有把它當作成功。改用隔離 HTML 模式驗證真實模擬引擎與 UI；Node HTTP／SSE 另以整合測試驗證。

GitHub CI 使用真實 Node 服務與瀏覽器，另跑台數回歸，並保留 artifacts。請到 Actions 查看最新 main 的結果；中間提交可能因尚未補齊所有階段而失敗，不能以那些結果替代最終版本。

瀏覽器報告與截圖：artifacts/browser-tests.json、count-switch-tests.json 及 PNG。API 測試含 SSE 初始資料、後續更新，以及暫停狀態下的機台數量變更推送。

未驗證：實體手機 PWA 安裝、原生 SDK／APK／IPA 簽章、商店上架、正式站點 HTTPS 與搜尋收錄。

發佈包裝調整：圖示壓縮、輕量 OG 圖、CSS 基礎／追加規則拆分，單檔預覽完整內嵌；大型驗收截圖改由測試產生，不是遺漏執行所需資源。
