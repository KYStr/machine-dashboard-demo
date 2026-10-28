# 手機網頁、PWA 與原生容器

手機版使用雙欄卡片／單欄列表、狀態摘要、完整歷史圖與底部導覽。單機三種圖表放在詳情，避免把桌面多欄縮成不可讀的小圖。CSS 處理安全區與 viewport-fit；`?embed=1` 可在已有導覽的 App 容器中隱藏網頁底部列。

## PWA

提供 Manifest、192／512 PNG、maskable icon、Apple Touch Icon 與 Service Worker。需在支援的 HTTPS／localhost 環境測試；直接開單檔 HTML 不提供 PWA 安裝。Manifest 存在不等於實體手機已驗證。

## 可選 Capacitor 容器

`capacitor.config.json` 使用 `webDir: dist`，沒有遠端 `server.url`。App ID `dev.demo.machinedashboard` 只供展示，正式使用前需改成組織識別名稱。

```sh
npm install @capacitor/core@8 @capacitor/android@8 @capacitor/ios@8
npm install -D @capacitor/cli@8
npm run native:prepare -- android
npx cap open android
```

iOS 在具備相應開發環境的 macOS 上改用：

```sh
npm run native:prepare -- ios
npx cap open ios
```

這些安裝會修改 package.json 與 lockfile，請另外提交。基本網頁不需要原生套件。實際 SDK、Android Studio、Xcode 版本請以安裝時的 Capacitor 官方環境要求核對。

準備腳本執行建置、必要的 cap add、cap sync，**不產生已簽章 APK／AAB／IPA**。仍需原生模擬器／實機測試、Signing Team、憑證、發佈帳號與商店審核。

目前沒有下載或驗證原生 SDK，沒有完成 APK／IPA 建置簽章或實體手機安裝。原生容器仍使用本機模擬；改接真實後端需另外設計 HTTPS、驗證、來源權限與離線策略。
