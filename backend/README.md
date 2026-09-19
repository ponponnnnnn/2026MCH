# Backend

Express + WebSocket，代理 Gemini Live 語音、執行 tool call、寫 Firestore、推送家屬、產生晚報。

## 本機執行

1. `cp .env.example .env`，填入 `GEMINI_API_KEY` 等
2. 本機連 Firestore：設定 `GOOGLE_APPLICATION_CREDENTIALS` 指向服務帳戶 JSON，並設 `GOOGLE_CLOUD_PROJECT`
3. Firestore 手動建立 `elders/demo`（name、medications、familyContacts）
4. `npm run dev`

## 介面

| 路徑 | 說明 |
|---|---|
| `GET /healthz` | 健康檢查 |
| `WS /ws?elderId=demo` | 語音通話。binary 上行 16kHz PCM16、下行 24kHz PCM16；文字訊息為 JSON 事件（`ready`、`transcript`、`interrupted`、`turnComplete`、`error`），上行送 `{"type":"end"}` 結束 |
| `POST /jobs/daily-report` | 產生並推送晚報，header 需帶 `x-job-secret`；body 可選 `{elderId, date}` |

## Firestore 索引

晚報查詢用 `ts` 範圍 + 排序，單一欄位，預設索引即可，不需自訂複合索引。

## 部署

```
gcloud run deploy elder-agent --source . --region asia-east1 --allow-unauthenticated --timeout=3600
```
