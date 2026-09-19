import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export { Timestamp };

export type HealthType = "medication" | "sleep" | "mood" | "pain" | "meal" | "other";
export type AlertLevel = "red" | "yellow";

export const elderRef = (elderId: string) => db.collection("elders").doc(elderId);

/** 台北時區的 yyyy-mm-dd，用來當 dailyReports 文件 ID 與撈「當日」資料 */
export function taipeiDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
}

/** 台北時區某天 00:00 的 Date（台北固定 UTC+8，無日光節約） */
export function taipeiDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+08:00`);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 白名單格式檢查：外部輸入（elderId、attemptId）進入 Firestore 文件路徑前先驗證 */
export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}
