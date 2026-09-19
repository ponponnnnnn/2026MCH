import { config } from "./config.js";
import { elderRef } from "./firestore.js";

/** 個人化語域 Profile（v2_mvp.md §6，存在 elders/{elderId} 文件裡，與 name/medications 同層級） */

export type VocabLevel = "simple" | "moderate" | "normal";
export type SentenceDensity = "one_at_a_time" | "moderate" | "rich";

export interface ElderProfile {
  occupationContext: string;
  preferredLanguage: string;
  vocabLevel: VocabLevel;
  sentenceDensity: SentenceDensity;
  metaphorStyle: string;
  clarificationCount: number;
  totalTurns: number;
}

const DEFAULT_PROFILE: ElderProfile = {
  occupationContext: "",
  preferredLanguage: "zh-TW",
  vocabLevel: "moderate",
  sentenceDensity: "moderate",
  metaphorStyle: "",
  clarificationCount: 0,
  totalTurns: 0,
};

/**
 * DEV_NO_DB 模式（不連 Firestore）下用的 Demo 假資料，依 elderId 對照。
 * Demo 現場只要在瀏覽器網址帶不同的 elderId（例如 ?elderId=demo-plumber），
 * 就能展示同一套系統對不同背景長輩的回答差異，不需要真的連 Firestore。
 *
 * 正式串上 Firestore 後這份假資料不會被用到（見下面 getProfile 的邏輯），
 * 不用特地刪除，留著也不影響正式環境。
 */
const DEMO_PROFILES: Record<string, Partial<ElderProfile>> = {
  "demo-plumber": {
    occupationContext: "曾任水電師傅",
    metaphorStyle: "像機器保養、電路接觸不良",
  },
  "demo-teacher": {
    occupationContext: "退休國小老師",
    metaphorStyle: "像學生複習功課",
  },
};

/** 追問比例超過這個門檻，代表目前用語對這位長輩太難，自動調降一級 */
const CLARIFICATION_RATIO_THRESHOLD = 0.3;

const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE) as (keyof ElderProfile)[];

/**
 * 讀取 Profile。
 * DEV_NO_DB 模式：先查 DEMO_PROFILES 有沒有這個 elderId 的假資料，有就用，沒有就用預設值。
 * 正式模式：從 Firestore 讀 elders/{elderId} 文件。
 */
export async function getProfile(elderId: string): Promise<ElderProfile> {
  if (config.devNoDb) {
    return { ...DEFAULT_PROFILE, ...(DEMO_PROFILES[elderId] ?? {}) };
  }

  const data = (await elderRef(elderId).get()).data() ?? {};
  const profile = { ...DEFAULT_PROFILE };
  for (const key of PROFILE_KEYS) {
    if (data[key] !== undefined) (profile as Record<string, unknown>)[key] = data[key];
  }
  return profile;
}

/** 寫回 Profile；merge 寫入，不會動到 name/medications/familyContacts 等其他欄位 */
export async function saveProfile(elderId: string, profile: ElderProfile): Promise<void> {
  if (config.devNoDb) return;
  await elderRef(elderId).set(profile, { merge: true });
}

/**
 * 長輩追問「這是什麼意思」時呼叫。原地修改 profile：
 * 累計追問次數，追問比例過高就調降語彙複雜度一級（simple 是下限，避免過度簡化）。
 */
export function registerClarification(profile: ElderProfile): void {
  profile.clarificationCount += 1;
  profile.totalTurns += 1;

  const ratio = profile.clarificationCount / Math.max(profile.totalTurns, 1);
  if (ratio > CLARIFICATION_RATIO_THRESHOLD) {
    if (profile.vocabLevel === "normal") profile.vocabLevel = "moderate";
    else if (profile.vocabLevel === "moderate") profile.vocabLevel = "simple";
  }
}

/** 一輪對話正常結束（沒有追問）時呼叫，只累計輪數，不影響語彙等級 */
export function registerTurn(profile: ElderProfile): void {
  profile.totalTurns += 1;
}

/** 把 Profile 轉成要插進 System Prompt 的一段個人化提示文字 */
export function personalizationHint(profile: ElderProfile): string {
  const vocabHint: Record<VocabLevel, string> = {
    simple: "用最生活化、最白話的詞彙，避免任何專業術語",
    moderate: "用一般日常對話的詞彙，遇到專業詞彙要順便解釋",
    normal: "可以正常使用一般成人對話的詞彙",
  };
  const densityHint: Record<SentenceDensity, string> = {
    one_at_a_time: "每次只講一件事，講完停一下再確認是否理解",
    moderate: "可以一次講兩三個重點，但避免資訊過量",
    rich: "可以完整說明，不用刻意拆分",
  };
  const metaphorLine = profile.metaphorStyle
    ? `可多使用「${profile.metaphorStyle}」這類比喻方式協助理解。`
    : "留意長輩的反應，找出這位長輩聽得懂的比喻方式，記在心裡下次使用。";
  const occupationLine = profile.occupationContext ? `這位長輩背景：${profile.occupationContext}。` : "";

  return `${occupationLine}
語彙複雜度：${vocabHint[profile.vocabLevel]}。
句子密度：${densityHint[profile.sentenceDensity]}。
${metaphorLine}
如果長輩追問「這是什麼意思」或聽起來沒聽懂，換一個更簡單的角度重新解釋一次，不要重複同樣的講法。`.trim();
}
