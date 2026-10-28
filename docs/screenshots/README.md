# 畫面與驗收產物

大型 PNG 截圖不是網站執行依賴，因此不加入此 GitHub 原始碼樹。執行以下測試可從目前程式重新產生畫面：

```sh
npm run test:e2e
python tests/count-switch.py
```

產物位於 `artifacts/`：桌面版、手機版、手機歷史頁、12 台總覽、數量控制截圖，以及 JSON 驗收報告。即時數值與時間為模擬資料，每次畫面可能不同。

GitHub Actions 完成後，可在該次 `Test and build` 執行的 Artifacts 區下載 `acceptance-artifacts`；保留期限為 7 天。若測試失敗，部分截圖可能尚未產生，請先閱讀該次的實際步驟與 JSON 報告。

原始驗收 ZIP 仍保留當時的完整截圖。不要把示意圖或先前測試結果誤當作目前 GitHub 程式已通過的證據。
