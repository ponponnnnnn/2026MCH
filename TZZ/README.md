# TZZ — 實驗/研究歸檔

這個資料夾放所有還在討論階段的參考資料與測試結果，跟 `backend/`、`v2_mvp.md` 分開管理。已進版控（2026-09-20 起）。

## 目錄結構

```
TZZ/
├── standards/
│   └── elder-care-checklist-standards.md   健檢清單的協會依據（ICOPE + NIA + AGS）
├── research/                                4 個背景 workflow 查證的文獻研究
│   ├── topic-selection-hard-rules.md              話題轉換硬規則 R1-R15
│   ├── topic-selection-hard-rules-sources.json
│   ├── opening-moves-and-elder-concerns.md        開場硬規則 O1-O8 + 獨居長輩擔憂主題
│   ├── opening-moves-sources.json
│   ├── elder-concerns-themes.json
│   ├── question-bank-design-patterns.md           話題廣度×深度設計原則（含隱私依據）
│   ├── question-bank-sources.json
│   ├── onboarding-profile-building.md             首次認識長輩：建檔訪談設計原則 P1-P11
│   └── onboarding-profile-building-sources.json
└── tests/
    ├── demo-dialogues.md                    手寫示範對話（非盲測，用來檢查規則合不合理）
    ├── blind-persona-test-2026-09-19.md     真實盲測：Agent1設角色/Agent2演長輩/我當AI對答
    ├── elder-persona-blind-ground-truth.md  盲測用的隱藏長輩人設（讀檔前我完全沒看過）
    └── genai-eval-plan.md                   Gen-AI 評估測試計畫 T1-T10（只有計畫，尚未執行）
```

## 研究脈絡（依產生順序）

1. **健檢清單準則**（`standards/`）——現有 5 項清單(用藥/睡眠/飲食/疼痛/心情)沒有協會依據，查到 WHO ICOPE（偵測層六項）+ NIA/AGS（提醒層）。
2. **話題轉換硬規則 R1-R15**（`research/topic-selection-hard-rules.md`）——AI 怎麼判斷「何時換題／換到哪題／怎麼接過去」，依據 Schegloff、Jefferson、Miller&Rollnick 動機式晤談、Bickmore 陪伴機器人研究、Button&Casey、XiaoIce Topic Manager、Debra Fine/Celeste Headlee。
3. **開場硬規則 O1-O8 + 擔憂主題**（`research/opening-moves-and-elder-concerns.md`）——每次通話「第一句怎麼開」是跟中途換題不同的機制；同時查了論壇/新聞裡大家最擔心獨居長輩沒做好什麼(孤獨死、詐騙、居家安全、走失、拒絕長照)，發現現有清單完全沒碰財務/居家環境/失聯監測這幾個維度。
4. **話題廣度×深度設計原則**（`research/question-bank-design-patterns.md`）——參考《The Book of Questions》、Aron 36 Questions、WNRS 卡牌，歸納出「類別(廣度)×深淺遞進(深度)」兩個正交維度，並意外查到能回答隱私疑慮的三個依據（Petronio CPM理論、Irfan et al. 2024 陪伴機器人隱私警告、Wang et al. 2026 SP-Mem 脫敏架構）。
5. **示範對話**（`tests/demo-dialogues.md`）——手寫兩段對話檢查上述規則是否合理，示範跑出「詐騙電話系統接不住」這個缺口。
6. **盲測**（`tests/blind-persona-test-2026-09-19.md`）——真的找一個不知情的隱藏人設做通話測試，驗證出兩個新缺口：①長輩會用「面子話」掩蓋真實原因（忘記吃藥 vs 真的打不開藥罐）②敏感類別(詐騙/身體退化)直接問=矢口否認，需要先「去羞恥化」鋪墊。
7. **建檔/onboarding 訪談設計**（`research/onboarding-profile-building.md`）——現有 O/R 規則全部假設 AI 已經「認識」長輩；這份補上「AI 第一次認識長輩時，怎麼在自然對話中問出並記下稱謂/家人/興趣/生活基準值」，查了 CGA/OASIS-E intake、對話系統 slot-filling、新聞/customer discovery 訪談法、老年學志工手冊，整理出 P1-P11 設計原則，並誠實揭露「安全資訊優先 vs 敏感資訊延後」兩派文獻方向相反、baseline 天數僅能跨情境類比。
8. **Gen-AI 評估測試計畫**（`tests/genai-eval-plan.md`）——要向評審證明系統可靠，需要固定測試集、可重跑的評分、一張數字表。列出 T1-T10 十項測試（log_health 抽取、raise_alert 分級與延遲、F11 個人化語域、晚報忠實度、語音層、模擬長輩盲測、規則遵循、A/B 對照、安全抽測、人工聆聽），每項寫明資料、跑法、指標與方法依據。**目前只有計畫，沒有執行，沒有任何結果數字。** 文獻調查原訂 10 個面向只完成 7 個，其中 3 個經第二層查證，文件內有誠實標示。

## 目前已知、還沒寫成規則的缺口

- 面子話偵測：回答「合理但過度輕描淡寫」時，該追問具體機制而非停在表面。
- 去羞恥化鋪墊：詐騙/身體退化/拒絕協助這類敏感分類，禁止直接問句，需先正常化。
- 詐騙電話／居家環境安全／走失／失聯監測：完全不在現有健康清單、ICOPE、NIA/AGS 涵蓋範圍內，需要另一套機制（非話題內容問題，是新監測維度）。
- 三層架構（persona 檔 / 話題狀態+掛勾 / 對話記憶）尚未對應到實際 Firestore schema。
- 緊急聯絡人等安全攸關欄位該不該優先於興趣嗜好主動詢問，`onboarding-profile-building.md` P2 查到文獻方向相反，需要團隊自己拍板。
