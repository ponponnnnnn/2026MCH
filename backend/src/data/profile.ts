import { config } from "../config.js";
import { elderRef } from "./firestore.js";

/** 個人化語域 Profile（v2_mvp.md §6，存在 elders/{elderId} 文件裡，與 name/medications 同層級） */

export type VocabLevel = "simple" | "moderate" | "normal";
export type SentenceDensity = "one_at_a_time" | "moderate" | "rich";
export type PaceLevel = "slow" | "normal" | "fast";

export interface ElderProfile {
  occupationContext: string;
  preferredLanguage: string;
  vocabLevel: VocabLevel;
  sentenceDensity: SentenceDensity;
  clarificationCount: number;
  totalTurns: number;

  /** 訊號 2：比喻類型 -> 淨分數（聽懂 +1，沒聽懂 -1），分數最高的會被當作目前最有效的比喻風格 */
  metaphorScores: Record<string, number>;

  /** 訊號 3：主題 -> 被追問的次數（跨對話累計）。用來讓 Agent 在下次對話主動關心還沒真正弄懂的主題 */
  topicHistory: Record<string, number>;

  /** 訊號 4：語速估計，依逐字稿長度與時間差近似計算 */
  paceLevel: PaceLevel;
}

const DEFAULT_PROFILE: ElderProfile = {
  occupationContext: "",
  preferredLanguage: "zh-TW",
  vocabLevel: "moderate",
  sentenceDensity: "moderate",
  clarificationCount: 0,
  totalTurns: 0,
  metaphorScores: {},
  topicHistory: {},
  paceLevel: "normal",
};

/**
 * DEV_NO_DB 模式（不連 Firestore）下用的 Demo 假資料，依 elderId 對照。
 * Demo 現場只要在瀏覽器網址帶不同的 elderId（例如 ?elderId=demo-plumber），
 * 就能展示同一套系統對不同背景長輩的回答差異，不需要真的連 Firestore。
 */
const DEMO_PROFILES: Record<string, Partial<ElderProfile>> = {
  "demo-plumber": {
    occupationContext: "曾任水電師傅",
    metaphorScores: { "機械保養、電路接觸不良類比": 2 },
  },
  "demo-teacher": {
    occupationContext: "退休國小老師",
    metaphorScores: { "學生複習功課類比": 2 },
  },
};

/** 追問比例超過這個門檻，代表目前用語對這位長輩太難，自動調降一級 */
const CLARIFICATION_RATIO_THRESHOLD = 0.3;
/** 同一主題被追問達到這個次數，才值得在下次對話主動關心（避免雜訊太多） */
const TOPIC_FOLLOWUP_THRESHOLD = 2;

const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE) as (keyof ElderProfile)[];

/** 讀取 Profile。DEV_NO_DB 模式：查 DEMO_PROFILES；正式模式：從 Firestore 讀。 */
export async function getProfile(elderId: string): Promise<ElderProfile> {
  if (config.devNoDb) {
    const demo = DEMO_PROFILES[elderId] ?? {};
    return { ...DEFAULT_PROFILE, ...demo };
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
 * 訊號 1：長輩追問「這是什麼意思」時呼叫。原地修改 profile：
 * 累計追問次數，追問比例過高就調降語彙複雜度一級（simple 是下限，避免過度簡化）。
 * 同時累計這個主題被追問的次數（供訊號 3 使用）。
 */
export function registerClarification(profile: ElderProfile, topic?: string): void {
  profile.clarificationCount += 1;
  profile.totalTurns += 1;

  const ratio = profile.clarificationCount / Math.max(profile.totalTurns, 1);
  if (ratio > CLARIFICATION_RATIO_THRESHOLD) {
    if (profile.vocabLevel === "normal") profile.vocabLevel = "moderate";
    else if (profile.vocabLevel === "moderate") profile.vocabLevel = "simple";
  }

  if (topic) {
    profile.topicHistory[topic] = (profile.topicHistory[topic] ?? 0) + 1;
  }
}

/** 一輪對話正常結束（沒有追問）時呼叫，只累計輪數，不影響語彙等級 */
export function registerTurn(profile: ElderProfile): void {
  profile.totalTurns += 1;
}

/**
 * 訊號 2：Agent 用某種比喻解釋完之後呼叫，回報這次比喻對方聽不聽得懂
 * （懂 = 沒有立刻追問、順著往下聊；沒懂 = 緊接著追問或表示不理解）。
 * 分數用加減分，不是覆蓋，讓系統自然收斂到這位長輩真正聽得懂的比喻類型。
 */
export function registerMetaphorFeedback(
  profile: ElderProfile,
  category: string,
  understood: boolean,
): void {
  const delta = understood ? 1 : -1;
  profile.metaphorScores[category] = (profile.metaphorScores[category] ?? 0) + delta;
}

/** 取出目前分數最高、且為正分的比喻類型，供 personalizationHint 使用 */
function topMetaphor(profile: ElderProfile): string | undefined {
  const entries = Object.entries(profile.metaphorScores).filter(([, score]) => score > 0);
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/**
 * 訊號 4：依這一輪長輩說話的逐字稿字數與花費時間，估計語速快慢，
 * 近似值而非精確測量（Live API 目前未提供音訊層級的語速數據）。
 */
export function registerTurnPace(profile: ElderProfile, charCount: number, durationMs: number): void {
  if (charCount === 0 || durationMs <= 0) return;
  const msPerChar = durationMs / charCount;
  // 門檻依中文口語語速粗抓：每字 > 500ms 偏慢，< 220ms 偏快，中間算正常
  if (msPerChar > 500) profile.paceLevel = "slow";
  else if (msPerChar < 220) profile.paceLevel = "fast";
  else profile.paceLevel = "normal";
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
  const paceHint: Record<PaceLevel, string> = {
    slow: "這位長輩說話速度較慢，你的語速也放慢一點，句子縮短，多留停頓時間",
    normal: "語速維持一般節奏即可",
    fast: "這位長輩說話節奏較快，可以用稍微明快一點的語速回應，避免顯得拖沓",
  };

  const metaphor = topMetaphor(profile);
  const metaphorLine = metaphor
    ? `目前已知對這位長輩最有效的比喻類型是「${metaphor}」，優先使用這類比喻。`
    : "還不清楚這位長輩偏好哪種比喻，可以嘗試不同類型（機械、烹飪、農務、教學等），並在解釋完之後判斷對方是否聽懂。";

  const occupationLine = profile.occupationContext ? `這位長輩背景：${profile.occupationContext}。` : "";

  const followUpTopics = Object.entries(profile.topicHistory)
    .filter(([, count]) => count >= TOPIC_FOLLOWUP_THRESHOLD)
    .map(([topic]) => topic);
  const followUpLine =
    followUpTopics.length > 0
      ? `這位長輩過去多次對以下主題表示不理解，如果對話中有機會，可以主動關心「上次提到的○○，現在還有沒有不清楚的地方」：${followUpTopics.join("、")}。`
      : "";

  const allTopics = Object.keys(profile.topicHistory);
  const topicKeyHint =
    allTopics.length > 0
      ? `之前已經記錄過的主題關鍵字有：${allTopics.join("、")}。如果這次長輩聽不懂的內容，概念上跟其中一個相同，呼叫 register_clarification 時請完全重複使用同一個關鍵字（不要換句話說、不要加減字），這樣系統才能正確累計次數；只有真的是全新的主題才用新的關鍵字。`
      : "";

  return `${occupationLine}
語彙複雜度：${vocabHint[profile.vocabLevel]}。
句子密度：${densityHint[profile.sentenceDensity]}。
語速：${paceHint[profile.paceLevel]}。
${metaphorLine}
${followUpLine}
${topicKeyHint}
如果長輩追問「這是什麼意思」或聽起來沒聽懂，換一個更簡單的角度重新解釋一次，不要重複同樣的講法，並記得呼叫 register_clarification。
每次用比較有畫面感的比喻解釋完一件事之後，依對方接下來的反應（有沒有追問、有沒有順著往下聊）呼叫 register_metaphor_result 回報這次比喻有沒有讓對方聽懂。`.trim();
}
