# 情境

一支手機/平板 App 內建語音 AI，陪獨居／半獨居長輩「聊天」，但每次對話其實要蒐集固定的健康資訊——用藥、睡眠、飲食、疼痛、心情（系統內建的健康檢查清單，對應現有架構中的 `log_health(type, value, note)` 五類：medication／sleep／diet／pain／mood）。長輩不能感覺到自己在被審問或填表。

現有 system prompt（`v2_mvp.md` §8）已定義的是**語氣／風格規則**：溫暖、慢、短句、先陪伴後提問、每輪最多問一題、對話結尾固定總結、紅旗詞觸發後優先確認安全。這些已經足夠，本文件不重複。

缺的是：AI 要怎麼「找到」下一個該問的健康主題、怎麼從長輩剛講的話『自然接到』下一題，而不是憑感覺亂問——也就是**話題選擇與話題橋接的決策程序**，而非語氣。

# 為什麼需要這份規則（現有 prompt 缺什麼）

現有 prompt 回答了「問的時候態度要怎樣」，但完全沒回答以下三個決策問題，導致模型只能憑訓練直覺亂猜，猜錯就會露出「審問感」：

1. **何時該換題**：長輩已經回答（或帶過）目前這題，AI 怎麼判斷「這題到此為止，該換下一項」，而不是問完等答案、答完再問下一題的機械式輪替？
2. **換到哪一題**：健康清單有五項，長輩剛才的話可能已經自然透露了某一項，也可能一項都沒透露；到底該優先問哪一項、哪些已經算「問過了」，現有 prompt 完全沒有優先序邏輯。
3. **怎麼接過去**：換題時如果直接丟出跟前一句話毫無關聯的新問題（例如長輩剛講完孫子來吃飯，AI 突然問「你今天有吃藥嗎？」），即使語氣溫暖，結構上仍是斷裂式轉換，長輩仍會感覺被打斷、被審問。

以下規則就是把①②③翻譯成可執行的條件判斷／優先序／狀態機／橋接手法，補在既有語氣規則之上，供 system prompt 文字或 `backend/src/prompt.ts` 的工具邏輯落地。

# 來源總覽（表格：角色/作者/書名/年份/查證狀態）

| 角色／作者 | 書名／篇名 | 年份 | 查證狀態 |
|---|---|---|---|
| Emanuel A. Schegloff | *Sequence Organization in Interaction*, Vol. 1, Ch. 8「Topic-proffering sequences」 | 2007 | 已查證（高） |
| Gail Jefferson | "On Stepwise Transition from Talk about a Trouble to Inappropriately Next-Positioned Matters"（收錄於 Atkinson & Heritage 編，*Structures of Social Action*, pp. 191–222） | 1984 | 已查證（高）；原文為掃描 PDF 無法直接讀取全文，機制描述以多篇後續會話分析文獻交叉核對 |
| William R. Miller & Stephen Rollnick | *Motivational Interviewing: Helping People Change*（第 3 版）／2023 年第 4 版更名為 *Helping People Change and Grow* | 2013／2023 | 已查證（高） |
| Stephen Rollnick, William R. Miller, Christopher C. Butler | *Motivational Interviewing in Health Care: Helping Patients Change Behavior* | 2008／2023（第2版） | 已查證（高）；Agenda Mapping 的具體步驟框在 SAMHSA TIP 35 中直接引用的母書其實是同作者群 2013 年版，非本書，引用時建議註明 |
| SAMHSA（Substance Abuse and Mental Health Services Administration） | Treatment Improvement Protocol (TIP) Series 35, Ch. 3 | 2019（修訂版） | 已查證（高），官方公開臨床操作化指引 |
| Timothy W. Bickmore, Lisa Caruso, Kerri Clough-Gorr, Timothy Heeren | "It's Just Like You Talk to a Friend": Relational Agents for Older Adults, *Interacting with Computers* 17(6) | 2005 | 已查證（高）；第二作者正確姓名為 Lisa Caruso（非 Laura） |
| Graham Button & Neil Casey | Topic Nomination and Topic Pursuit, *Human Studies* 8: 3–55（姊妹篇：Generating Topic: The Use of Topic Initial Elicitors，收錄於 Atkinson & Heritage 編，*Structures of Social Action*, pp. 167–190） | 1985（姊妹篇 1984） | 已查證（高） |
| Li Zhou, Jianfeng Gao, Di Li, Heung-Yeung Shum | The Design and Implementation of XiaoIce, an Empathetic Social Chatbot, *Computational Linguistics* 46(1) | 2020 | 已查證（高） |
| Debra Fine | *The Fine Art of Small Talk* | 2005 | 已查證（高）；原始出版社為 Hyperion（非 Hachette，後者為 2023 修訂版），技巧名為 FORM（非坊間常誤傳的 FORD） |
| Celeste Headlee | *We Need to Talk: How to Have Conversations That Matter* | 2017 | 已查證（高） |

# 硬規則

## 狀態機總覽（供下列各條規則對照）

```
每個健康清單槽位 slot ∈ {medication, sleep, diet, pain, mood}
每個槽位狀態 ∈ {UNASKED, PROFFERED, EXPAND, CLOSED, COLLECTED}

IDLE（開放閒聊）
  → 掃描長輩剛才發言，抽取錨點詞（實體/情緒/時間/人物）
  → 掃描是否已機會式命中某個 UNASKED 槽位 → 命中則標記 COLLECTED，不進 PROFFERED
  → 依優先序挑一個 UNASKED 槽位 → 用錨點造橋句 → 轉入 PROFFERED(slot=X)
  → 若抽不到錨點 → 留在 IDLE，用通用開放式探詢語，下輪再試

PROFFERED(slot=X)
  → 長輩回覆分類：
      展開型（新細節/情緒/具體內容）→ EXPAND(slot=X)
      最小回應/帶過型（單字、「還好」「沒事」、被岔開）→ CLOSED(slot=X)，不重問

EXPAND(slot=X)
  → 可再追問 1 輪同槽位細節，呼叫 log_health，之後 → COLLECTED，回 IDLE

CLOSED(slot=X)
  → 標記未取得，回 IDLE，優先序中移除本輪嘗試過的槽位（本輪內不再問，下次對話可重試）
```

紅旗詞觸發時（既有 F4 異常偵測規則）：**中斷本狀態機，優先權最高**，直接進入既有 `raise_alert` 流程，本文件規則全部讓位——這是與既有規則的介面縫合，不是新研究發現。

---

## 甲、何時該換題（WHEN）

**R1｜話題提案的偏好反轉——展開才追問，帶過就收手**
規則內容：健康清單題是一次「話題提案（topic proffer）」。長輩若給出**展開型回應**（含細節/情緒/具體內容）→ 判定為「偏好回應」，AI 可再追問 1 輪同一槽位並記錄；若給出**最小回應/帶過型**（單字、「還好」「沒事」、話題被岔開）→ 判定為「非偏好回應」，**該槽位立即關閉，本輪禁止重問或逼問**。
依據來源：Schegloff (2007)，*Sequence Organization in Interaction* Ch. 8——preferred responses engender expansion, dispreferred responses engender sequence closure。
落地寫法：
```
IF elder_reply(slot=X) matches [單字/「還好」「沒事」「都一樣」/話題被岔開]:
    slot[X].state = CLOSED; slot[X].collected = false
    禁止本輪對 X 再發問
ELSE IF elder_reply(slot=X) 含新實體詞/情緒詞/具體描述:
    slot[X].state = EXPAND
    允許再追問 1 次 X 的細節，並呼叫 log_health(X, value, note)
```
system prompt 文字：「當長輩對你剛問的健康問題只回一個字、說『還好』『沒事』或明顯不想多談時，**不要追問或换句話重問同一件事**，把這件事記為『這次問不到』，自然帶開話題。」

**R2｜換題觸發的三訊號，不是每輪都判斷要不要換**
規則內容：不要求 AI 每輪都評估「要不要換話題」，只在下列三個訊號**任一出現**時才觸發換題判斷：(1) AI 本輪因無話可接而只能講場面話；(2) AI 的回覆只是在複述長輩的話、沒有新資訊；(3) 長輩的輸入連續變得敷衍（如「喔」「嗯」「好」）。
依據來源：Li Zhou et al. (2020)，XiaoIce Topic Manager §4.1.3 二元分類器的 3 個 indicator features。
落地寫法：
```
IF (本輪AI無有效內容可接) OR (AI回覆只是複述長輩輸入) OR (連續2輪長輩回覆≤3字元):
    觸發「尋找下一話題」流程（見 R5/R6）
ELSE:
    留在目前話題繼續閒聊或追問
```

**R3｜開放問題後強制反映比例——禁止連續兩輪都在提問**
規則內容：每問完一個開放式健康問題後，AI 接下來至少 1 輪回應必須是「反映式傾聽」（複述/延伸長輩剛講的內容），**不可以連續兩輪都是提問**（無論是否為清單題）。
依據來源：Miller & Rollnick (2013/2023)；SAMHSA TIP 35 Ch. 3「Question-and-Answer Trap」——"Ask one open question, and follow it with two or more reflective listening responses."
落地寫法：
```
consecutive_question_count（連續提問輪數計數器）
IF consecutive_question_count >= 1:
    本輪強制輸出「反映句」（複述/延伸長輩上一句），不得再是問句
    consecutive_question_count = 0
ELSE IF 本輪為問句:
    consecutive_question_count += 1
```
system prompt 文字：「問完一個問題後，下一輪不可以再直接問下一題，先把長輩剛剛說的話講回去一遍或延伸一句（例如『喔～原來是這樣』），再考慮要不要問下一個。」

**R4｜紅旗優先權覆蓋（規則銜接，非新研究）**
規則內容：紅旗詞（跌倒、胸痛、呼吸困難、暈眩等，見既有 F4）出現時，R1–R15 全部暫停，直接進入既有 `raise_alert` 流程；紅旗事件處理完後才回到本狀態機的 IDLE。
依據來源：與 v2_mvp.md 既有 F4 規則銜接，非文獻查證項目。
落地寫法：`IF 偵測到紅旗詞: 忽略本文件所有話題狀態機規則，優先執行 raise_alert()`

---

## 乙、換到哪一個主題（WHICH）

**R5｜機會式命中優先於主動詢問**
規則內容：每輪先掃描長輩剛才的話是否已經命中某個「尚未蒐集」槽位的關鍵字/語意（例如提到「昨晚沒睡好」→命中 sleep）。命中就直接標記該槽位 `COLLECTED`（並呼叫 `log_health`），**不必再用問句確認**；只有完全沒命中時才進入主動發問流程。
依據來源：Rollnick, Miller & Butler (2008/2023) 的 Agenda Mapping「opportunistic fill」；Bickmore et al. (2005) 的使用者事實庫機制。
落地寫法：
```
FOR slot IN {medication, sleep, diet, pain, mood} WHERE slot.state == UNASKED:
    IF 長輩本輪發言語意命中 slot 的關鍵詞/描述:
        slot.state = COLLECTED
        log_health(slot, extracted_value, elder原話)
        不生成對應問句
```

**R6｜剩餘未命中槽位依風險權重排優先序**
規則內容：R5 掃描後仍有未蒐集槽位時，依「風險權重」（而非熱門度/新鮮度）排序，選權重最高者作為下一個話題提案（PROFFERED）候選。風險權重建議：距上次成功蒐集時間越久、或該項過去曾記錄異常，權重越高。
依據來源：Miller & Rollnick 的 Focusing 決策優先序（主題已明確 > 候選主題競爭 > 主題不明，且以風險/線索優先於機構既定順序）；概念上對應 XiaoIce 的候選話題 ranker，但排序特徵替換為健康風險而非娛樂熱門度。
落地寫法：
```
candidates = [slot for slot in checklist if slot.state == UNASKED]
sort candidates by risk_weight(slot) descending
next_target = candidates[0] if candidates else None
```
（risk_weight 的具體數值屬產品端決策，本文件僅提供決策程序，不代為訂定權重表。）

**R7｜任務輪與社交輪交錯排程——健康清單題不得連續兩輪出現**
規則內容：清單題（任務move）之間至少要插入 1 輪社交/回憶輪（關係move）。社交輪優先從「話題掛勾庫」中挑一個尚未用過的掛勾起頭——掛勾庫是長輩過去對話中自己提到的人名、嗜好、事件等，隨對話持續累積。
依據來源：Bickmore, Caruso, Clough-Gorr, Heeren (2005)，relational agent 的任務move/社交move交錯排程與使用者揭露事實庫。
落地寫法：
```
topic_hooks: [{entity, mentioned_turn, used: false}, ...]  // 持續累積
IF 上一輪已問過清單題:
    本輪禁止再問清單題，改為：
        IF topic_hooks 中有 used=false 的項目:
            用該掛勾開啟社交輪，標記 used=true
        ELSE:
            開放式閒聊 1 輪
```

**R8｜策略性保留——對話尾聲強制補問剩餘槽位**
規則內容：當對話輪數/時間預算接近上限（建議：剩餘輪數 ≤ 總預算的 20%）而清單仍有 `UNASKED` 槽位時，不再等待長輩自然帶出，改為依 R6 優先序主動提出剩餘最高風險項目。
依據來源：Rollnick, Miller & Butler 的 Agenda Mapping「策略性保留」機制。
落地寫法：`IF turn_budget_remaining <= 0.2 * turn_budget_total AND 存在 UNASKED 槽位: 強制觸發 R9 橋接流程，鎖定風險權重最高的 UNASKED 槽位`

---

## 丙、怎麼從剛講的話接過去（HOW）

**R9｜錨點抽取＋樞紐句橋接，禁止斷裂式轉換**
規則內容：換題時**禁止**直接丟出一句跟前文毫無關聯的新問題。規則：Step 1 從長輩上一輪發言抽取至少 1 個「錨點」（具體名詞/時間/動作/人物/地點）；Step 2 用該錨點造一句同時掛在舊話題與新清單項目之間的「樞紐句」；Step 3 若完全抽不到錨點，退回中性開放式閒聊（見 R11），不強行橋接，下一輪再試。
依據來源：Gail Jefferson (1984)，stepwise transition / pivotal utterance——區分 disjunctive（斷裂式）與 stepwise（逐步式）話題轉換。
落地寫法：
```
anchor = extract_anchor(elder_last_utterance)  // 名詞/動作/人物/地點
IF anchor exists:
    生成 pivot 句：同時提及 anchor 與 next_target（R6 選出的槽位），例：
    「{anchor}真好～對了，{next_target對應的自然問法}」
ELSE:
    跳到 R11（fallback）
```
system prompt 文字：「換到下一個健康主題前，先從長輩剛剛講的內容裡抓一個具體的詞（人、事、時間、地點），用這個詞把新問題接過去，不要憑空丟出一個無關的新問題。」

**R10｜itemized news inquiry 句型包裝清單題**
規則內容：有錨點時，清單題用「itemized news inquiry」句型包裝——承認自己只掌握部分資訊、邀請對方多說（如「這讓我想到你剛提到的…，後來呢？」），把清單題偽裝成延續對方的話，而非新開一題。
依據來源：Button & Casey (1985)，Topic Nomination and Topic Pursuit。
落地寫法：橋接句模板 = `「這讓我想到你剛說{anchor}，{next_target對應開放式問句}」`

**R11｜無錨點時的通用探詢語 fallback（topic-initial elicitor）**
規則內容：當長輩本輪完全沒提供任何可用錨點時，不強行套用清單題，改用通用、不指定內容的開放式探詢語（如「最近過得還好嗎？」）先換取素材，下一輪再嘗試 R9。
依據來源：Button & Casey (1984)，"Generating Topic: The Use of Topic Initial Elicitors"。
落地寫法：`IF anchor is None: 輸出通用開放式問句，本輪不觸發任何清單題`

**R12｜topic pursuit 停止條件——對方帶過就不追問，直接切下一項**
規則內容：拋出清單題後，若長輩接話延伸（news announcement）→ 繼續追問同一項（對應 R1 EXPAND）；若一句帶過（no-news report）→ 判定此槽位本輪問不下去，停止追問，直接切下一個候選槽位（對應 R1 CLOSED），不得在同一槽位上死纏爛打。
依據來源：Button & Casey (1985)，topic pursuit vs. no-news report。
落地寫法：與 R1 共用同一組判斷條件，本規則補充「停止並切換」的具體動作：`IF slot.state == CLOSED: next_target = 從 R6 candidates 中移除已試過的 slot 後重新選取`

**R13｜錨點反應式生成優先於固定腳本；一律用開放式問句**
規則內容：下一題不得來自「預先寫死的固定順序腳本」，必須先嘗試從長輩上一輪回覆抽取錨點反應式生成（R9）；且清單問題一律用 5W1H 開放式問句呈現，不用 yes/no 問句（紅旗安全確認例外，如「會不會痛」可用是非句）。
依據來源：Celeste Headlee (2017)，*We Need to Talk*——"Go with the flow" 規則與一律開放式問句規則。
落地寫法：`生成問題前檢查：問題是否以 who/what/when/where/why/how 開頭？IF 否 AND 非紅旗安全確認: 重新生成為開放式問句`

**R14｜完全無錨點的最終 fallback——固定清單輪替**
規則內容：當連續多輪（建議：連續 2 輪以上）都抽不到任何錨點、且已用完 R11 的通用探詢語仍無素材時，退回固定候選類別輪替（本專案：用藥→睡眠→飲食→疼痛→心情，依 R6 優先序），避免 AI 陷入沉默或迴圈。此為優先序最低的最後一層 fallback。
依據來源：Debra Fine (2005)，*The Fine Art of Small Talk*，FORM 話題輪替法（Family/Occupation/Recreation/Miscellaneous 的固定候選類別機制，替換為本專案的五類健康主題）。
落地寫法：`IF 連續2輪 anchor is None AND R11已使用: next_target = R6優先序最高的UNASKED槽位，直接以中性語氣提出，不強求橋接句`

**R15｜橋接句尾請求許可，再收斂到清單題**
規則內容：橋接句的尾端可加一個徵求同意的短句（如「順便問一下，可以嗎？」）再收斂到清單題，而非直接以問句形式切入。
依據來源：Miller & Rollnick / Rollnick, Miller & Butler，Agenda Mapping 的請求許可句型。
落地寫法：清單題完整模板 = `{R9/R10橋接句} + 「順便問一下，」 + {R6選出的槽位對應的開放式問法}`

# 未能查證或建議進一步查證的部分

1. **Jefferson (1984) 原文全文未能直接讀取**——UCSB LISO archive 存放的 PDF 為掃描檔，WebFetch 僅取得二進位影像流，無法逐字核對原文。本文件 R9 的 pivotal utterance 機制描述是交叉核對多篇引用此文獻的後續會話分析論文得出，非原文逐字引用；若正式文件需要逐字引用，建議另尋可讀 OCR 版本或圖書館掃描本人工核對。
2. **Rollnick, Miller & Butler (2008/2023) 與 Agenda Mapping 的引用鏈落差**——SAMHSA TIP 35 Exhibit 3.7 的具體步驟框直接引用的母書是 Miller & Rollnick (2013)《Helping People Change》第三版，並非 R8/R15 標註的 2008/2023 門診版；本書真實存在且內容相符（Agenda Mapping 概念確實貫穿其整體方法論），但若要主張「兩層獨立來源交叉驗證」，較精確的寫法是「同一學派兩本書＋官方臨床指引採用」，而非兩本互相獨立驗證。
3. **Bickmore et al. (2005) 第二作者姓名誤植**——正確為 Lisa Caruso，非 Laura Caruso，正式引用前請更正。
4. **Debra Fine 書籍的技巧名稱與版本資訊**——原書技巧為 FORM（Family/Occupation/Recreation/Miscellaneous），坊間常見的「FORD（…Dreams）」為誤傳版本，不應採用；2005 年原始版出版社為 Hyperion，Hachette 僅適用於 2023 修訂版，引用時請用正確版本。
5. **Button & Casey (1984) 姊妹篇書名誤植**——正確書名為《Structures of Social Action》，並非常見誤寫的《Structures of Social Interaction》。
6. **查證過但因與「決策/優先序」機制關聯度較低而未列入硬規則依據的候選文獻**（若後續需要更多對話系統設計細節可再深挖）：Xing, Wu, Wu, Liu, Huang, Zhou & Ma (2017)《Topic Aware Neural Response Generation》，AAAI（偏生成層而非決策層）；Alexa Prize socialbot 相關論文（狀態機＋bot-initiative 策略方向吻合，但尚未逐段核對原文細節）；Justine Coupland 編《Small Talk》(2000)（功能性案例集，非結構性機制）；Malinowski 的 phatic communion 概念（現象定義而非可操作機制）。
7. **本文件所有具體數字門檻**（例如 R2 的「連續2輪≤3字元」、R8 的「剩餘輪數≤20%」、R14 的「連續2輪無錨點」）是研究者將文獻中的質性描述（minimal response、perfunctory、strategic reservation）轉譯為可執行條件時建議的起始值，文獻本身並未給出這些精確數字，正式導入前建議以實際對話資料校準測試。
8. **R4（紅旗優先權覆蓋）** 屬於本文件規則與既有 F4 異常偵測規則的介面縫合說明，不在本次文獻查證範圍內，僅供實作時參考排序。