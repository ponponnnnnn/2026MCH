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
| `WS /ws?elderId=demo&attemptId=xxx` | 語音通話。`attemptId` 可省略；有帶且合法時，通話建立後會把該次響鈴標成 `answered` 並寫入 `sessionId`。binary 上行 16kHz PCM16、下行 24kHz PCM16；文字訊息為 JSON 事件（`ready`、`transcript`、`interrupted`、`turnComplete`、`error`），上行送 `{"type":"end"}` 結束 |
| `POST /jobs/daily-report` | 產生並推送晚報，header 需帶 `x-job-secret`；body 可選 `{elderId, date}` |
| `POST /devices/register` | 長輩 App 註冊 FCM token，body `{elderId, token}` → `{ok:true}`；不需密鑰（App 端沒有密鑰） |
| `POST /jobs/call-schedule` | 依排程規則主動響鈴，header 需帶 `x-job-secret`；Cloud Scheduler 每 15 分鐘呼叫，回傳 `{checked, rang, missed}` |
| `POST /demo/ring` | Demo 手動觸發一次響鈴，body 可選 `{elderId}` → `{ok, attemptId, pushed}`；只有 `DEMO_MODE=1` 才開放 |

## 分層

```
backend/src/
├── server.ts                    [進入點] HTTP 路由 + WebSocket 掛載
├── config.ts                    [設定] 環境變數
├── notify.ts                    [通報] Gmail 寄信
├── push.ts                      [推播] FCM data-only 推播（incoming_call），觸發 App 跳出來電畫面
├── call/                        [通話層] 一通電話的生命週期：前 → 中 → 後
│   ├── briefing.ts                通話前：讀 Firestore 一次 → Briefing（時段、今日已聊、上次摘要、掛勾、健康項目優先序、已知基本資料、本通要認識的欄位）
│   ├── live.ts                    通話中：App WebSocket ↔ Gemini Live 轉接、tool call 派發、收尾寫入；有帶 attemptId 時把對應響鈴標成 answered
│   └── summary.ts                 通話後：Gemini Flash 產 2-3 句摘要
├── prompt/                      [規則層] 純文字組裝，不做任何 I/O（不呼叫 DB / 網路）；只 import data/ 的型別與純函式
│   ├── index.ts                   buildSystemPrompt(briefing, profile)：組裝全部規則段 + 個人化提示 + 通話背景
│   ├── render-briefing.ts         export interface Briefing（prompt 層的輸入契約）+ renderBriefing(briefing): string，Briefing → 「本通通話背景」文字區塊
│   └── sections/                  每檔一組規則，export const 繁中文字
│       ├── persona.ts               身分、語氣、時段感知
│       ├── opening.ts               開場序列：OPENING_FIRST_CALL / OPENING_ROUTINE + buildKickoff(briefing)：通話一開始送給模型、觸發開場第一步的那句話
│       ├── topics.ts                健康項目槽位、換題時機、橋接
│       ├── depth.ts                 話題深淺
│       ├── getting-to-know.ts       認識長輩（建檔）
│       ├── sensitive.ts             面子話追問、去羞恥化、清單外擔憂
│       └── recording.ts             工具使用、紅旗、禁止、結尾
├── tools/                       [工具層] Gemini function calling
│   ├── declarations.ts            給模型看的 FunctionDeclaration
│   └── handlers.ts                runTool：驗證輸入 → 寫資料層 / 通報
├── data/                        [資料層] Firestore 連線、型別、存取
│   ├── firestore.ts               db、elderRef、時間工具、isValidId（外部輸入白名單格式檢查）、HealthType / AlertLevel
│   ├── profile.ts                 個人化語域 Profile（語彙 / 語速 / 比喻）
│   ├── facts.ts                   長輩基本資料 ElderFacts、TopicHook、Concern：型別 + 欄位白名單 + 寫入函式
│   ├── devices.ts                 FCM token：normalizeToken、readFcmTokens、registerDevice、removeTokens
│   └── call-attempts.ts           CallAttempt 型別 + createAttempt / markAnswered / markMissed / getTodayAttempts
├── jobs/                         [排程層]
│   ├── report.ts                  每日晚報，納入當日主動通話統計
│   ├── call-rules.ts              純函式 decideCall(input)：時段規則 A + 風險加打規則 B，不做 I/O、不自己取現在時間
│   └── call-schedule.ts           runCallSchedule(now)：掃 elders、逾時標 missed、逐一 decideCall、要響的 ringElder(elderId, window, reason)
└── dev/                          免 API key、免 Firestore 的檢查腳本
    ├── test-personalization.ts
    ├── test-prompt.ts
    └── test-call-schedule.ts      decideCall / parseCallWindows 斷言 + isValidId / normalizeToken 輸入驗證斷言
```

**依賴方向**（只能往下 import，不能往上）：

```
server → call, jobs → prompt, tools, notify, push → data → config
```

**要加東西放哪**

| 想加的東西 | 放哪 |
|---|---|
| 新規則（Agent 該怎麼說話/怎麼問） | `prompt/sections/` 新增或修改一段，`prompt/index.ts` 接進組裝順序 |
| 新工具（給 Gemini function calling） | `tools/declarations.ts`（宣告）+ `tools/handlers.ts`（實作）兩個檔都要改 |
| 新的通話前背景欄位（Briefing 要多帶什麼資訊） | `Briefing` 型別本身定義在 `prompt/render-briefing.ts`（prompt 層的輸入契約，`call/briefing.ts` 往下 import）；欄位怎麼從 Firestore 算出來改 `call/briefing.ts`，怎麼渲染成文字改 `prompt/render-briefing.ts` |
| 新的 Firestore 集合或欄位 | `data/`（新增檔案或在既有檔案加型別與存取函式） |
| 新排程（例如每日/每週跑一次的工作） | `jobs/`，決策邏輯是純函式的話拆成獨立檔（例如 `call-rules.ts`），跑 I/O 的部分另一個檔（例如 `call-schedule.ts`） |
| 新的外部通知／推播管道 | `src/` 根目錄，跟 `notify.ts`／`push.ts` 同一層 |

**Firestore 新增欄位與集合**（本次串接）

- `elders/{id}.facts`（map）：長輩基本資料 ElderFacts（稱呼、家人、興趣、作息、慢性病、自述用藥、慣用語言、其他備註），merge 寫入，不動同一文件頂層的個人化語域欄位（隊友的 F11）
- `elders/{id}/topicHooks`（集合）：長輩自己提到的人事物，供下次通話開場當話題；`call/briefing.ts` 讀取時依 entity 去重，只留最新一筆
- `elders/{id}/concerns`（集合）：健康項目清單以外、模型主動聽到的擔憂（詐騙、居家安全、走失…），`jobs/report.ts` 的每日晚報會一併讀取
- `elders/{id}/sessions/{sessionId}.summary`（欄位）：通話結束後 Gemini Flash 產生的 2-3 句繁中摘要
- `elders/{id}/sessions/{sessionId}.elderSpoke`（欄位，boolean）：這通有沒有真的聽到長輩開口，`call/briefing.ts` 判斷「是不是第一次通話」靠這個欄位，不能只看有沒有 `endedAt`（連線失敗、秒掛也會寫 `endedAt`）
- `elders/{id}.callWindows`（`string[]`，"HH:mm"，台北時區）：後端主動響鈴的時段設定，缺少或格式不對時 `jobs/call-rules.ts` 用預設值 `["09:00","19:00"]`
- `elders/{id}.fcmTokens`（`string[]`）：這位長輩 App 裝置的 FCM 註冊 token，`POST /devices/register` 寫入，FCM 回報失效時 `data/devices.ts` 的 `removeTokens` 清掉
- `elders/{id}/callAttempts/{attemptId}`（集合）：後端主動響鈴的每一次嘗試，`{ ts: Timestamp, date: "yyyy-mm-dd"（台北）, window: "HH:mm" | "boost" | "demo", reason: "window" | "retry" | "risk_boost" | "demo", status: "ringing" | "answered" | "missed", pushed: number, answeredAt?: Timestamp, sessionId?: string }`；`jobs/call-schedule.ts` 建立與逾時更新，`call/live.ts` 在通話接通時標成 `answered`

**dev 腳本執行方式**：在 `backend` 資料夾下 `npx tsx src/dev/test-prompt.ts`（規則層組裝結果）、`npx tsx src/dev/test-personalization.ts`（個人化語域邏輯）或 `npx tsx src/dev/test-call-schedule.ts`（通話排程純函式 + HTTP 輸入驗證），三者都不需要 `.env`、不連 Firestore、不呼叫 Gemini。

## Firestore 索引

晚報查詢用 `ts` 範圍 + 排序，單一欄位，預設索引即可，不需自訂複合索引。`callAttempts` 用 `date` 相等查詢（單一欄位）、`sessions` 用 `startedAt` 範圍（同一欄位兩個界線），`alerts` 沿用既有的 `ts` 範圍 + 排序，一樣不需要複合索引。

## 排程（Cloud Scheduler）

晚報 `/jobs/daily-report` 每晚 20:00 呼叫一次；`/jobs/call-schedule` 依規則主動響鈴，需要每 15 分鐘呼叫一次（首響 + 最多 2 次重試、15 分鐘間隔都是抓在這個頻率下才能對上）。以下只是文件記錄，Demo 現場沒有實際建立：

```
gcloud scheduler jobs create http call-schedule \
  --schedule="*/15 * * * *" \
  --uri="https://<CLOUD_RUN_URL>/jobs/call-schedule" \
  --http-method=POST \
  --headers="x-job-secret=<JOB_SECRET>" \
  --time-zone="Asia/Taipei"
```

## 部署

```
gcloud run deploy elder-agent --source . --region asia-east1 --allow-unauthenticated --timeout=3600 --no-cpu-throttling
```

`--no-cpu-throttling` 是必要的：通話結束的摘要（`summarizeSession`）在 WebSocket 關閉之後才呼叫 Gemini，這時已經沒有進行中的 HTTP/WS 請求，Cloud Run 預設會限縮沒有請求時的 CPU，摘要呼叫可能因此變慢或卡住。
