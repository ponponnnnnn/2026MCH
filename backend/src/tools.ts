import { Type, type FunctionDeclaration } from "@google/genai";
import { config } from "./config.js";
import { elderRef, Timestamp, type AlertLevel, type HealthType } from "./firestore.js";
import { notifyFamily } from "./notify.js";
import { registerClarification, registerMetaphorFeedback, type ElderProfile } from "./profile.js";

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
];

export interface ToolContext {
  elderId: string;
  sessionId: string;
  /** F11：這通電話的個人化 Profile，原地修改，session 結束時由 live.ts 統一寫回 Firestore */
  profile: ElderProfile;
}

/** 執行工具，回傳給 Gemini 的 response 物件 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  // 這兩個工具只操作記憶體內的 profile，不需要 Firestore，
  // 放在 DEV_NO_DB 判斷之前，開發個人化邏輯不需要等 Firestore 接好
  if (name === "register_clarification") {
    registerClarification(ctx.profile, typeof args.topic === "string" ? args.topic : undefined);
    return { ok: true };
  }
  if (name === "register_metaphor_result") {
    registerMetaphorFeedback(ctx.profile, String(args.category ?? "未分類"), Boolean(args.understood));
    return { ok: true };
  }

  if (config.devNoDb) {
    console.log(`[tool:${name}] (DEV_NO_DB)`, JSON.stringify(args));
    return name === "raise_alert"
      ? { ok: true, note: "已通知家人，請安撫長輩" }
      : { ok: true };
  }
  const elder = elderRef(ctx.elderId);

  if (name === "log_health") {
    await elder.collection("healthLogs").add({
      ts: Timestamp.now(),
      type: (args.type as HealthType) ?? "other",
      value: String(args.value ?? ""),
      note: String(args.note ?? ""),
      sessionId: ctx.sessionId,
    });
    return { ok: true };
  }

  if (name === "raise_alert") {
    const level = (args.level as AlertLevel) ?? "yellow";
    const reason = String(args.reason ?? "");
    const quote = String(args.quote ?? "");
    const ref = await elder.collection("alerts").add({
      ts: Timestamp.now(),
      level,
      reason,
      sourceQuote: quote,
      notified: false,
      sessionId: ctx.sessionId,
    });
    // 只有紅色即時通報；黃色留待晚報（v2_mvp.md F5b）
    if (level === "red") {
      const elderDoc = await elder.get();
      const name = elderDoc.data()?.name ?? "長輩";
      const sent = await notifyFamily(
        ctx.elderId,
        `🚨 緊急通報｜${name}：${reason}`,
        `🚨 緊急通報｜${name}\n${reason}${quote ? `\n原話：「${quote}」` : ""}\n\n請盡快聯絡長輩確認狀況。`,
      );
      await ref.update({ notified: sent });
    }
    return { ok: true, note: "已通知家人，請安撫長輩" };
  }

  return { ok: false, error: `unknown tool: ${name}` };
}
