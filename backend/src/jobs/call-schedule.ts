import { config } from "../config.js";
import { db, elderRef, taipeiDate, taipeiDayStart, type Timestamp } from "../data/firestore.js";
import { readFcmTokens, removeTokens } from "../data/devices.js";
import {
  createAttempt,
  getTodayAttempts,
  markMissed,
  setPushed,
  type CallReason,
} from "../data/call-attempts.js";
import { sendIncomingCall } from "../push.js";
import { decideCall } from "./call-rules.js";

const MISSED_TIMEOUT_MS = 2 * 60 * 1000;
const DEMO_CALLBACK_DELAY_MS = 20 * 1000;

/**
 * 建立一筆響鈴嘗試 → 推播 → 回寫 pushed、清失效 token。
 * devNoDb → 不連 Firestore/FCM，回假的 attemptId 與 pushed:0。
 */
export async function ringElder(
  elderId: string,
  window: string,
  reason: CallReason,
  now: Date = new Date(),
): Promise<{ attemptId: string; pushed: number }> {
  if (config.devNoDb) {
    console.log(`[call-schedule] (DEV_NO_DB) ring elderId=${elderId} window=${window} reason=${reason}`);
    return { attemptId: `dev-${Date.now()}`, pushed: 0 };
  }

  const attemptId = await createAttempt(elderId, window, reason, now);

  let pushed = 0;
  try {
    const doc = await elderRef(elderId).get();
    const tokens = readFcmTokens(doc.data());
    const { sent, invalidTokens } = await sendIncomingCall(tokens, { elderId, attemptId, callerName: "小幫手" });
    pushed = sent;
    if (invalidTokens.length > 0) {
      await removeTokens(elderId, invalidTokens).catch((err) =>
        console.error(`[call-schedule] removeTokens 失敗 elderId=${elderId}`, err),
      );
    }
  } catch (err) {
    console.error(`[call-schedule] 推播失敗 elderId=${elderId} attemptId=${attemptId}`, err);
  }

  try {
    await setPushed(elderId, attemptId, pushed);
  } catch (err) {
    console.error(`[call-schedule] 回寫 pushed 失敗 elderId=${elderId} attemptId=${attemptId}`, err);
  }

  return { attemptId, pushed };
}

/**
 * Demo 專用：長輩第一次「真的聊過」的通話一結束（call/live.ts 收尾、含摘要寫入嘗試完成後
 * 才呼叫），等一小段時間後自動回撥一次，示範主動關懷、順便讓下一通接續上次話題。
 * 只在 DEMO_MODE 開啟時生效；只認 isFirstCall && elderSpoke 這一次——回撥打通的那通
 * isFirstCall 必為 false，不會再觸發，天然只回撥一次，不需要額外旗標防連環回撥。
 */
export function scheduleDemoCallbackIfFirstCall(info: {
  elderId: string;
  isFirstCall: boolean;
  elderSpoke: boolean;
}): void {
  if (!config.demoMode || !info.isFirstCall || !info.elderSpoke) return;
  console.log(
    `[call-schedule] (demo) ${DEMO_CALLBACK_DELAY_MS / 1000} 秒後自動回撥 elderId=${info.elderId}`,
  );
  setTimeout(() => {
    ringElder(info.elderId, "demo", "demo").catch((err) =>
      console.error(`[call-schedule] demo 自動回撥失敗 elderId=${info.elderId}`, err),
    );
  }, DEMO_CALLBACK_DELAY_MS);
}

interface ScheduleResult {
  checked: number;
  rang: { elderId: string; attemptId: string; reason: string }[];
  missed: { elderId: string; attemptId: string }[];
  skipped?: "DEV_NO_DB";
}

/** 每 15 分鐘由 Cloud Scheduler 呼叫：掃 elders 集合，先把逾時 ringing 標 missed，逐一 decideCall，要響的就 ringElder。 */
export async function runCallSchedule(now: Date = new Date()): Promise<ScheduleResult> {
  if (config.devNoDb) {
    return { checked: 0, rang: [], missed: [], skipped: "DEV_NO_DB" };
  }

  const rang: ScheduleResult["rang"] = [];
  const missed: ScheduleResult["missed"] = [];
  let checked = 0;

  const dateStr = taipeiDate(now);
  const todayStart = taipeiDayStart(dateStr);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const eldersSnap = await db.collection("elders").get();

  for (const doc of eldersSnap.docs) {
    const elderId = doc.id;
    checked++;
    try {
      const elderData = doc.data();

      const [attempts, sessionsSnap, alertsSnap] = await Promise.all([
        getTodayAttempts(elderId, dateStr),
        elderRef(elderId)
          .collection("sessions")
          .where("startedAt", ">=", todayStart)
          .where("startedAt", "<", todayEnd)
          .get(),
        elderRef(elderId).collection("alerts").where("ts", ">=", twentyFourHoursAgo).orderBy("ts", "desc").get(),
      ]);

      // 逾時 sweep：超過 2 分鐘仍 ringing 的先標 missed，並同步更新記憶體副本供 decideCall 使用
      for (const attempt of attempts) {
        if (attempt.status === "ringing" && now.getTime() - attempt.ts.toDate().getTime() > MISSED_TIMEOUT_MS) {
          try {
            await markMissed(elderId, attempt.id);
            attempt.status = "missed";
            missed.push({ elderId, attemptId: attempt.id });
          } catch (err) {
            console.error(`[call-schedule] markMissed 失敗 elderId=${elderId} attemptId=${attempt.id}`, err);
          }
        }
      }

      const sessionsToday = sessionsSnap.docs.map((d) => {
        const s = d.data();
        const startedAt = s.startedAt as Timestamp;
        const endedAt = s.endedAt as Timestamp | undefined;
        return { startedAt: startedAt.toDate(), endedAt: endedAt ? endedAt.toDate() : undefined };
      });
      const recentYellowAlert = alertsSnap.docs.some((d) => d.data().level === "yellow");

      const decision = decideCall({
        now,
        callWindows: elderData.callWindows,
        attemptsToday: attempts.map((a) => ({ window: a.window, reason: a.reason, status: a.status, ts: a.ts.toDate() })),
        sessionsToday,
        recentYellowAlert,
      });

      if (decision.ring) {
        const result = await ringElder(elderId, decision.window, decision.reason, now);
        rang.push({ elderId, attemptId: result.attemptId, reason: decision.reason });
      }
    } catch (err) {
      console.error(`[call-schedule] 長輩 ${elderId} 排程處理失敗`, err);
    }
  }

  return { checked, rang, missed };
}
