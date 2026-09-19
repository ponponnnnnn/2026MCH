import { taipeiDate, taipeiDayStart } from "../data/firestore.js";
import type { CallReason, CallStatus } from "../data/call-attempts.js";

export const DEFAULT_CALL_WINDOWS = ["09:00", "19:00"];
const WINDOW_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** callWindows 解析：不是陣列、空陣列、或任一項不是合法 "HH:mm" 就整組退回預設 */
export function parseCallWindows(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_CALL_WINDOWS;
  const allValid = raw.every((w) => typeof w === "string" && WINDOW_PATTERN.test(w));
  return allValid ? (raw as string[]) : DEFAULT_CALL_WINDOWS;
}

export interface CallRuleAttempt {
  window: string;
  reason: CallReason;
  status: CallStatus;
  ts: Date;
}

export interface CallRuleSession {
  startedAt: Date;
  endedAt?: Date;
}

export interface DecideCallInput {
  now: Date;
  /** elder 文件頂層的 callWindows 原始欄位，格式驗證與預設值在這裡處理 */
  callWindows: unknown;
  attemptsToday: CallRuleAttempt[];
  sessionsToday: CallRuleSession[];
  /** 最近 24 小時內是否有 yellow 警報，由呼叫端算好傳入（純函式不查資料） */
  recentYellowAlert: boolean;
}

export type DecideCallResult =
  | { ring: false }
  | { ring: true; window: string; reason: "window" | "retry" | "risk_boost" };

const WINDOW_DURATION_MS = 60 * 60 * 1000;
const RETRY_GAP_MS = 15 * 60 * 1000;
const MAX_RINGS_PER_WINDOW = 3;
const RISK_BOOST_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const RISK_BOOST_IDLE_MS = 6 * 60 * 60 * 1000;

/**
 * 某個 "HH:mm" 時段今天（或跨到今天凌晨的昨天）是否涵蓋 now。
 * 同時檢查「今天」與「昨天」兩個候選起點，涵蓋 23:xx 這種跨日時段。
 */
function windowRange(now: Date, hhmm: string): { start: Date; end: Date } | null {
  const match = WINDOW_PATTERN.exec(hhmm);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);

  for (const offsetMs of [0, -24 * 60 * 60 * 1000]) {
    const candidateDateStr = taipeiDate(new Date(now.getTime() + offsetMs));
    const dayStart = taipeiDayStart(candidateDateStr);
    const start = new Date(dayStart.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
    const end = new Date(start.getTime() + WINDOW_DURATION_MS);
    if (now >= start && now < end) return { start, end };
  }
  return null;
}

function taipeiHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }).format(now),
  );
}

/** 純函式：不做 I/O、不自己取現在時間。規則 A（時段）優先於規則 B（風險加打），同一次判斷最多響一次。 */
export function decideCall(input: DecideCallInput): DecideCallResult {
  const { now, attemptsToday, sessionsToday, recentYellowAlert } = input;
  const windows = parseCallWindows(input.callWindows);

  let activeWindow: { start: Date; end: Date } | null = null;
  let activeLabel: string | null = null;
  for (const w of windows) {
    const range = windowRange(now, w);
    if (range) {
      activeWindow = range;
      activeLabel = w;
      break;
    }
  }

  if (activeWindow && activeLabel) {
    const windowAttempts = attemptsToday.filter((a) => a.window === activeLabel);
    const answered =
      windowAttempts.some((a) => a.status === "answered") ||
      sessionsToday.some(
        (s) => s.endedAt !== undefined && s.startedAt >= activeWindow!.start && s.startedAt < activeWindow!.end,
      );

    if (!answered && windowAttempts.length < MAX_RINGS_PER_WINDOW) {
      const lastRingTs = windowAttempts.reduce<number | null>(
        (max, a) => (max === null || a.ts.getTime() > max ? a.ts.getTime() : max),
        null,
      );
      if (lastRingTs === null || now.getTime() - lastRingTs >= RETRY_GAP_MS) {
        return { ring: true, window: activeLabel, reason: windowAttempts.length === 0 ? "window" : "retry" };
      }
    }
  }

  // 規則 B：風險加打
  const lastCompletedTimestamps = [
    ...sessionsToday.filter((s) => s.endedAt !== undefined).map((s) => s.endedAt!.getTime()),
    ...attemptsToday.filter((a) => a.status === "answered").map((a) => a.ts.getTime()),
  ];
  const lastCompletedCallAt = lastCompletedTimestamps.length > 0 ? Math.max(...lastCompletedTimestamps) : null;
  const hoursSinceLastCallMs = lastCompletedCallAt === null ? Infinity : now.getTime() - lastCompletedCallAt;

  const hour = taipeiHour(now);
  const inQuietHours = hour >= 21 || hour < 8;

  const recentRiskBoost = attemptsToday.some(
    (a) => a.reason === "risk_boost" && now.getTime() - a.ts.getTime() < RISK_BOOST_LOOKBACK_MS,
  );

  if (recentYellowAlert && hoursSinceLastCallMs > RISK_BOOST_IDLE_MS && !inQuietHours && !recentRiskBoost) {
    return { ring: true, window: "boost", reason: "risk_boost" };
  }

  return { ring: false };
}
