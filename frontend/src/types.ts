export type HealthType = "medication" | "sleep" | "mood" | "pain" | "meal" | "other";
export type AlertLevel = "red" | "yellow";
export type OverallStatus = "normal" | "watch" | "alert";

export interface ElderInfo {
  name: string;
  age?: number;
}

export interface HealthLog {
  id: string;
  ts: Date;
  type: HealthType;
  value: string;
  note?: string;
}

export interface AlertItem {
  id: string;
  ts: Date;
  level: AlertLevel;
  reason: string;
  sourceQuote?: string;
  notified: boolean;
}

export interface DailyReport {
  date: string; // yyyy-mm-dd，文件 ID
  overall: OverallStatus;
  metrics: {
    medication: string;
    sleep: string;
    mood: string;
    meals: string;
    pain: string;
  };
  events: string[];
  summary: string;
  followUps: string[];
}

export const HEALTH_TYPE_LABEL: Record<HealthType, string> = {
  medication: "用藥",
  sleep: "睡眠",
  mood: "心情",
  pain: "疼痛",
  meal: "飲食",
  other: "其他",
};

export const OVERALL_LABEL: Record<OverallStatus, string> = {
  normal: "🟢 正常",
  watch: "🟡 需留意",
  alert: "🔴 需立即關心",
};
