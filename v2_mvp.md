# AI 語音長照 Agent — Demo MVP 定義

> 延伸自 `v1_md`。本文件只定義「Demo 現場要跑得起來的最小範圍」：哪些必做、哪些不做、用什麼做。

## 1. MVP 一句話

**能講話 → 講話過程中悄悄記下健康資料 → 偵測到異常就推給家屬 → 家屬頁面看得到**

Demo 要證明的三件事：
1. 長輩覺得是在「聊天」，不是在填表（陪伴 + 主動式提問）
2. 健康資料是從對話中自動結構化出來的（不用人工輸入）
3. 異常會在數秒內通報到家屬手上（降低照護空窗期）

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
5. 系統判定異常 → 家屬 LINE／推播在幾秒內收到警報
6. 家屬打開儀表板：看到警報卡片、今日健康時間軸、對話摘要

## 4. 功能範圍

### P0 必做（沒有就不成立 demo）

| # | 功能 | 驗收標準 |
|---|---|---|
| F1 | **即時語音對話** | 長輩講話，Agent 在 ~1 秒內語音回應，可被打斷，繁體中文流暢 |
| F2 | **主動式健康提問** | System prompt 內含問診清單（用藥、睡眠、飲食、疼痛、心情），Agent 自然穿插而非罐頭審問 |
| F3 | **對話中結構化記錄** | Agent 透過 function calling 呼叫 `log_health(type, value, note)`，資料寫入資料庫 |
| F4 | **異常偵測** | 規則：紅旗關鍵字／描述（跌倒、胸痛、呼吸困難、暈眩、漏藥連續）→ 呼叫 `raise_alert(level, reason)` |
| F5 | **家屬通報** | 異常發生後 ≤10 秒送達家屬（LINE 或 Telegram 訊息，含原因與時間） |
| F6 | **家屬儀表板** | 即時顯示：今日健康項目卡片、警報列表（紅／黃）、對話摘要 |

### P1 加分（時間夠再做，依序）

| # | 功能 | 說明 |
|---|---|---|
| F7 | 對話後自動產生「今日摘要」 | 對話結束 → Gemini 產生 3 行摘要 + 心情／認知觀察，顯示於儀表板 |
| F8 | 7 天趨勢圖 | 睡眠時數、心情分數折線圖，展示「長期紀錄」價值 |
| F9 | 認知刺激小遊戲式對話 | 回憶往事、猜謎、今天日期／星期（同時是認知退化的軟性指標） |
| F10 | 未回應提醒 | 排程：某時段長輩沒互動 → 推播家屬（用 Cloud Scheduler 模擬） |

### 明確不做（Demo 範圍外）

- 真實穿戴裝置／血壓計串接（用對話自述 + 假資料補圖表）
- 帳號註冊、登入權限、多家庭多長輩
- 醫療診斷或用藥建議（Agent 僅記錄與通報，不給醫療結論）
- 台語 ASR 客製訓練、離線模式、原生 App
- 完整 HIPAA／個資合規實作（簡報提及，Demo 不做）

## 5. 技術選型（以 Google 生態系為主）

| 層級 | 選用 | 理由 |
|---|---|---|
| 語音對話核心 | **Gemini Live API**（native audio，模型如 `gemini-live-*`） | 單一連線完成 STT + LLM + TTS，低延遲、可打斷，支援 function calling，省掉三段式管線 |
| Agent 邏輯 | System prompt + **Function Calling**（`log_health`、`raise_alert`） | 「悄悄記錄」的關鍵：對話同時觸發工具，不打斷聊天 |
| 摘要／分析 | Gemini 2.x Flash（文字） | 對話結束後批次產生摘要與心情分析，便宜快速 |
| 長輩端前端 | 純 **Web（Vite + React／原生 JS）**，`getUserMedia` + WebSocket | 免安裝，平板打開網址就能 demo；單一大按鈕 UI，字體大 |
| 後端 | **Node.js（TypeScript）或 Python FastAPI** 部署於 **Cloud Run** | 代理 Gemini Live 連線（藏 API key）、執行 tool call、寫 DB、觸發通報 |
| 資料庫 | **Firestore** | 即時監聽（onSnapshot）讓儀表板無需輪詢；schemaless 適合黑客松快速迭代 |
| 家屬儀表板 | **React + Tailwind + Recharts**，Firebase Hosting | 手機優先，Firestore 即時更新 |
| 通報 | **LINE Messaging API**（push message）；備案 **Telegram Bot**（設定 5 分鐘） | 台灣家庭最貼近 LINE；LINE Notify 已停用，需用 Messaging API。備案確保現場不因審核卡關 |
| 排程（P1） | Cloud Scheduler → Cloud Run endpoint | 未回應提醒 |

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
      └── raise_alert 觸發 ──► LINE / Telegram push ──► 家屬手機
```

## 6. 資料模型（Firestore）

```
elders/{elderId}
  name, age, medications[], familyContacts[{name, lineUserId}]

elders/{elderId}/healthLogs/{logId}
  ts, type: "medication" | "sleep" | "mood" | "pain" | "meal" | "other"
  value: string | number
  note: 長輩原話摘錄
  sessionId

elders/{elderId}/alerts/{alertId}
  ts, level: "red" | "yellow", reason, sourceQuote, notified: boolean

elders/{elderId}/sessions/{sessionId}
  startedAt, endedAt, summary, moodScore
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
| 3 | LINE／Telegram 通報串接 | F5 |
| 4 | 家屬儀表板（即時卡片 + 警報列表） | F6 |
| 5 | 預錄假資料 7 天、摘要、趨勢圖、彩排 demo 腳本 | F7、F8 |

建議人力：1 人語音/後端、1 人儀表板前端、1 人 prompt 與腳本/簡報。

## 10. 風險與備案

| 風險 | 備案 |
|---|---|
| 現場網路／麥克風不穩 | 預錄一段完整 demo 影片；準備文字輸入模式當備援 |
| Gemini 中文辨識口音偏差 | 準備 demo 用台詞先行測試；prompt 加入常見詞彙 |
| LINE 通路設定卡關 | 直接切 Telegram Bot |
| Agent 亂給醫療建議 | Prompt 明確禁止；demo 前測試紅隊問法 |
| Live API 額度／延遲 | 預先申請額度；保留三段式備案（Speech-to-Text → Gemini → TTS） |

## 11. Demo 成功標準

- [ ] 現場一次對話跑完完整流程，無需手動干預
- [ ] 儀表板在對話中即時新增至少 3 筆健康紀錄
- [ ] 觸發異常後 ≤10 秒家屬手機收到通報
- [ ] 評審能在儀表板看到「長期紀錄」（7 天趨勢）
- [ ] 簡報能對應 v1 的痛點：照護人力缺口 → 一對多 → 社交刺激延緩退化
