import { getMessaging } from "firebase-admin/messaging";
import { config } from "./config.js";

export interface IncomingCallPayload {
  elderId: string;
  attemptId: string;
  callerName: string;
}

const TTL_MS = 60 * 1000;

/**
 * FCM 推播，觸發長輩手機 App 跳出來電畫面。
 * data 是 App 自己驗證、決定要不要響的內容；notification 是給 Android 系統用的——
 * App 在前景時系統不會顯示它（App 自己用 data 畫來電畫面），背景／被關掉時系統
 * 會自動用它跳出一般通知，點了才把 App 帶到前景，全程都在 App 內處理，
 * 沒有另外開一個系統來電畫面（之前用 flutter_callkit_incoming 就是這樣，
 * 接聽後跟 Flutter 畫面沒接好，殘留舊畫面又收不到觸控）。
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
    notification: {
      title: `${payload.callerName}來電`,
      body: "想跟您聊聊天，點一下接聽",
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
