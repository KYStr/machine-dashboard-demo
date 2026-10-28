# 模擬 API 與資料契約

網站與 API 同源，所有數據為模擬。靜態部署沒有 Node API，由 DemoDataClient 使用相同規則的本機引擎。

| 方法 | 端點 | 用途 |
|---|---|---|
| GET | `/api/health` | 服務識別與模式 |
| GET | `/api/snapshot` | 機台、統計、近期點位、事件 |
| GET | `/api/events` | SSE，立即傳送並持續推送 snapshot |
| GET | `/api/history` | 歷史曲線，接受 ids、metric、range |
| POST | `/api/demo/config` | 展示機台數、更新間隔、暫停 |
| POST | `/api/demo/scenario` | 指定機台高溫／恢復 |

```sh
curl 'http://127.0.0.1:3000/api/history?ids=MC-001,MC-002&metric=temperature&range=24h'
curl -X POST http://127.0.0.1:3000/api/demo/config \
  -H 'Content-Type: application/json' \
  -d '{"count":12,"intervalMs":1000,"paused":false}'
curl -X POST http://127.0.0.1:3000/api/demo/scenario \
  -H 'Content-Type: application/json' \
  -d '{"machineId":"MC-001","action":"hot"}'
curl -N http://127.0.0.1:3000/api/events
```

設定限制：count 為 3／12／30／60；intervalMs 為 1000／3000／5000／10000；paused 為布林。情境只有 hot／recover，約兩分鐘後回原模擬基準。歷史 range 為 1h／24h，metric 為 temperature／rpm／output，ids 為 1～6 台不同機台。

錯誤為 `{ "error": "..." }`。輸入錯誤 400、跨來源瀏覽器寫入 403、不存在端點 404、SSE 達 100 連線上限 503。JSON 請求上限 8 KiB。

## 數據

時間戳為 Unix milliseconds，畫面顯示 Asia/Taipei。temperature 單位 °C、rpm 每分鐘轉速、output 件／分鐘、total 今日累計件數；累計值不是速率。snapshot 含 mode、revision、generatedAt、intervalMs、paused、retentionHours、counts、machines、alerts。

機台包含 id、name、kind、line、status、operating、alarmState、temperature、threshold、rpm、output、total、updatedAt、recent。status 為 running／idle／error；alarmState 為 normal／warning／critical。recent 是有實際時間與三種值的點位。

## 警示

溫度上限 T：讀值 ≥ T 為 critical，≥ T−5 為 warning。原為 critical 且仍 ≥ T−3 時保留異常；原為 warning 且仍 ≥ T−8 時保留警告，以遲滯避免門檻閃爍。其餘為 normal。

只在狀態轉換寫事件；舊事件改為 active=false 並記 resolvedAt，新事件有獨立 ID。事件最多 500 筆，未解除事件優先保留。恢復後依原 operating 狀態回到運轉或待機。

## 保留與替換

每台約 24 小時分鐘資料與近十分鐘高頻資料，1h 輸出最多 121 點、24h 最多 289 點，降採樣保留首尾。記憶體狀態於 Node 重啟或本機模式重載後重建。初始累計產量不是預先生成歷史速率的積分，不能作為生產稽核。

真實後端替換 DemoDataClient 的 connect／refresh／history／configure／scenario／close 邊界。正式唯讀公開版應移除展示寫入，不得把真實設備控制權直接交給公開瀏覽器。認證、授權、稽核、儲存、斷線重放與多副本同步均需另行設計。
