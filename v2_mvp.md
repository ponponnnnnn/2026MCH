# AI 語音長照 Agent — Demo MVP 定義

> 延伸自 `v1_md`。本文件只定義「Demo 現場要跑得起來的最小範圍」：哪些必做、哪些不做、用什麼做。

## 1. MVP 一句話

**能講話 → 講話過程中悄悄記下健康資料 → 每晚固定推送「本日狀況報告」給家屬 → 家屬頁面看得到（緊急異常例外：立即推送）**

Demo 要證明的三件事：
1. 長輩覺得是在「聊天」，不是在填表（陪伴 + 主動式提問）
2. 健康資料是從對話中自動結構化出來的（不用人工輸入）
3. 家屬每晚固定時間（預設 20:00）收到一份「本日狀況報告」；若遇紅色緊急事件，不等晚上、立即通報（降低照護空窗期）

## 2. 使用者與角色

| 角色 | 介面 | 要做的事 |
|---|---|---|
| 長輩（獨居／半獨居） | 一個大按鈕的語音頁面（平板／手機瀏覽器） | 點一下開始講話，其餘全靠語音 |
| 家屬（壯世代） | 手機 Web 儀表板 + 訊息推播 | 看今日狀態、收異常警報、回看對話摘要 |

不做：照服員端、多長輩管理後台（僅在簡報中說明「一對多」擴充方向）。

## 3. Demo 主流程（3 分鐘腳本）

1. 長輩點「跟小幫手聊聊」，Agent 語音問候（台語腔國語／繁中口語）
2. 閒聊中 Agent 穿插主動提問：「今天有吃藥嗎？」「昨晚睡得好嗎？」「有沒有哪裡不舒服？」
3. 長輩回答，儀表板**即時**出現：藥物 ✅、睡眠 5 小時、心情偏低
4. 長輩說「剛剛頭有點暈，差點跌倒」→ Agent 溫柔追問細節並安撫
5. 若為紅色緊急（如跌倒）→ 家屬 Gmail 信箱立即收到警報信；黃色／一般事項不即時打擾，留待晚報
6. 到了晚上報告時間（Demo 用按鈕手動觸發模擬 20:00）→ 家屬 Gmail 信箱收到「本日狀況報告」信
7. 家屬點報告連結，打開儀表板：看到今日健康時間軸、異常事件、對話摘要

## 4. 功能範圍

### P0 必做（沒有就不成立 demo）

| # | 功能 | 驗收標準 |
|---|---|---|
| F1 | **即時語音對話** | 長輩講話，Agent 在 ~1 秒內語音回應，可被打斷，繁體中文流暢 |
| F2 | **主動式健康提問** | System prompt 內含問診清單（用藥、睡眠、飲食、疼痛、心情），Agent 自然穿插而非罐頭審問 |
| F3 | **對話中結構化記錄** | Agent 透過 function calling 呼叫 `log_health(type, value, note)`，資料寫入資料庫 |
| F4 | **異常偵測** | 規則：紅旗關鍵字／描述（跌倒、胸痛、呼吸困難、暈眩、漏藥連續）→ 呼叫 `raise_alert(level, reason)`，紅／黃分級並寫入 DB |
| F5 | **每日晚間狀況報告** | 每晚固定時間（預設 20:00，可設定）由排程觸發：彙整當日 healthLogs + alerts + 對話 → Gemini 產生報告 → 以 Gmail 寄信給家屬（內容見 §6.1） |
| F5b | **紅色緊急即時通報** | 僅 `red` 級別立即推送（≤10 秒），黃色與一般紀錄只進晚報，避免過度打擾 |
| F6 | **家屬儀表板** | 即時顯示今日健康卡片、警報列表（紅／黃）、對話摘要；晚報訊息內附連結可跳轉 |

### P1 加分（時間夠再做，依序）

| # | 功能 | 說明 |
|---|---|---|
| F7 | 歷史報告列表 | 儀表板可回看過去每一天的晚報 |
| F8 | 7 天趨勢圖 | 睡眠時數、心情分數折線圖，展示「長期紀錄」價值 |
| F9 | 認知刺激小遊戲式對話 | 回憶往事、猜謎、今天日期／星期（同時是認知退化的軟性指標） |
| F10 | 當日未互動提示 | 晚報產生時若長輩整天沒對話，報告首行標示「今日尚未互動」，並可提前推播 |

### 明確不做（Demo 範圍外）

- 真實穿戴裝置／血壓計串接（用對話自述 + 假資料補圖表）
- 帳號註冊、登入權限、多家庭多長輩
- 醫療診斷或用藥建議（Agent 僅記錄與通報，不給醫療結論）
- 台語 ASR 客製訓練、離線模式、原生 App
- 完整 HIPAA／個資合規實作（簡報提及，Demo 不做）

## 5. 技術選型（以 Google 生態系為主）

| 層級 | 選用 | 理由 |
|---|---|---|
| 語音對話核心 | **Gemini Live API**，模型 **`gemini-3.8-live`**（Stable） | 單一連線完成 STT + LLM + TTS，低延遲、可打斷；官方定位為低延遲語音 Agent 預設選擇，支援非同步 function calling 與繁體中文。備選：`gemini-3.8-live-extended-thinking`（穩定但延遲較高）。舊版 `gemini-3.1-flash-live-preview` 官方建議升級，不採用。模型 ID 與計價以官方文件為準，開發前用 API key 實測可用 |
| Agent 邏輯 | System prompt + **Function Calling**（`log_health`、`raise_alert`） | 「悄悄記錄」的關鍵：對話同時觸發工具，不打斷聊天 |
| 晚報生成 | Gemini 2.x Flash（文字，結構化輸出 JSON） | 彙整當日資料產生報告：整體狀態、各項指標、異常、對話摘要、明日建議關心重點 |
| 長輩端前端 | 純 **Web（Vite + React／原生 JS）**，`getUserMedia` + WebSocket | 免安裝，平板打開網址就能 demo；單一大按鈕 UI，字體大 |
| 後端 | **Node.js（TypeScript）或 Python FastAPI** 部署於 **Cloud Run** | 代理 Gemini Live 連線（藏 API key）、執行 tool call、寫 DB、觸發通報 |
| 資料庫 | **Firestore** | 即時監聽（onSnapshot）讓儀表板無需輪詢；schemaless 適合黑客松快速迭代 |
| 家屬儀表板 | **React + Tailwind + Recharts**，Firebase Hosting | 手機優先，Firestore 即時更新 |
| 通報 | **Gmail 寄信**：Nodemailer + Gmail SMTP（`smtp.gmail.com:465`）＋「應用程式密碼」 | 不用申請任何審核、5 分鐘可通，收件人只需填 email；適合每日一封的晚報。需求：寄件 Gmail 開啟兩步驟驗證後產生 16 碼應用程式密碼（密碼存環境變數／Secret Manager，不進 git）。限制：個人 Gmail 每日約 500 封上限，Demo 綽綽有餘；紅色警報靠信件推播通知，速度略慢於即時通訊軟體。可升級：Gmail API（OAuth）或 Workspace SMTP relay。 |
| 排程（P0） | **Cloud Scheduler** → Cloud Run `POST /jobs/daily-report`（每日 20:00，時區 Asia/Taipei） | 觸發晚報；Demo 現場另做「立即產生晚報」按鈕 |

### 架構圖

```
 長輩 (Web 麥克風/喇叭)
      │  WebSocket (音訊串流)
      ▼
 Cloud Run 後端 ──────────► Gemini Live API
      │  ▲                   （語音對話 + tool call）
      │  └── tool call: log_health / raise_alert
      ▼
  Firestore ──即時同步──► 家屬儀表板 (Firebase Hosting)
      │
      ├── raise_alert(red) ──► Gmail 即時寄信 ──► 家屬信箱／手機通知
      │
 Cloud Scheduler (每晚 20:00) ─► Cloud Run /jobs/daily-report
      └── 彙整當日資料 → Gemini 產生報告 → Gmail 寄信 ──► 家屬信箱
```

## 6. 資料模型（Firestore）

```
elders/{elderId}
  name, age, medications[], familyContacts[{name, email}]

elders/{elderId}/healthLogs/{logId}
  ts, type: "medication" | "sleep" | "mood" | "pain" | "meal" | "other"
  value: string | number
  note: 長輩原話摘錄
  sessionId

elders/{elderId}/alerts/{alertId}
  ts, level: "red" | "yellow", reason, sourceQuote, notified: boolean

elders/{elderId}/sessions/{sessionId}
  startedAt, endedAt, summary, moodScore

elders/{elderId}/dailyReports/{yyyy-mm-dd}
  generatedAt, overall: "normal" | "watch" | "alert"
  metrics: {medication, sleepHours, mood, meals, pain}
  events[]（當日異常）, summary, followUps[], sent: boolean
```

### 6.1 晚間報告內容（Email 格式）

主旨：`【長照小幫手】王奶奶 9/19 今日狀況報告｜🟡 需留意`（紅色警報信主旨以 `🚨 緊急通報` 開頭）
內文（純文字或簡單 HTML）：

```
📋 王奶奶｜今日狀況報告 (9/19)
整體：🟡 需留意
💊 用藥：早、午已服，晚藥待提醒
😴 睡眠：昨晚約 5 小時（偏少）
🙂 心情：普通，下午聊到孫子很開心
⚠️ 異常：14:20 提到頭暈、差點跌倒（已記錄）
🗣 互動：共 3 次、約 12 分鐘
👉 建議：今晚打通電話關心，留意頭暈是否再發生
🔗 查看詳細儀表板：<link>
```

## 7. Function Calling 定義

```
log_health(type, value, note)
  → 只要長輩提到用藥/睡眠/飲食/疼痛/心情就呼叫，不需口頭告知長輩

raise_alert(level, reason, quote)
  → red: 跌倒、胸痛、呼吸困難、意識不清、求救
  → yellow: 頭暈、連續漏藥、連續睡眠不足、情緒明顯低落
  → 呼叫後 Agent 需安撫並告知「已通知家人」
```

## 8. Agent 行為原則（System Prompt 重點）

- 語氣：溫暖、慢、短句、繁體中文口語，稱呼長輩慣用稱謂
- 先陪伴後提問：每輪最多 1 個健康問題，避免像問卷
- 不做診斷、不建議用藥；緊急情況一律通報並建議聯絡家人／119
- 對話結尾固定總結：「今天聊得很開心，記得按時吃藥喔」
- 紅旗詞觸發後不再追問細節過久，優先確認安全

## 9. 分工與時程建議（黑客松 48h／可壓縮）

| 階段 | 工作 | 產出 |
|---|---|---|
| 1 | Gemini Live 語音跑通（Web 麥克風 ↔ 後端 ↔ Gemini） | F1 |
| 2 | 加入 System prompt 與兩個 function call，寫入 Firestore | F2、F3、F4 |
| 3 | Gmail 寄信串接（產生應用程式密碼、Nodemailer 寄出測試信；紅色即時通報） | F5b |
| 4 | 每日晚報：彙整邏輯 + Gemini 產生 + Scheduler + 推送 | F5 |
| 5 | 家屬儀表板（即時卡片 + 警報列表） | F6 |
| 6 | 預錄假資料 7 天、趨勢圖、彩排 demo 腳本 | F7、F8 |

建議人力：1 人語音/後端、1 人儀表板前端、1 人 prompt 與腳本/簡報。

## 10. 風險與備案

| 風險 | 備案 |
|---|---|
| 現場網路／麥克風不穩 | 預錄一段完整 demo 影片；準備文字輸入模式當備援 |
| Gemini 中文辨識口音偏差 | 準備 demo 用台詞先行測試；prompt 加入常見詞彙 |
| Gmail 被擋（應用程式密碼失效／被判定垃圾信） | 提前寄測試信並請收件人加入通訊錄；備案：改用 Gmail API（OAuth）或其他寄件帳號 |
| Agent 亂給醫療建議 | Prompt 明確禁止；demo 前測試紅隊問法 |
| Live API 額度／延遲 | 預先申請額度；保留三段式備案（Speech-to-Text → Gemini → TTS） |

## 11. Demo 成功標準

- [ ] 現場一次對話跑完完整流程，無需手動干預
- [ ] 儀表板在對話中即時新增至少 3 筆健康紀錄
- [ ] 觸發紅色異常後 ≤10 秒家屬手機收到即時通報
- [ ] 按下「立即產生晚報」後 ≤15 秒家屬手機收到完整本日報告，內容與當天實際對話一致
- [ ] Cloud Scheduler 已設定每晚 20:00 自動觸發（簡報可展示設定畫面）
- [ ] 評審能在儀表板看到「長期紀錄」（7 天趨勢）
- [ ] 簡報能對應 v1 的痛點：照護人力缺口 → 一對多 → 社交刺激延緩退化
