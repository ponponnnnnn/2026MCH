# 情境

一支手機/平板 App 內建語音 AI，陪獨居／半獨居長輩「聊天」。現有四份研究（O1-O8 開場規則、R1-R15 話題選擇規則、Tier 深淺遞進模型、健康清單協會依據）全部有一個共同前提：**AI 已經「認識」這位長輩了**。O6 的安全開場話題清單需要「長輩已知的興趣嗜好」；R7 的社交輪需要「topic_hooks 話題掛勾庫（長輩過去提過的人名/嗜好/事件）」；O7 只處理首次通話「要先講目的、講通話時段」這個**儀式性序列**。沒有一條規則處理**內容層**：AI 要怎麼在對話中問出、並結構化記下——這位長輩是誰、家人是誰（緊急聯絡人）、平常興趣嗜好是什麼、生活習慣基準值（平常幾點睡、有沒有慢性病史、正在吃什麼藥、怎麼稱呼他/她、有沒有語言/口音偏好）。

`v2_mvp.md` §6 的 Firestore 資料模型把這些寫死成後台手動輸入欄位（`elders/{elderId}: name, age, medications[], familyContacts[{name, email}]`），不是對話產生的。R14/O7 只解決「沒有素材時聊什麼類別」，不解決「怎麼把長輩的基本資料問出來、記下來」。

# 為什麼需要這份規則（現有研究缺什麼）

這份文件要查的是同一個母題的另一個面向：現有 R 系列處理的是「健康清單怎麼自然問」（**張力＝自然對話 vs 結構化蒐集**），這次蒐集對象換成「基本資料/關係脈絡/生活基準值」，**同一個張力，不同的蒐集內容**。具體要回答三個現有研究完全沒碰的問題：

1. **要蒐集的欄位很多（姓名稱謂、家人與聯絡方式、興趣嗜好、生活習慣基準值、用藥史、語言/口音偏好），先問哪個、後問哪個？** 這不是 R6 的「風險權重」排序邏輯能直接套用的——建檔情境的信號可能是「哪個欄位對後續功能最急迫」（例如緊急聯絡人可能要優先於興趣嗜好，因為 `raise_alert` 依賴它），而不是風險高低。
2. **這些欄位要一次問完，還是分批蒐集？** 若要分批，依據什麼決定「這次問這個、下次問那個」？
3. **F4 異常偵測要判斷「跟平常不一樣」，前提是要有「平常是怎樣」的基準值（baseline）——AI 要怎麼在初期對話裡建立可靠的基準線，而不是等異常發生才回頭比對？**

以下規則就是查證「社工/居家照護/老年學/對話系統設計/訪談方法論」這幾個成熟領域怎麼處理「系統性地認識一個陌生人、同時不能讓對方感覺在被審問或填表」，並翻譯成可執行規則，供 system prompt 文字或 `backend/src/prompt.ts` 的工具邏輯落地。**先講清楚查證紀律的結論**：多數方法論來自社工／case management／對話系統／新聞採訪／customer discovery 領域，沒有一篇是針對「AI 陪伴獨居長輩、透過語音自然對話建檔」這個特定情境驗證過的，是跨情境類比推論，不是已證實有效的機制——這件事會在每條規則與結尾的「未能查證的部分」重複強調，不是一次性聲明就算了。

# 來源總覽

| 角色／作者／機構 | 書名／篇名 | 年份 | 查證狀態 |
|---|---|---|---|
| British Geriatrics Society | CGA Toolkit for Primary Care Practitioners | 2019 | 已查證（高）——官方 PDF 全文讀取 |
| CMS（Centers for Medicare & Medicaid Services） | OASIS-E Guidance Manual | 2023 生效 | 已查證（高，但範圍有限）——官方 PDF 讀取，確認無「興趣/稱謂」類欄位 |
| 美國聯邦法規 | 42 CFR §484.55 (Condition of participation: Comprehensive assessment of patients) | 現行 | 已查證（高）——Cornell LII 條文全文 |
| CMS | State Operations Manual Appendix B（居家照護機構稽核指引） | 現行 | 已查證（高，但僅佐證 §484.55 權威性，非一線 intake 腳本） |
| L. Z. Rubenstein 等 | CGA 經典期刊論文（JAGS, 1989/1991） | 1989/1991 | **未查證**——付費牆擋下，僅二手摘要，不採信 |
| NAHC（National Association for Home Care & Hospice） | "Getting it Right: Improved Intake Under PDGM" | 未知 | **未查證**——連結 404 |
| Daniel G. Bobrow 等（Xerox PARC） | GUS, A Frame-Driven Dialog System, *Artificial Intelligence* 8(2) | 1977 | 已查證（高）——原始論文全文讀取 |
| Daniel Jurafsky & James H. Martin | *Speech and Language Processing* (3rd ed. draft), Appendix K「Frame-Based Dialogue Systems」 | 2026-08-19 draft | 已查證（高）——Stanford 官方草稿全文讀取 |
| Amazon（Paul Cutsinger, Head of Alexa Voice Design Education） | "4 Must-Have Design Patterns for Engaging Voice-First User Interfaces" | 2018 | 已查證（高）——官方白皮書全文讀取 |
| Rasa | 官方文件：Forms（slot filling 機制） | 現行 | 已查證（高）——官方文件 |
| Jakob Nielsen | "Progressive Disclosure", Nielsen Norman Group | 2006 | 已查證（性質：UX 業界方法論，非學術實證） |
| Marketo / Oracle Eloqua | Progressive Profiling 官方產品說明 | 現行 | 已查證（性質：行銷科技業界方法論） |
| Fereshteh Murad, Geórgia Candello, Cosmin Munteanu | "What's The Talk on VUI Guidelines? A Report on the State of Practice", CUI '23 (ACM) | 2023 | 已查證（高）——作者版全文讀取，336 條準則系統性回顧 |
| Jess Thornhill（Voicebot.ai） | "Voice Design: A Guide to User Onboarding" | 2018 | 已查證（性質：業界部落格） |
| Google | Conversation Design guide（onboarding 專屬段落） | — | **未查證**——舊版頁面已 301 導回首頁 |
| Roy Peter Clark（Poynter Institute） | "12 basics of interviewing, listening and note-taking" | 2015／2023 插畫重製版 | 已查證（高）——機構官方訓練教材原文 |
| Robert A. Caro | *Working: Researching, Interviewing, Writing*,「Tricks of the Trade」章 | 2019 | 已查證（高信心間接引用——多篇獨立二手報導收斂到同一段逐字引文，未直接讀到原書掃描頁） |
| John Brady | *The Craft of Interviewing* | 1977 | **未查證**——Internet Archive 僅 metadata，全文 access-restricted |
| Rob Fitzpatrick | *The Mom Test* | 2013 | 已查證（高）——多句逐字引用交叉核對 |
| Steve Blank | Customer Development 方法論 | — | **未查證**——僅概念層級，抓不到具體機制段落 |
| Robert S. Weiss | *Learning from Strangers: The Art and Method of Qualitative Interview Studies* | 1994 | 部分查證——一句帶頁碼引文，具體「開場怎麼做」機制查無實據 |
| ORCATECH / OHSU | Life Lab 官方頁面 | 現行 | 已查證（僅描述性內容，無 baseline 天數機制） |
| （ORCATECH 研究群） | "Methodology for Establishing a Community-Wide Life Laboratory" (PMC6126551) | — | 已查證（高，監測領域清單，無 baseline 天數規定） |
| （研究群） | "Detecting Older Adults' Behavior Changes During Adverse External Events" (PMC12061350) | — | 已查證（高，基準採「同期比較」而非固定天數視窗） |
| Lee 等（University of Missouri / TigerPlace 傳統） | 老年行為標記研究, *JMIR mHealth and uHealth* | 2025 | 已查證（高，DOI 10.2196/56678，~1個月基準期） |
| Chang 等（University of Nebraska Medical Center） | "Counting Zs: Determining the Monitoring Days Needed to Obtain Reliable Sleep Metrics in Older Adults with MCI", *Behavioral Sleep Medicine* | 2026 | 已查證（高，最具體的量化基準天數來源） |
| Lau 等 | Sleep Advances (PMC10104388) | 2022 | 已查證（高，但研究對象為 21-40 歲成人，非長者，僅供類比） |
| （跌倒偵測相關專利文件） | Method/apparatus for fall detection | — | **未查證**——僅專利文件模糊提及「pre-operational period」，無具體天數 |
| NASW（National Association of Social Workers） | Standards for Social Work Case Management | 現行 | 已查證（高，讀到內容但**不支持**「安全資訊優先」假設） |
| CMSA（Case Management Society of America） | Standards of Professional Case Management Practice | 現行 | **未查證**——PDF 文字層解析受限，排序規則讀不到 |
| Merck Manual | Comprehensive Geriatric Assessment（臨床頁面） | 現行 | 已查證（讀到內容，確認無排序規則） |
| Michael C. Roberts & Allen J. Ottens | "The Seven-Stage Crisis Intervention Model", *Brief Treatment and Crisis Intervention* 5(4) | 2005 | 已查證（高——支持「安全評估優先」，但情境是危機介入非常規建檔） |
| SAMHSA | TIP 57《Trauma-Informed Care in Behavioral Health Services》 | 2014 | 已查證（高——方向與上者相反，支持「敏感資訊延後、先建立信任」） |
| Razavi 等 | "Discourse Behavior of Older Adults Interacting With a Dialogue Agent" (arXiv 1907.06279) | 2019 | **未查證**——唯一直接命中「對話式AI+長者+多次會談」情境的文獻，但排序機制原文讀不到，PDF 無法解析 |
| NYSOFA | 《Friendly Calls Program》Volunteer Manual（16頁）+ Provider Manual（33頁） | — | 已查證（高，全文讀取；本文件用於內容層，O7 已用於開場序列層，不重複） |
| The Guardianship Project / Vera Institute of Justice | Friendly Visitor Program Volunteer Handbook（18頁） | — | 已查證（高，全文讀取，含逐字引文） |
| Age UK | 電話陪伴（telephone befriending）志工手冊完整版 | — | **未完成查證**——時間限制內未取得逐字內容確認，僅先前研究已知的配對邏輯層級資訊（見 `opening-moves-and-elder-concerns.md`） |
| 香港嶺南大學 | 「齡活大使」訓練手冊 | — | **未完成查證**——時間限制內未取得確認 |

# 設計原則

## 甲、欄位蒐集的節奏與範圍（WHEN / HOW MUCH）

**P1｜分階段跨對話蒐集，不追求單次問完**
規則內容：長輩的基本檔案（稱謂、家人、興趣、生活習慣基準值、用藥史）**不應該設計成一次通話問完的清單**。建立一個「profile 欄位池」，每次通話只主動觸及 1-2 類尚未蒐集的新欄位（已蒐集欄位不重問），跨多次通話逐步補齊。
依據來源：British Geriatrics Society CGA Toolkit 明文「A thorough assessment may have to be split into more than one session or deferred, so initial prioritisation of the most relevant issues is important」且「the information would accumulate over time」；42 CFR §484.55 用制度化時間點落實同一精神（轉介後 48 小時內初評、開始照護後 5 個日曆天內完成綜合評估、每 60 天更新）；Nielsen「Progressive Disclosure」——「designs that go beyond 2 disclosure levels typically have low usability」；Marketo/Oracle Eloqua「staged mode」——「gives you control over which fields appear together and on which visit number they trigger」。
落地寫法：
```
profile_fields = {preferredName, familyContacts[], interests[], habitual_bedtime,
                   chronic_conditions, medications[], language_accent_pref, ...}
EACH session:
    unasked = [f for f in profile_fields if f.state == UNASKED]
    target_batch = pick_top_N(unasked, N=1~2)  // N 由產品端決定，本文件僅給「別一次問完」的方向
    本次通話僅主動觸及 target_batch，其餘欄位靠 P6 機會式命中
```

**P2｜安全攸關欄位 vs 其餘背景欄位的優先序——誠實揭露文獻衝突，不強行下定論**
規則內容：緊急聯絡人（`familyContacts`）在法規/CGA 文件裡被列為明確必收項目，但「該不該優先於興趣嗜好等背景資訊主動詢問」這件事，查到的一手文獻**方向互相衝突**，不提供單一答案：
- 支持「安全優先」：42 CFR §484.55 明文將「primary caregiver and their capabilities/availability」列為綜合評估必收類別；Roberts & Ottens 的七階段危機介入模型明講「Assessing lethality, first and foremost...」——安全/致命性評估排在建立關係與界定問題之前。
- 支持「敏感資訊延後、先建立信任」：SAMHSA TIP 57 明講「If the client initially denies a history of trauma (or minimizes it), administer the questionnaire later or delay additional trauma-related questions until the client has perhaps developed more trust in the treatment setting.」
依據來源：見上。
落地寫法：**這是決策點，不是確定規則**，建議團隊判斷「長照陪伴 AI」比較接近哪一種情境——危機介入模型的前提是案主已知處於急迫危機中，長照陪伴的日常初次建檔顯然更接近「建立長期信任關係」而非「立即評估風險」，因此**傾向不建議**把「請問您的緊急聯絡人是誰？」設計成第一次通話就主動列出的問句；但一旦長輩自己在對話中自然提到家人姓名（如「我女兒淑芬」），必須立刻用 P6 的機會式命中機制結構化記錄，不必等到正式排序輪到才問。若團隊評估產品風險（例如沒有緊急聯絡人就無法執行 `raise_alert`）大到不能接受「慢慢等長輩自己講」，可以選擇違反本條傾向、把它提前，但這是產品風險判斷，非文獻結論。

**P3｜欄位設計「先講意圖再講怎麼收」，作為 schema 設計原則**
規則內容：內部設計 profile 欄位時，每個欄位應標註「這個欄位要解決什麼下游功能需求」（例如 `familyContacts` 對應 `raise_alert` 的通知對象；`habitual_bedtime` 對應 F4 睡眠異常比對的基準值），而非憑空列一張「應該問的事」清單。這個「下游功能急迫度」可以作為 P1 欄位池優先序的訊號來源，取代健康清單 R6 用的「風險權重」邏輯——建檔情境排序的驅動力是「哪個欄位功能上更急迫」，不是「風險高低」。
依據來源：OASIS-E Guidance Manual 每個欄位固定用「Intent → Time Points → Item Rationale → Response-Specific Instructions → Coding Instructions/Tips → Examples」格式，設計邏輯是先講清楚「為什麼問這題」再講「怎麼問／怎麼記」。
落地寫法：`profile_fields` schema 每一欄位附一個 `downstream_use` 標註（例如 `familyContacts.downstream_use = "raise_alert 通知對象"`），P1 的 batch 挑選邏輯可以優先挑 `downstream_use` 已經被其他已完成功能依賴、但自身仍 `UNASKED` 的欄位。（`risk_weight` 換成 `downstream_urgency`，具體數值仍屬產品端決策，本文件僅提供邏輯依據。）

## 乙、怎麼問／語氣與句型機制（HOW）

**P4｜Exchange Model 語氣——長輩是自己生活的專家，不是被審查的資料來源**
規則內容：蒐集基本資料時，AI 的姿態應該是「跟長輩交換、傾聽長輩自己怎麼描述自己的生活」，而不是「主導議程、逐項確認清單」。所有基本資料問句一律用開放式問法，禁止封閉是非句。
依據來源：BGS CGA Toolkit 明確對比兩種模式——傳統醫療常用的「Questioning Model」（評估者主導提問議程、自居專家）vs 社工/護理界偏好的「Exchange Model」（長輩本人是自己生活情況的專家，雙方是共享的互動過程），並舉例用「how has this changed in recent weeks?」這類開放式問法取代是非題。
落地寫法：system prompt 補一句：「你不是在幫長輩『填資料』，是在認識一個人——蒐集到的資訊是長輩主動分享給你的，不是你單方面完成的任務。」所有 profile 相關問句禁止用「你有沒有 X」句型，改用「你平常都怎麼 X」「上次 X 是什麼時候」這類開放句型（與既有 R13 的開放式問句規則呼應，這裡補的是「態度框架」而非單純句型格式）。

**P5｜稱謂要問，不要猜或預設——補強 O7/O2**
規則內容：首次通話身分互認（O2）之後、進入其他話題之前，AI 應該明確詢問長輩希望被怎麼稱呼，並把答案寫入 profile，之後全程使用該稱謂，不使用猜測或預設的稱謂。
依據來源：The Guardianship Project (Vera Institute) Friendly Visitor Program Volunteer Handbook 逐字句：「ask them permission to address them by their first name rather than assume it」。
落地寫法：`if session_type == "first_call": sequence = [O1, O2(身分互認), ASK_PREFERRED_NAME, O3(問候), O4, O7(目的說明+通話時段), 話題開場]`——`ASK_PREFERRED_NAME` 是本文件對既有 O7 序列的**明確補位**，插在 O2 之後、其餘序列之前，因為這是後續所有互動都會用到的資訊，值得作為序列中唯一一個「例外的主動詢問」。

**P6｜敏感/家庭背景資料採機會式蒐集，不主動列成問題清單——複用既有 R5 機制**
規則內容：家人是誰、家庭關係這類背景資訊，**不建議**做成「第二輪固定詢問清單」主動逐項問；應該複用既有 R5（機會式命中優先於主動詢問）機制，只在長輩自己話語中自然帶出時才結構化記錄，命中對象從「健康清單槽位」擴充為「profile 欄位」。
依據來源：NYSOFA Friendly Calls Volunteer/Provider Manual 明文指示志工「避免討論健康狀況、財務、法律事務、家庭關係」——這與既有 O6 blocklist 邏輯呼應，本文件把它套用到「基本資料蒐集」情境：家庭背景不該是主動盤問的對象。
落地寫法：
```
FOR field IN {familyContacts, interests, chronic_conditions, language_accent_pref} WHERE field.state == UNASKED:
    IF 長輩本輪發言語意命中該欄位:
        field.state = COLLECTED
        寫入 profile[field]，同時寫入 topic_hooks（見「與既有規則銜接」）
        不生成對應問句
```
（`preferredName` 是 P5 的例外，`familyContacts` 的優先序另見 P2 決策點。）

**P7｜一次接住長輩自願提供的多個欄位，不逐一重問**
規則內容：長輩一輪發言可能同時透露多個欄位（例如「我女兒淑芬每兩週會來」同時命中 `familyContacts.name`、`familyContacts.relationship`、探視頻率），AI 應該一次性抽取並記錄全部，不要事後用問句逐一「確認」已經講過的資訊。
依據來源：Bobrow et al. (1977) GUS 論文的 mixed-initiative 設計——使用者一次答多個 slot（如城市+日期），系統直接填入不重複問；Amazon Alexa 官方設計白皮書明確反對「over-answer 被忽略或被重複問」，舉例：使用者提前說出「kayaking」，系統不該接著問「What would you like to do there?」。
落地寫法：長輩發言的實體/欄位抽取邏輯應該一次掃描出所有可命中欄位並全部寫入，而非逐欄位跑迴圈個別確認。

**P8｜Confirm-and-bridge 句型——確認已知資訊同時帶出下一欄位，複用既有 R9/R10**
規則內容：需要主動觸及 P1 batch 裡的欄位時，句型應該是「確認剛才聽到的資訊 + 用它橋接到下一個欄位」的複合句，而非把確認和提問拆成兩輪生硬對話。
依據來源：Jurafsky & Martin《Speech and Language Processing》Appendix K 的 confreq（confirm+request）對話行為，例句：「You are looking for a restaurant. What type of food do you like?」一句話同時確認已知資訊、又問下一項。
落地寫法：與既有 R9（錨點抽取＋樞紐句橋接）、R10（itemized news inquiry）共用同一橋接機制，範本：「原來你女兒是淑芬呀，那平常還有誰會常常來看你呢？」——這不是新機制，是把 R9/R10 的橋接句型明確擴充適用到 profile 欄位，不只是健康清單槽位。

**P9｜具體過去經驗題優先於假設性意願題**
規則內容：問生活習慣基準值類欄位時（例如平常幾點睡、平常吃什麼），優先用「問具體的上一次」句型，而非抽象的「你平常都…」泛問；長輩的客套/讚美式回答不能直接當作資料採信，需要追問具體事例。
依據來源：Rob Fitzpatrick《The Mom Test》——「Compliments are the fool's gold of customer learning」；好問題示範「Talk me through the last time that happened.」vs 壞問題示範「Would you pay X for a product which did Y?」。
落地寫法：`habitual_bedtime` 類欄位優先問法：「你昨天晚上大概幾點睡的呀？」而非「你平常都幾點睡覺呢？」——累積多次「上一次」的具體回答比一次性的「平常」自我報告更可信（這條同時是 P11 基準值累積機制的資料來源之一）。

**P10｜追問後留白，不要用沉默逼自己搶話**
規則內容：長輩回答後出現停頓時，AI 預設行為是等待，而不是自動追問下一題或立刻換話題。
依據來源：Roy Peter Clark（Poynter）——「Be patient. Don't break the silence with a new question.」；Robert Caro——「Silence is the weapon」，並自述用「SU（Shut Up）」筆記法提醒自己在等長輩自己補充時不要打斷。
落地寫法：ASR/VAD 層面允許較長停頓不視為「輪到 AI」的訊號。**誠實提醒（本文件的推論，非文獻直接建議）**：這條技巧的原始情境是面對面/電話真人訪談，語音 AI 介面上的「沉默」在長輩耳裡可能被誤認為斷線，套用時建議加一個極簡的「持續在線」訊號（例如低調的「嗯」），而不是完全靜默等待——原始文獻沒有處理這個電話/語音 AI 介面特有的風險，是本文件外推補上的但書。

## 丙、基準值（baseline）蒐集

**P11｜基準值需要跨多次對話累積，不能靠單次通話問到的數字當作「平常」**
規則內容：F4 異常偵測若要判斷「跟平常不一樣」（例如睡眠時數、情緒），前提是要有可信的個人基準值。建議至少累積 3-4 次通話中長輩自陳的同一欄位數值，才能把它當作可信基準線使用；長輩若表現出回答變異大或認知能力較弱的跡象，基準期應該拉得更長。
依據來源：ORCATECH Life Lab 核心方法論論文（PMC6126551）確認監測領域（行動力、生理功能、睡眠、用藥遵從、社交參與、認知功能）但**不給**具體基準天數；Chang et al.（2026, *Behavioral Sleep Medicine*，"Counting Zs"）用重複測量線性混合模型算出：認知正常長者只需 2-4 晚即可得穩定睡眠指標，**輕度認知障礙（MCI）長者需要更多天**（總睡眠時間 8-9 天、睡眠效率 6-7 天、入睡後清醒時間 6 天）；Lee et al.（2025, *JMIR mHealth and uHealth*）採約 1 個月的基準期做前後比較。
落地寫法：`baseline[field] = 尚未寫定的具體天數/次數，本文件僅給方向`；`IF collected_samples(field) >= MIN_SAMPLES: baseline_ready = true ELSE: F4 異常比對對此欄位降級為「觀察中，暫不觸發黃/紅旗」`；認知能力較弱或答案變異大的長輩，`MIN_SAMPLES` 應該調高（呼應 Chang et al. 「認知較弱者需要更長基準期」的方向，但天數本身無法直接移植，因為原始研究是居家感測器連續數據，不是對話自陳，見「未能查證的部分」第 9 點）。

# 與既有規則的銜接（O7、R14、topic_hooks 是取代、補充、還是不同層級）

**不取代任何既有規則，是插在「開場」與「話題選擇狀態機」之間的新中間層，外加對 topic_hooks 底層資料的補位。**

1. **跟 O7（首次通話開場序列）的關係——P5 是唯一的明確序列插入點，其餘是背景機制。** O7 處理的是「目的說明 → 通話時段 → 帶出第一個話題」的儀式性順序，本文件的 P5（稱謂詢問）應該插在 O2（身分互認）之後、O7 其餘步驟之前，因為稱謂是後續全程對話都要用到的資訊，值得當成序列裡唯一的例外主動詢問。除了 P5 之外，P1-P4、P6-P11 都**不是**要加進 O7 的固定順序裡，而是跨越整個「關係建立期」（可能是好幾通電話）持續運作的背景機制。

2. **跟 R5（機會式命中）與 R9/R10（橋接句型）的關係——複用，擴充命中對象，不是另立新機制。** P6（家庭背景機會式蒐集）與 P7（一次接住多欄位）本質上是把既有 R5 的「掃描長輩發言、命中就記錄，不用問句確認」機制，從「健康清單槽位」擴充到「profile 欄位」；P8（confirm-and-bridge）是把既有 R9/R10 的橋接句型，同樣擴充適用範圍。工程實作上，這代表 R5/R9/R10 的程式邏輯應該設計成可以同時操作兩組槽位（健康清單槽位 + profile 欄位槽位），而不是為 profile 另外寫一套平行的掃描/橋接程式碼。

3. **跟 R14（完全無錨點時的固定輪替 fallback）的關係——不同層級，但有一個操作上的觀察需要團隊注意。** R14 的前提是「已經認識這位長輩、只是這一輪沒有素材聊」，觸發後退回用藥/睡眠/飲食/疼痛/心情固定輪替。本文件處理的 profile 建檔，發生在關係更早期的階段（甚至可能發生在 R14 邏辯還沒被觸發過的第一通電話）。兩者不衝突，但有一個推論（非文獻結論，是本文件的操作觀察）：**全新長輩的前幾通電話，因為 topic_hooks 幾乎是空的，R14 fallback 的觸發機率預期會比熟悉的長輩更高**——這不代表 R14 設計錯誤，只是提醒團隊：新長輩的頭幾次通話，AI 聊天會顯得比較「制式」是正常現象，profile 欄位（尤其是興趣嗜好）蒐集得越多，可用的 topic_hooks 越多，R14 觸發率會自然下降。

4. **跟 topic_hooks 機制的關係——本文件的 P6/P7 是 topic_hooks 資料庫「怎麼被填進去」的機制之一。** R7 定義 topic_hooks 是「長輩過去提過的人名/嗜好/事件」，但沒說這個庫一開始怎麼被建立起來。本文件的 P6（機會式蒐集）與 P7（一次接住多欄位）產生的 profile 資料（家人姓名、興趣嗜好），應該**同時**寫入 profile 欄位與 topic_hooks 庫，兩者建議共用同一底層資料結構（例如同一個 `elder_facts` collection，profile 是其中被結構化標記為「基本資料」用途的子集，topic_hooks 是同一批資料被標記為「可用於社交輪開場」用途的視圖），而不是各自維護一份、事後再同步，避免兩邊資料不一致。

5. **跟 v2_mvp.md §6 Firestore 資料模型的關係——本文件不寫程式碼，但指出現有 schema 假設需要調整的方向。** 現有 `elders/{elderId}: name, age, medications[], familyContacts[{name, email}]` 把這些欄位當成後台手動輸入的靜態資料。本文件的規則若要落地，這幾個欄位需要能被對話寫入並逐步補齊（呼應 P1），且需要新增 P3 提到的欄位（`preferredName`、`interests[]`、`habitual_bedtime`、`chronic_conditions[]`、`language_accent_pref`）與各欄位的 `state`（UNASKED/COLLECTED，比照既有健康清單槽位狀態機）。這是產品/工程層的 schema 設計決策，本文件只指出研究依據，不代為決定最終欄位命名或資料庫結構。

# 未能查證的部分

1. **Rubenstein 等人 CGA 經典期刊論文（JAGS, 1989/1991）**——PubMed、Springer、ResearchGate 皆被付費牆擋下，只能讀到搜尋引擎摘要，未能實際讀到原文句子，不採信作為引用依據。
2. **NAHC「Getting it Right: Improved Intake Under PDGM」**——連結重新導向後回傳 404，且標題暗示內容可能是給付制度下的行政/計費 intake，未必是「認識病人」的訪談腳本，無法確認具體機制。
3. **沒有任何一手文獻明講「照護評估者該怎麼問話術才不像審問」的逐句腳本**——BGS 的 Exchange Model 是唯一查到的機制性線索，但也只是模型名稱與設計哲學，不是逐句話術範本。
4. **業界/學界沒有明確給出「語音助理初次互動最多該問幾個結構化問題」的具體數字門檻**——最接近的類比依據是 ACM CUI'23 論文引用的「選單一次呈現 4-9 個選項」認知負荷經驗法則，以及 Nielsen「不超過 2 層 disclosure」，但這些講的是選單/揭露層級，不是逐字驗證過的「欄位問題數」門檻，只能組合成設計推論，不是任一單一來源明講的規則。
5. **John Brady《The Craft of Interviewing》具體內文**——Internet Archive 全文 access-restricted，僅有書目 metadata，查無可引用內容。
6. **Steve Blank Customer Development 方法論的具體機制句子**——只查到「get out of the building」概念層級敘述，實際抓取官網內容時只有導覽列與影片嵌入，沒有具體訪談機制文字段落。
7. **Robert S. Weiss《Learning from Strangers》具體的「開場怎麼破冰」操作步驟**——只透過一份課程讀書筆記取得一句帶頁碼的直接引文（訪談者角色定位），查不到具體技巧清單本身，機制細節強度較弱。
8. **沒有查到任何專門處理「AI/機器人訪談陌生人、蒐集個人資料」情境的一手文獻，能直接對應新聞採訪/customer discovery/質性訪談這三套方法論的移植**。查到的鄰近文獻（如老年照護對話代理人的系統性文獻回顧 arXiv 2503.23153、使用 backchannel 技巧的認知篩檢對話代理人 TalkTive 等）處理的是「AI 陪伴/健康篩檢的對話設計」，不是「這三套人類訪談方法論怎麼被有意識地移植到 AI 場景」，這塊如果要做嚴謹，需要團隊自己補研究，不能假裝有現成一手文獻背書。
9. **Baseline 蒐集方法論全部是跨情境類比推論，沒有針對「對話自陳」蒐集方式驗證過**——ORCATECH/TigerPlace 系列研究用的是居家被動感測器的連續數據（動作感測、體重計、穿戴裝置），不是長輩口頭自陳的數字；P11 引用 Chang et al. 的「認知較弱者需要更長基準期」只能借用**方向**，無法直接移植**天數**本身。跌倒偵測基準期天數規定亦查無實據，只有專利文件模糊提及「pre-operational period」存在、無具體天數。
10. **欄位優先序邏輯查到的是兩派互相衝突的一手證據（見 P2），文獻本身沒有給出單一答案**——NASW、CMSA、BGS、Merck Manual 皆確認可跨多次會談累積蒐集，但都沒有給出「安全資訊 vs 背景資訊」誰先誰後的排序規則；危機介入模型與創傷知情照護模型方向相反，這個衝突本身就是本次查證最重要的誠實結論之一，不能各打五十大板假裝有共識。
11. **Razavi et al. (2019, arXiv 1907.06279)**——是唯一直接命中「對話式 AI + 長者 + 多次會談排序」情境的文獻（7-9 次會談、27 個主題依親密度/難度分三組），但 PDF 二進位無法解析、摘要頁也沒有方法論細節，排序機制本身未能從原文一手驗證，誠實標 `verified: false`，不能拿來當作「已驗證」的分級依據，只能當作「這個方向有人做過研究」的存在性佐證。
12. **CMSA Standards of Professional Case Management Practice**——官方 PDF 文字層解析受限，安全概念雖嵌入 case management 定義本身，但未讀到明確排序規則，不確定是「原文真的沒講」還是「工具解析限制沒讀到」，兩種可能都要誠實揭露。
13. **NYSOFA「Participant Intake Questionnaire」的實際欄位內容**——手冊本身確認這份表格存在，但作為另外寄送的附件，未收錄在公開 PDF 裡，所以「這份表格具體問哪些欄位」本身也查無實據，只能確認手冊明文排除健康/財務/法律/家庭關係當作志工主動詢問話題（用於 P6）。
14. **Age UK 電話陪伴志工手冊完整版、香港嶺南大學「齡活大使」訓練手冊**——這兩份因查證任務的時間限制未能完成確認，是本次五路查證裡唯一沒有跑到終點的一路，不確定裡面是否有更細節的「內容欄位層」指引，留待團隊或後續查證補上。
15. **整份框架的性質提醒（比照既有 `question-bank-design-patterns.md` 結尾的誠實態度）**：本文件引用的方法論橫跨 CGA/居家照護法規、對話系統工程、UX 業界方法論、新聞採訪、customer discovery、危機介入/創傷知情照護、居家感測老年學研究——沒有一篇是針對「AI 陪伴獨居長輩、透過語音自然對話建檔」這個特定情境直接驗證過的。這套框架應該被團隊當作「值得參考的設計假說」，不是「已證實對長輩有效的機制」；有餘裕的話應該找高齡照護/對話式 AI 領域更貼近情境的一手文獻做交叉驗證，尤其是「語音介面上的沉默解讀」（P10）與「基準值天數能否從被動感測器移植到對話自陳」（P11）這兩點，跨情境落差最大，風險也最高。
