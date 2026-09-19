import { elderRef, taipeiDate, Timestamp } from "./firestore.js";

export type CallReason = "window" | "retry" | "risk_boost" | "demo";
export type CallStatus = "ringing" | "answered" | "missed";

/** 存在 elders/{id}/callAttempts 集合，後端主動響鈴的每一次嘗試記錄 */
export interface CallAttempt {
  id: string;
  ts: Timestamp;
  date: string;
  window: string;
  reason: CallReason;
  status: CallStatus;
  pushed: number;
  answeredAt?: Timestamp;
  sessionId?: string;
}

function attemptsCollection(elderId: string) {
  return elderRef(elderId).collection("callAttempts");
}

/** 建立一筆響鈴嘗試，初始 status="ringing"、pushed=0；回傳新建的 attemptId。只在非 devNoDb 時被呼叫。 */
export async function createAttempt(
  elderId: string,
  window: string,
  reason: CallReason,
  now: Date,
): Promise<string> {
  const ref = await attemptsCollection(elderId).add({
    ts: Timestamp.fromDate(now),
    date: taipeiDate(now),
    window,
    reason,
    status: "ringing",
    pushed: 0,
  });
  return ref.id;
}

/** 回寫成功送達的裝置數。只在非 devNoDb 時被呼叫。 */
export async function setPushed(elderId: string, attemptId: string, pushed: number): Promise<void> {
  await attemptsCollection(elderId).doc(attemptId).update({ pushed });
}

/** 通話建立後標成 answered 並寫入 sessionId。只在非 devNoDb 時被呼叫。 */
export async function markAnswered(
  elderId: string,
  attemptId: string,
  sessionId: string,
  now: Date,
): Promise<void> {
  await attemptsCollection(elderId).doc(attemptId).update({
    status: "answered",
    answeredAt: Timestamp.fromDate(now),
    sessionId,
  });
}

/** 逾時（超過 2 分鐘仍是 ringing）標成 missed。只在非 devNoDb 時被呼叫。 */
export async function markMissed(elderId: string, attemptId: string): Promise<void> {
  await attemptsCollection(elderId).doc(attemptId).update({ status: "missed" });
}

/** 讀某位長輩今天（台北）的 attempts。只在非 devNoDb 時被呼叫。 */
export async function getTodayAttempts(elderId: string, dateStr: string): Promise<CallAttempt[]> {
  const snap = await attemptsCollection(elderId).where("date", "==", dateStr).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CallAttempt, "id">) }));
}
