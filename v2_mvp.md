# AI 語音長照 Agent — Demo MVP 定義

> 延伸自 `v1_md`。本文件只定義「Demo 現場要跑得起來的最小範圍」：哪些必做、哪些不做、用什麼做。
> 呈現形式：**手機 App（Flutter，以 Android 為主）**。Flutter 為單一程式碼，iOS 為選配（需 Mac＋Xcode，本專案不列入必做）。Demo 在電腦上進行：畫面投影到電腦螢幕，方式見 §3.1。

## 1. MVP 一句話

**能講話 → 講話過程中悄悄記下健康資料 → 每晚固定推送「本日狀況報告」給家屬 → 家屬 App 看得到（緊急異常例外：立即推送）**

Demo 要證明的三件事：
1. 長輩覺得是在「聊天」，不是在填表（陪伴 + 主動式提問）
2. 健康資料是從對話中自動結構化出來的（不用人工輸入）
3. 家屬每晚固定時間（預設 20:00）收到一份「本日狀況報告」；若遇紅色緊急事件，不等晚上、立即通報（降低照護空窗期）

## 2. 使用者與角色

同一個 App，開啟時選擇身分（MVP 不做登入，選擇後記在本機）：

| 角色 | App 內的介面 | 要做的事 |
|---|---|---|
| 長輩（獨居／半獨居） | 「長輩模式」：一個超大按鈕的語音畫面，大字、高對比、可開關字幕 | 點一下開始講話，其餘全靠語音 |
| 家屬（壯世代） | 「家屬模式」：儀表板（今日健康卡片、警報、對話摘要、歷史報告） | 看今日狀態、回看對話摘要；收晚報與緊急警報（Gmail 信件） |

Demo 建議**兩個畫面同時展示**：A 是長輩模式（講話），B 是家屬模式（即時出現資料）。做法見 §3.1。只有一個畫面時，用「切換身分」按鈕輪流展示。

不做：照服員端、多長輩管理後台（僅在簡報中說明「一對多」擴充方向）。

## 3. Demo 主流程（3 分鐘腳本）

1. 長輩模式：點「跟小幫手聊聊」，Agent 語音問候（台語腔國語／繁中口語）
2. 閒聊中 Agent 穿插主動提問：「今天有吃藥嗎？」「昨晚睡得好嗎？」「有沒有哪裡不舒服？」
3. 長輩回答，家屬模式儀表板**即時**出現：藥物 ✅、睡眠 5 小時、心情偏低
4. 長輩說「剛剛頭有點暈，差點跌倒」→ Agent 溫柔追問細節並安撫
5. 若為紅色緊急（如跌倒）→ 家屬 Gmail 信箱立即收到警報信（手機收到信件通知）；黃色／一般事項不即時打擾，留待晚報
6. 到了晚上報告時間（Demo 用家屬 App 內的按鈕手動觸發模擬 20:00）→ 家屬 Gmail 信箱收到「本日狀況報告」信
7. 家屬打開 App 家屬模式：看到今日健康時間軸、異常事件、對話摘要

### 3.1 電腦上的 Demo 環境（Android）

Demo 在電腦上進行，評審看電腦螢幕。有兩種畫面來源，建議**混合使用**：

| 畫面 | 來源 | 做法 |
|---|---|---|
| 長輩模式（會發出聲音、收聲音） | **Android 真機**，用 USB 接電腦，以 **scrcpy** 把手機畫面投影到電腦螢幕（加 `--no-audio`，聲音留在手機） | 語音品質與回音行為最接近真實使用；手機戴耳機或放在桌上 |
| 家屬模式（只看資料） | **Android Studio 模擬器**，直接顯示在電腦上 | 不涉及麥克風，穩定；同時可開電腦上的信箱畫面展示 Gmail 警報與晚報 |

備案：
- 只有電腦時，長輩模式也可以在 Android 模擬器跑（模擬器使用電腦麥克風與喇叭）。**電腦喇叭加電腦麥克風會嚴重回音**，此時必須戴耳機。
- 兩個模擬器無法同時開太多，電腦效能不足時，家屬模式改用 Gmail 信件加 Firebase Console 的資料畫面展示。

## 4. 功能範圍

### P0 必做（沒有就不成立 demo）

| # | 功能 | 驗收標準 |
|---|---|---|
| F1 | **即時語音對話** | 長輩講話，Agent 在 ~1 秒內語音回應，可被打斷，繁體中文流暢；App 內完成麥克風串流與語音播放 |
| F2 | **主動式健康提問** | System prompt 內含問診清單（用藥、睡眠、飲食、疼痛、心情），Agent 自然穿插而非罐頭審問 |
| F3 | **對話中結構化記錄** | Agent 透過 function calling 呼叫 `log_health(type, value, note)`，資料寫入資料庫 |
| F4 | **異常偵測** | 規則：紅旗關鍵字／描述（跌倒、胸痛、呼吸困難、暈眩、漏藥連續）→ 呼叫 `raise_alert(level, reason)`，紅／黃分級並寫入 DB |
| F5 | **每日晚間狀況報告** | 每晚固定時間（預設 20:00，可設定）由排程觸發：彙整當日 healthLogs + alerts + 對話 → Gemini 產生報告 → 以 Gmail 寄信給家屬（內容見 §6.1） |
| F5b | **紅色緊急即時通報** | 僅 `red` 級別立即推送（≤10 秒），黃色與一般紀錄只進晚報，避免過度打擾 |
| F6 | **家屬儀表板（App 內）** | 即時顯示今日健康卡片、警報列表（紅／黃）、對話摘要；晚報信件提示打開 App 查看詳細內容 |

### P1 加分（時間夠再做，依序）

| # | 功能 | 說明 |
|---|---|---|
| F7 | 歷史報告列表 | 家屬 App 可回看過去每一天的晚報 |
| F8 | 7 天趨勢圖 | 睡眠時數、心情分數折線圖，展示「長期紀錄」價值 |
| F9 | 認知刺激小遊戲式對話 | 回憶往事、猜謎、今天日期／星期（同時是認知退化的軟性指標） |
| F10 | 當日未互動提示 | 晚報產生時若長輩整天沒對話，報告首行標示「今日尚未互動」，並可提前推播 |

### 明確不做（Demo 範圍外）

- 真實穿戴裝置／血壓計串接（用對話自述 + 假資料補圖表）
- 帳號註冊、登入權限、多家庭多長輩
- 醫療診斷或用藥建議（Agent 僅記錄與通報，不給醫療結論）
- 台語 ASR 客製訓練、離線模式
- 上架 Google Play／App Store（Demo 以 Android 模擬器、真機直接安裝或 APK 展示）
- iOS 版本（Flutter 可延伸，但需 Mac＋Xcode，本次不做）
- App 背景常駐收音、Agent 主動開口（僅在使用者點開通話時對話）
- App 內推播（FCM）：緊急與晚報通知先靠 Gmail，FCM 列為未來擴充
- 完整 HIPAA／個資合規實作（簡報提及，Demo 不做）

## 5. 技術選型（以 Google 生態系為主）

| 層級 | 選用 | 理由 |
|---|---|---|
| 語音對話核心 | **Gemini Live API**，模型 **`gemini-3.8-live`**（Stable） | 單一連線完成 STT + LLM + TTS，低延遲、可打斷；官方定位為低延遲語音 Agent 預設選擇，支援非同步 function calling 與繁體中文。備選：`gemini-3.8-live-extended-thinking`（穩定但延遲較高）。舊版 `gemini-3.1-flash-live-preview` 官方建議升級，不採用。模型 ID 與計價以官方文件為準，開發前用 API key 實測可用 |
| Agent 邏輯 | System prompt + **Function Calling**（`log_health`、`raise_alert`） | 「悄悄記錄」的關鍵：對話同時觸發工具，不打斷聊天。記錄文字一律繁體中文 |
| 晚報生成 | Gemini 2.x Flash（文字，結構化輸出 JSON） | 彙整當日資料產生報告：整體狀態、各項指標、異常、對話摘要、明日建議關心重點 |
| **手機 App（長輩＋家屬）** | **Flutter（Dart）**，**Android 為主**（最低 Android 版本以套件需求為準，建議 Android 8.0／API 26 以上） | 單一程式碼；只需 Android Studio 即可開發，不需 Xcode；模擬器即時預覽；日後可擴充 iOS；UI 元件豐富，適合做大字大按鈕與儀表板 |
| App 錄音 | **`record`**（`startStream`，PCM16、16kHz、單聲道，開啟 `echoCancel`、`noiseSuppress`） | 直接取得原始 PCM 串流，剛好符合後端要的上行格式；系統層回音消除降低「自己打斷自己」 |
| App 播放語音 | **`flutter_pcm_sound`**（餵 24kHz PCM16）；備案 `flutter_soloud` 或 `flutter_sound` | 專為串流 PCM 播放設計，可在被打斷時立即清空緩衝。套件實際表現需在 POC 階段驗證 |
| 音訊工作階段 | **`audio_session`**（Android 語音通訊模式、預設走喇叭；藍牙耳機切換） | 同時錄音與播放的必要設定，否則收不到聲音或音量極小；iOS 延伸時再補 `playAndRecord` |
| 權限與螢幕 | `permission_handler`（麥克風）、`wakelock_plus`（通話中螢幕不鎖） | 通話時螢幕鎖定會中斷收音 |
| 連線 | `web_socket_channel`（連後端 `wss://…/ws`，斷線自動重連） | 與現有後端協定相同：binary 傳 PCM、文字傳 JSON 事件 |
| 家屬儀表板資料 | **`cloud_firestore`（FlutterFire）** 直接 `snapshots()` 即時監聽 | 免自己做推送通道，App 端即時更新；資料寫入仍全部由後端負責 |
| 圖表 | `fl_chart` | 7 天睡眠、心情趨勢（F8） |
| 狀態管理 | Riverpod（或 Provider，團隊熟哪個用哪個） | 輕量，MVP 夠用 |
| 後端 | **Node.js（TypeScript）** 部署於 **Cloud Run**（**已實作，見 `backend/`**） | 代理 Gemini Live 連線（藏 API key）、執行 tool call、寫 DB、觸發通報。**App 端不放任何 API key** |
| 資料庫 | **Firestore** | 即時監聽讓家屬 App 無需輪詢；schemaless 適合黑客松快速迭代 |
| 通報 | **Gmail 寄信**：Nodemailer + Gmail SMTP（`smtp.gmail.com:465`）＋「應用程式密碼」 | 不用申請任何審核、5 分鐘可通，收件人只需填 email；適合每日一封的晚報。需求：寄件 Gmail 開啟兩步驟驗證後產生 16 碼應用程式密碼（密碼存環境變數／Secret Manager，不進 git）。限制：個人 Gmail 每日約 500 封上限，Demo 綽綽有餘；紅色警報靠信件推播通知，速度略慢於即時通訊軟體。可升級：Gmail API（OAuth）或 Workspace SMTP relay |
| 排程（P0） | **Cloud Scheduler** → Cloud Run `POST /jobs/daily-report`（每日 20:00，時區 Asia/Taipei） | 觸發晚報；Demo 現場用家屬 App 內按鈕觸發（見下方說明） |
| 開發／測試輔助 | 後端內建網頁測試頁（`backend/public/index.html`）；**scrcpy**（手機畫面投影到電腦） | 不靠 App 也能驗證後端與 Gemini 語音；scrcpy 讓評審在電腦螢幕看到真機畫面 |

**Demo 用「立即產生晚報」按鈕：** App 不能內建排程密鑰（`x-job-secret`）。後端另開一個僅 Demo 啟用的 endpoint（例如 `POST /demo/daily-report`，由環境變數 `DEMO_MODE=1` 開關，正式環境關閉），App 按鈕呼叫它。

### 架構圖

```
 ┌───────────────┐                         ┌───────────────┐
 │ Android 真機    │                         │ Android 模擬器  │
 │ 長輩模式        │                         │ 家屬模式        │
 │ 麥克風/喇叭     │                         │ 儀表板/圖表     │
 └───────┬───────┘                         └───────▲───────┘
         │ WebSocket (wss)                          │ Firestore
         │ 上行 16kHz PCM / 下行 24kHz PCM           │ snapshots() 即時
         ▼                                          │
 Cloud Run 後端 ───────► Gemini Live API            │
      │  ▲               （語音對話 + tool call）     │
      │  └── tool call: log_health / raise_alert    │
      ▼                                             │
  Firestore ────────────────────────────────────────┘
      │
      ├── raise_alert(red) ──► Gmail 即時寄信 ──► 家屬信箱／手機通知
      │
 Cloud Scheduler (每晚 20:00) ─► Cloud Run /jobs/daily-report
      └── 彙整當日資料 → Gemini 產生報告 → Gmail 寄信 ──► 家屬信箱
```

### 專案結構

```
長照/
├── backend/              Node.js 後端（已實作）
│   └── public/           網頁測試頁（開發用）
├── app/                  Flutter App（待建立）
│   └── lib/
│       ├── main.dart            進入點、身分選擇（長輩／家屬）
│       ├── core/                websocket、音訊（錄音/播放）、Firestore 服務、設定
│       ├── features/elder/      長輩模式：大按鈕通話畫面、字幕
│       └── features/family/     家屬模式：今日卡片、警報、摘要、歷史、趨勢
└── v2_mvp.md
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
  startedAt, endedAt, summary, moodScore, transcript[]

elders/{elderId}/dailyReports/{yyyy-mm-dd}
  generatedAt, overall: "normal" | "watch" | "alert"
  metrics: {medication, sleep, mood, meals, pain}
  events[]（當日異常）, summary, followUps[], text, sent: boolean
```

**存取規則（App 直接讀 Firestore，必須設定）：** `elders/demo/**` 只開放讀取，禁止任何用戶端寫入；寫入僅由後端（Admin SDK，不受規則限制）執行。Demo 階段可用匿名登入或直接允許讀取單一示範長輩；`sessions.transcript` 含完整對話，若不想讓家屬端直接讀取，可將 sessions 集合設為僅後端可讀，家屬只看摘要。

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
📱 請開啟「長照小幫手」App（家屬模式）查看詳細儀表板
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
- 記錄與通報的文字一律繁體中文，數值忠實反映長輩所說，不自行推測
- 對話結尾固定總結：「今天聊得很開心，記得按時吃藥喔」
- 紅旗詞觸發後不再追問細節過久，優先確認安全

## 9. App 畫面清單

| 模式 | 畫面 | 內容 |
|---|---|---|
| 共用 | 身分選擇 | 兩個大按鈕：「我是長輩」「我是家屬」；設定內可切換身分 |
| 長輩 | 通話畫面 | 一個超大「跟小幫手聊聊」按鈕；通話中顯示聆聽／說話動畫、「結束通話」；字幕開關；螢幕保持亮起 |
| 家屬 | 今日總覽（F6） | 整體狀態燈號、用藥／睡眠／心情／飲食／疼痛卡片、今日對話摘要 |
| 家屬 | 警報列表（F6） | 紅／黃警報，含時間、原因、長輩原話 |
| 家屬 | 歷史報告（F7，P1） | 依日期列出過去晚報 |
| 家屬 | 趨勢（F8，P1） | 7 天睡眠與心情折線圖 |
| 家屬 | Demo 工具 | 「立即產生晚報」按鈕（僅 Demo 模式顯示） |

## 10. 分工與時程建議（黑客松 48h／可壓縮）

| 階段 | 工作 | 產出 |
|---|---|---|
| 1 | **Flutter 語音 POC**（最高風險，最先做）：錄音串流 → 後端 → Gemini → 語音播放，先在 **Android 真機**驗證回音、音量、延遲 | F1 |
| 2 | 後端 System prompt 與兩個 function call 寫入 Firestore（後端已有骨架，接上真實 Firestore） | F2、F3、F4 |
| 3 | Gmail 寄信串接（產生應用程式密碼、寄出測試信；紅色即時通報） | F5b |
| 4 | 每日晚報：彙整邏輯 + Gemini 產生 + Scheduler + Demo 按鈕 endpoint | F5 |
| 5 | 家屬模式畫面（今日卡片 + 警報列表，接 Firestore 即時監聽） | F6 |
| 6 | 預錄假資料 7 天、歷史報告、趨勢圖、彩排 demo 腳本 | F7、F8 |

建議人力：1 人 Flutter 語音（長輩模式）、1 人 Flutter 儀表板（家屬模式）、1 人後端／prompt／簡報。

## 11. 風險與備案

| 風險 | 備案 |
|---|---|
| 手機錄音／播放（音訊格式、取樣率）卡關 | 階段 1 最先驗證；備援：用後端網頁測試頁展示語音，App 只展示家屬端 |
| 回音：小幫手聲音被麥克風收回去，造成自己打斷自己（Android 回音消除品質依手機型號而異） | 開啟 `echoCancel`；在 Demo 用的那支手機上提前實測；建議戴有線／藍牙耳機；若用模擬器，電腦喇叭與麥克風同機必須戴耳機 |
| Android 音訊工作階段設定錯誤（無聲、音量小、藍牙耳機沒切換） | 使用 `audio_session` 設定語音通訊模式並預設走喇叭；提前在真機測 |
| 麥克風權限被拒、來電或通知中斷通話 | 首次進入先說明再請求權限；Demo 前手機開勿擾模式；中斷後畫面提示重新開始 |
| 開發時 App 連不到後端（Android 9 以上預設禁止 `ws://` 明文） | 開發用 ngrok／Cloud Run 的 `wss://`；或在 Android 設定 `usesCleartextTraffic` 暫時例外，正式與 Demo 一律 `wss://`。模擬器連本機後端用 `10.0.2.2`，真機用電腦區網 IP |
| Xcode 無法安裝（系統版本），無法做 iOS | 以 Android 為主；iOS 列為選配，由團隊中有可用 Mac 的成員另行驗證 |
| 模擬器的麥克風與真機行為不同 | 語音最後一定要用 Android 真機驗證；模擬器用於畫面與儀表板 |
| scrcpy 投影延遲或斷線 | Demo 前先測試 USB 連線與轉接頭；備案：改在模擬器展示，或直接拿手機對著鏡頭展示 |
| 不同 Android 手機音訊表現不一 | Demo 只用同一支已彩排過的手機，不現場換機 |
| 現場網路／麥克風不穩 | 預錄一段完整 demo 影片；準備文字輸入模式當備援 |
| Gemini 中文辨識口音偏差 | 準備 demo 用台詞先行測試；prompt 加入常見詞彙 |
| Gmail 被擋（應用程式密碼失效／被判定垃圾信） | 提前寄測試信並請收件人加入通訊錄；備案：改用 Gmail API（OAuth）或其他寄件帳號 |
| Firestore 規則過寬導致資料外洩 | Demo 前把規則收斂到只讀示範長輩；App 內不放任何金鑰 |
| Agent 亂給醫療建議 | Prompt 明確禁止；demo 前測試紅隊問法 |
| Live API 額度／延遲 | 預先申請額度；保留三段式備案（Speech-to-Text → Gemini → TTS） |

## 12. Demo 成功標準

- [ ] App 在 Android 真機（長輩模式）＋電腦畫面（家屬模式）完整跑完一次對話流程，無需手動干預
- [ ] Demo 用的那支手機已在同樣環境彩排 3 次以上
- [ ] 長輩模式：點一下就能通話，Agent 語音清楚、可被打斷、無明顯回音
- [ ] 家屬模式在對話中即時新增至少 3 筆健康紀錄
- [ ] 觸發紅色異常後 ≤10 秒家屬手機收到即時通報信
- [ ] 按下「立即產生晚報」後 ≤15 秒家屬手機收到完整本日報告，內容與當天實際對話一致
- [ ] Cloud Scheduler 已設定每晚 20:00 自動觸發（簡報可展示設定畫面）
- [ ] 評審能在家屬 App 看到「長期紀錄」（7 天趨勢）
- [ ] 簡報能對應 v1 的痛點：照護人力缺口 → 一對多 → 社交刺激延緩退化
