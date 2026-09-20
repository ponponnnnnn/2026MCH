import { config } from "./config.js";
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

  /** 首次使用輕量建檔（見 updateOnboardingInfo）：希望的稱謂，例如「陳伯伯」「阿嬤」 */
  preferredAddress: string;
  /** 首次使用輕量建檔：主要資訊來源，例如「電視新聞、LINE 群組」 */
  infoSourceType: string;
  /** 首次使用輕量建檔：主要社交圈，例如「鄰居、市場攤販」或「幫忙帶孫子」 */
  socialCircleType: string;
  /** 已經嘗試建檔的通話次數，達到 MAX_ONBOARDING_ATTEMPTS 後即使沒問完也不再嘗試，避免無限重問 */
  onboardingAttempts: number;
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
  preferredAddress: "",
  infoSourceType: "",
  socialCircleType: "",
  onboardingAttempts: 0,
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
/** 首次建檔最多嘗試幾次通話，超過就算了，不再繼續問缺的項目 */
const MAX_ONBOARDING_ATTEMPTS = 3;

const ONBOARDING_FIELDS = ["occupationContext", "preferredAddress", "infoSourceType", "socialCircleType"] as const;

/** 是否還需要繼續嘗試建檔：四項還沒填滿，而且嘗試次數還沒到上限 */
export function needsOnboarding(profile: ElderProfile): boolean {
  const allFilled = ONBOARDING_FIELDS.every((key) => profile[key]);
  if (allFilled) return false;
  return profile.onboardingAttempts < MAX_ONBOARDING_ATTEMPTS;
}

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

/**
 * 首次使用輕量建檔：Agent 在自然對話中問到哪一項，就呼叫一次，只更新有給值的欄位，
 * 不用一次全部問完。長輩不想回答的項目，這個函式就不會被呼叫到，欄位維持空字串即可，
 * 不影響其他個人化邏輯（空字串在 personalizationHint 裡會被忽略，不會生成奇怪的句子）。
 */
export function updateOnboardingInfo(
  profile: ElderProfile,
  updates: Partial<Pick<ElderProfile, "occupationContext" | "preferredAddress" | "infoSourceType" | "socialCircleType">>,
): void {
  if (updates.occupationContext) profile.occupationContext = updates.occupationContext;
  if (updates.preferredAddress) profile.preferredAddress = updates.preferredAddress;
  if (updates.infoSourceType) profile.infoSourceType = updates.infoSourceType;
  if (updates.socialCircleType) profile.socialCircleType = updates.socialCircleType;
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

/**
 * 首次使用輕量建檔的指示文字。四項都填滿了，或已經試過 MAX_ONBOARDING_ATTEMPTS 次通話
 * 還是問不完，就回傳空字串，不再繼續嘗試；否則列出還缺哪些項目讓 Agent 針對性地問。
 */
export function onboardingHint(profile: ElderProfile): string {
  if (!needsOnboarding(profile)) return "";

  const missing: string[] = [];
  if (!profile.occupationContext) missing.push("以前是做什麼工作的");
  if (!profile.preferredAddress) missing.push("希望怎麼稱呼他（例如「陳伯伯」「阿嬤」）");
  if (!profile.infoSourceType) missing.push("平常都看什麼獲取消息（例如電視新聞、地下電台、八點檔、LINE 群組、YouTube）");
  if (!profile.socialCircleType) missing.push("平常主要跟誰互動（例如鄰居、市場攤販，或是主要在照顧孫子）");

  return `這位長輩的基礎資料還沒問完（目前已經聊過 ${profile.onboardingAttempts} 次，最多再嘗試 ${MAX_ONBOARDING_ATTEMPTS - profile.onboardingAttempts} 次）。
除了正常的陪伴與健康關心之外，在對話中找自然的時機，像聊天一樣（不要像做問卷、不要連續發問），輕鬆問出以下還缺的項目：
${missing.map((m) => `- ${m}`).join("\n")}
每一輪最多自然帶出一個問題，問到答案就呼叫 update_onboarding_info 記錄下來；
長輩不想回答某一項就直接跳過，順著聊別的，不要勉強追問，之後也不用再特地針對那一項追問。`;
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
  const addressLine = profile.preferredAddress ? `稱呼這位長輩為「${profile.preferredAddress}」，不要直接用姓名。` : "";
  const contextLine = [
    profile.infoSourceType ? `平常主要透過${profile.infoSourceType}獲取資訊` : "",
    profile.socialCircleType ? `日常互動對象多是${profile.socialCircleType}` : "",
  ]
    .filter(Boolean)
    .join("，");
  const backgroundContextLine = contextLine ? `${contextLine}，可以據此挑選長輩容易有共鳴的例子或話題。` : "";

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
${addressLine}
${backgroundContextLine}
語彙複雜度：${vocabHint[profile.vocabLevel]}。
句子密度：${densityHint[profile.sentenceDensity]}。
語速：${paceHint[profile.paceLevel]}。
${metaphorLine}
${followUpLine}
${topicKeyHint}
如果長輩追問「這是什麼意思」或聽起來沒聽懂，換一個更簡單的角度重新解釋一次，不要重複同樣的講法，並記得呼叫 register_clarification。
每次用比較有畫面感的比喻解釋完一件事之後，依對方接下來的反應（有沒有追問、有沒有順著往下聊）呼叫 register_metaphor_result 回報這次比喻有沒有讓對方聽懂。`.trim();
}
