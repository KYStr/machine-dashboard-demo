# GitHub About 與 Topics

這份文件保存 `KYStr/machine-dashboard-demo` 的專案簡介與分類關鍵字，方便維護 GitHub 專案首頁。

**README 或這份文件的提交不會自動修改 GitHub 右側的 About／Topics。** 以下是可直接套用的文案；是否已生效，須以 GitHub 專案首頁或 metadata 讀回結果為準。這份文件也不是網站內的 `public/about.html`。

## About / Description

```text
機台訊號即時看板｜桌面／手機響應式介面、即時圖表、門檻警示、24 小時歷史與 Node.js REST／SSE 模擬後端。Real-time machine monitoring dashboard with simulated data, alerts, history and PWA support. Demo only; no real equipment.
```

簡介同時保留中文用途與英文技術關鍵字，並明確標示這是模擬展示，不是實際設備控制系統。

## Topics

請使用以下 14 個 topics，每個項目各自成為一個標籤：

```text
machine-monitoring
industrial-dashboard
realtime-dashboard
data-visualization
time-series
alerts
simulated-data
mock-api
server-sent-events
nodejs
javascript
responsive-design
pwa
capacitor
```

標籤依專案用途、資料展示、模擬方式與實際使用技術挑選，不加入未使用的 React、MQTT、WebSocket 或資料庫標籤。`capacitor` 指容器設定與後續封裝準備，不代表已有可安裝的 APK／IPA。

## Website

尚未確認可用的公開展示網址時，Website 留白。不要把推測的 GitHub Pages 網址、localhost 或範例網域填進去。正式部署完成後，先確認網址能開啟看板，再更新 Website，並依 [部署文件](DEPLOYMENT.md) 用同一個正式網址重建 SEO 資訊。

## 從 GitHub 首頁設定

打開 [專案首頁](https://github.com/KYStr/machine-dashboard-demo)，按右側 **About** 旁的齒輪，在 **Description** 貼上簡介，在 **Topics** 逐一加入上列標籤，再按 **Save changes**。重新整理頁面，確認簡介與標籤實際出現。

## 使用 GitHub CLI 設定

在已安裝 GitHub CLI、且已登入對此 Repo 有管理權限帳號的電腦上，以下命令只更新簡介與加入上述 topics；不更改公開性、分支、程式碼、部署設定或 Website，也不移除既有 topics。

```sh
gh repo edit KYStr/machine-dashboard-demo --description "機台訊號即時看板｜桌面／手機響應式介面、即時圖表、門檻警示、24 小時歷史與 Node.js REST／SSE 模擬後端。Real-time machine monitoring dashboard with simulated data, alerts, history and PWA support. Demo only; no real equipment." --add-topic "machine-monitoring,industrial-dashboard,realtime-dashboard,data-visualization,time-series,alerts,simulated-data,mock-api,server-sent-events,nodejs,javascript,responsive-design,pwa,capacitor"
```

寫入後讀回確認：

```sh
gh repo view KYStr/machine-dashboard-demo --json description,repositoryTopics,homepageUrl
```

需要登入時，請透過 GitHub 官方登入流程處理；不要把密碼或 token 放進 README、commit 或聊天訊息。

## 官方文件

- [GitHub：Classifying your repository with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- [GitHub CLI：gh repo edit](https://cli.github.com/manual/gh_repo_edit)
- [GitHub CLI：gh repo view](https://cli.github.com/manual/gh_repo_view)
