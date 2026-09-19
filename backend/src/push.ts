import { getMessaging } from "firebase-admin/messaging";
import { config } from "./config.js";

export interface IncomingCallPayload {
  elderId: string;
  attemptId: string;
  callerName: string;
}

const TTL_MS = 60 * 1000;

/**
 * data-only FCM 推播，觸發長輩手機 App 跳出來電畫面。
 * devNoDb 只印 log、回 {sent:0, invalidTokens:[]}；tokens 為空不呼叫 FCM。
 */
export async function sendIncomingCall(
  tokens: string[],
  payload: IncomingCallPayload,
): Promise<{ sent: number; invalidTokens: string[] }> {
  if (config.devNoDb) {
    console.log(`[push] (DEV_NO_DB) incoming_call`, JSON.stringify({ tokens: tokens.length, ...payload }));
    return { sent: 0, invalidTokens: [] };
  }
  if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      type: "incoming_call",
      elderId: payload.elderId,
      attemptId: payload.attemptId,
      callerName: payload.callerName,
    },
    android: { priority: "high", ttl: TTL_MS },
  });

  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      invalidTokens.push(tokens[i]);
    }
  });

  return { sent: res.successCount, invalidTokens };
}
