import { Type, type FunctionDeclaration } from "@google/genai";
import { CONCERN_CATEGORIES, FACT_FIELDS } from "../data/facts.js";

const FACT_FIELD_KEYS = Object.keys(FACT_FIELDS);

/** 宣告給 Gemini Live 的工具（規格見 v2_mvp.md §7，含 F11 個人化語域四訊號） */
export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "log_health",
    description:
      "長輩提到用藥、睡眠、飲食、疼痛或心情時呼叫，記錄健康資料。悄悄記錄，不要向長輩複誦或告知。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["medication", "sleep", "mood", "pain", "meal", "other"],
          description: "健康項目類別",
        },
        value: { type: Type.STRING, description: "數值或狀態，例如 '已服藥'、'5' (睡眠小時)、'偏低'" },
        note: { type: Type.STRING, description: "長輩原話摘錄" },
      },
      required: ["type", "value"],
    },
  },
  {
    name: "raise_alert",
    description:
      "偵測到異常時呼叫。red: 跌倒、胸痛、呼吸困難、意識不清、求救。yellow: 頭暈、連續漏藥、連續睡眠不足、情緒明顯低落。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        level: { type: Type.STRING, enum: ["red", "yellow"] },
        reason: { type: Type.STRING, description: "異常原因簡述" },
        quote: { type: Type.STRING, description: "長輩原話" },
      },
      required: ["level", "reason"],
    },
  },
  {
    name: "register_clarification",
    description:
      "長輩說「這是什麼意思」「聽不懂」「再說一次」等表示沒聽懂的話時呼叫，用來記錄目前語彙對這位長輩太難。不需要口頭告知長輩你呼叫了這個工具。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "聽不懂的主題，例如藥名或當下在講的內容，用簡短固定的詞彙描述以便跨次對話比對（例如都用「血壓藥服用方式」而非每次換句話說）" },
      },
      required: ["topic"],
    },
  },
  {
    name: "register_metaphor_result",
    description:
      "當你用某種比喻（例如機械保養、烹飪、農務、教學等類型）解釋完一件事之後，依對方接下來的反應呼叫這個工具回報：如果對方沒有追問、順著往下聊或表示理解，understood 填 true；如果對方追問或表示不懂，understood 填 false。不需要口頭告知長輩你呼叫了這個工具。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: "這次使用的比喻類型，用簡短固定的詞彙描述（例如「機械保養類比」「烹飪類比」），以便同類型比喻的分數可以累加",
        },
        understood: { type: Type.BOOLEAN, description: "對方是否聽懂了這次的比喻說明" },
      },
      required: ["category", "understood"],
    },
  },
  {
    name: "mark_topic_hook",
    description:
      "長輩自己提到的人名、嗜好、事件、計畫時呼叫，記下來供下次通話開場當話題。不要口頭告知長輩你記了這個。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        entity: { type: Type.STRING, description: "掛勾的主體，例如人名、嗜好、事件" },
        context: { type: Type.STRING, description: "簡短補充，例如發生的事、細節" },
      },
      required: ["entity", "context"],
    },
  },
  {
    name: "flag_uncovered_concern",
    description:
      "聽到健康項目清單以外的擔憂時呼叫：可疑電話或詐騙、用火用瓦斯等居家安全問題、出門迷路走失、太熱太冷卻不開冷暖氣、拒絕看護或居家長照服務、家裡堆積髒亂沒整理。記下類別、一句摘要、長輩原話。不要口頭告知長輩你記了這個，不要判斷是不是詐騙，不要說教。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, enum: CONCERN_CATEGORIES, description: "擔憂類別" },
        summary: { type: Type.STRING, description: "一句話摘要" },
        quote: { type: Type.STRING, description: "長輩原話" },
      },
      required: ["category", "summary", "quote"],
    },
  },
  {
    name: "remember_fact",
    description:
      "長輩提到稱謂、家人、興趣、作息、慢性病、自己說在吃的藥等基本資料時呼叫，記下來供之後通話個人化使用。不要口頭告知長輩你記了這個。",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: { type: Type.STRING, enum: FACT_FIELD_KEYS, description: "要記錄的欄位" },
        value: { type: Type.STRING, description: "內容" },
      },
      required: ["field", "value"],
    },
  },
];
