import { FieldValue } from "firebase-admin/firestore";
import { elderRef } from "./firestore.js";

const MAX_TOKEN_LEN = 4096;

/** token 必須是字串，trim 後長度 1–4096；不合法回 null */
export function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_TOKEN_LEN ? trimmed : null;
}

/** 從 elder 文件資料安全取出裝置 token 陣列；型別不符（非字串陣列）一律視為空 */
export function readFcmTokens(elderData: Record<string, unknown> | undefined): string[] {
  const tokens = elderData?.fcmTokens;
  return Array.isArray(tokens) && tokens.every((t) => typeof t === "string") ? (tokens as string[]) : [];
}

/** 註冊裝置 token（arrayUnion 寫進 fcmTokens）；先確認 elder 文件存在，不存在回傳 false。只在非 devNoDb 時被呼叫。 */
export async function registerDevice(elderId: string, token: string): Promise<boolean> {
  const ref = elderRef(elderId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.set({ fcmTokens: FieldValue.arrayUnion(token) }, { merge: true });
  return true;
}

/** FCM 回報失效的 token，從 fcmTokens 清掉。只在非 devNoDb 時被呼叫。 */
export async function removeTokens(elderId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await elderRef(elderId).update({ fcmTokens: FieldValue.arrayRemove(...tokens) });
}
