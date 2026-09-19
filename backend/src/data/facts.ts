import { FieldValue } from "firebase-admin/firestore";
import { elderRef, Timestamp } from "./firestore.js";

/** 長輩基本資料（建檔用），存在 elders/{id} 文件的 facts 欄位（map）。與隊友的個人化語域 Profile 是不同欄位，互不影響。 */
export interface ElderFacts {
  preferredName?: string;
  familyMembers: string[];
  interests: string[];
  habitualBedtime?: string;
  habitualWake?: string;
  chronicConditions: string[];
  medicationsSelfReported: string[];
  languagePref?: string;
  notes: string[];
}

export const EMPTY_FACTS: ElderFacts = {
  familyMembers: [],
  interests: [],
  chronicConditions: [],
  medicationsSelfReported: [],
  notes: [],
};

type FactFieldType = "string" | "string[]";

/** 欄位白名單：remember_fact 的 field 參數與 readFacts 的型別檢查都靠這個表 */
export const FACT_FIELDS: Record<keyof ElderFacts, FactFieldType> = {
  preferredName: "string",
  familyMembers: "string[]",
  interests: "string[]",
  habitualBedtime: "string",
  habitualWake: "string",
  chronicConditions: "string[]",
  medicationsSelfReported: "string[]",
  languagePref: "string",
  notes: "string[]",
};

export type ConcernCategory =
  | "scam"
  | "home_safety"
  | "wandering"
  | "extreme_weather"
  | "service_refusal"
  | "self_neglect"
  | "other";

export const CONCERN_CATEGORIES: ConcernCategory[] = [
  "scam",
  "home_safety",
  "wandering",
  "extreme_weather",
  "service_refusal",
  "self_neglect",
  "other",
];

/** 存在 elders/{id}/topicHooks 集合，供下次通話當開場話題 */
export interface TopicHook {
  entity: string;
  context: string;
  mentionedAt: Timestamp;
  sessionId: string;
}

/** 存在 elders/{id}/concerns 集合，健康項目清單以外、模型主動聽到的擔憂 */
export interface Concern {
  ts: Timestamp;
  category: ConcernCategory;
  summary: string;
  quote: string;
  sessionId: string;
}

/** 從 elder 文件的 facts 欄位安全取值；型別不符白名單的欄位忽略，不拋錯 */
export function readFacts(elderData: Record<string, unknown> | undefined): ElderFacts {
  const raw = (elderData?.facts ?? {}) as Record<string, unknown>;
  const facts: Record<string, unknown> = { ...EMPTY_FACTS };
  for (const [key, type] of Object.entries(FACT_FIELDS) as [keyof ElderFacts, FactFieldType][]) {
    const value = raw[key];
    if (type === "string") {
      if (typeof value === "string" && value) facts[key] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      facts[key] = value;
    }
  }
  return facts as unknown as ElderFacts;
}

/** 寫入一個 ElderFacts 欄位。string[] 欄位用 arrayUnion 累加去重，string 欄位直接覆寫。只在非 devNoDb 時被呼叫。 */
export async function rememberFact(elderId: string, field: keyof ElderFacts, value: string): Promise<void> {
  const fieldValue = FACT_FIELDS[field] === "string[]" ? FieldValue.arrayUnion(value) : value;
  await elderRef(elderId).set({ facts: { [field]: fieldValue } }, { merge: true });
}

/** 只在非 devNoDb 時被呼叫 */
export async function addTopicHook(elderId: string, hook: TopicHook): Promise<void> {
  await elderRef(elderId).collection("topicHooks").add(hook);
}

/** 只在非 devNoDb 時被呼叫 */
export async function addConcern(elderId: string, concern: Concern): Promise<void> {
  await elderRef(elderId).collection("concerns").add(concern);
}
