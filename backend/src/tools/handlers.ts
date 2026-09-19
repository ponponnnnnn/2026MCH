import { config } from "../config.js";
import { elderRef, Timestamp, type AlertLevel, type HealthType } from "../data/firestore.js";
import { notifyFamily } from "../notify.js";
import { registerClarification, registerMetaphorFeedback, type ElderProfile } from "../data/profile.js";
import {
  addConcern,
  addTopicHook,
  rememberFact,
  CONCERN_CATEGORIES,
  FACT_FIELDS,
  type ConcernCategory,
  type ElderFacts,
} from "../data/facts.js";

/** 工具參數來自模型輸出，跨信任邊界：非字串一律拒絕（避免物件被 String() 存成 "[object Object]"），
 *  字串則截斷、去頭尾空白，空字串一律拒絕 */
const MAX_TEXT_LEN = 200;
function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LEN);
}

export interface ToolContext {
  elderId: string;
  sessionId: string;
  /** F11：這通電話的個人化 Profile，原地修改，session 結束時由 call/live.ts 統一寫回 Firestore */
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

  // 這三個工具的輸入驗證（截斷、白名單、空值拒絕）放在 DEV_NO_DB 判斷之前，
  // 這樣在沒有 Firestore 憑證的機器上也能實際驗到驗證邏輯；devNoDb 時驗證通過只印 log、不寫入。
  if (name === "mark_topic_hook") {
    const entity = sanitizeText(args.entity);
    const context = sanitizeText(args.context);
    if (!entity || !context) return { ok: false, error: "entity/context 不可為空" };
    if (config.devNoDb) {
      console.log(`[tool:mark_topic_hook] (DEV_NO_DB)`, JSON.stringify({ entity, context }));
      return { ok: true };
    }
    await addTopicHook(ctx.elderId, { entity, context, mentionedAt: Timestamp.now(), sessionId: ctx.sessionId });
    return { ok: true };
  }

  if (name === "flag_uncovered_concern") {
    const summary = sanitizeText(args.summary);
    const quote = sanitizeText(args.quote);
    if (!summary || !quote) return { ok: false, error: "summary/quote 不可為空" };
    const categoryInput = typeof args.category === "string" ? args.category : "";
    const category: ConcernCategory = (CONCERN_CATEGORIES as string[]).includes(categoryInput)
      ? (categoryInput as ConcernCategory)
      : "other";
    if (config.devNoDb) {
      console.log(`[tool:flag_uncovered_concern] (DEV_NO_DB)`, JSON.stringify({ category, summary, quote }));
      return { ok: true };
    }
    await addConcern(ctx.elderId, { ts: Timestamp.now(), category, summary, quote, sessionId: ctx.sessionId });
    return { ok: true };
  }

  if (name === "remember_fact") {
    const field = typeof args.field === "string" ? args.field : "";
    // Object.hasOwn（不是 `field in FACT_FIELDS`）：`in` 會沿原型鏈查找，
    // "constructor"、"toString"、"__proto__" 這類原型屬性都會誤判為白名單內
    if (!Object.hasOwn(FACT_FIELDS, field)) return { ok: false, error: `unknown field: ${field}` };
    const value = sanitizeText(args.value);
    if (!value) return { ok: false, error: "value 不可為空" };
    if (config.devNoDb) {
      console.log(`[tool:remember_fact] (DEV_NO_DB)`, JSON.stringify({ field, value }));
      return { ok: true };
    }
    await rememberFact(ctx.elderId, field as keyof ElderFacts, value);
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
