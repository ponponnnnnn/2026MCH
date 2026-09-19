/**
 * 獨立測試個人化語域邏輯，完全不呼叫 Gemini API、不需要 GEMINI_API_KEY。
 * 只匯入 profile.ts 和 prompt.ts，跳過 live.ts（才會用到 Live API 連線的地方）。
 *
 * 執行方式（在 backend 資料夾下）：
 *   npx tsx src/test-personalization.ts
 *
 * 不需要先設定 .env，這支腳本自己會用 DEV_NO_DB 模式，不會碰 Firestore。
 */

process.env.DEV_NO_DB = "1";

import {
  type ElderProfile,
  registerClarification,
  personalizationHint,
} from "./profile.js";
import { buildSystemPrompt, type ConversationContext } from "./prompt.js";

function freshProfile(overrides: Partial<ElderProfile> = {}): ElderProfile {
  return {
    occupationContext: "",
    preferredLanguage: "zh-TW",
    vocabLevel: "moderate",
    sentenceDensity: "moderate",
    clarificationCount: 0,
    totalTurns: 0,
    metaphorScores: {},
    topicHistory: {},
    paceLevel: "normal",
    ...overrides,
  };
}

const demoContext: ConversationContext = {
  timeOfDayLabel: "下午",
  mealHint: "如果要問用餐，適合問午餐吃得如何，不要問早餐。",
  todaySummary: "",
};

console.log("========== 情境一：退休水電師傅 ==========");
const p1 = freshProfile({
  occupationContext: "曾任水電師傅",
  metaphorScores: { "機械保養、電路接觸不良類比": 2 },
});
console.log(buildSystemPrompt("陳先生", p1, demoContext));

console.log("\n========== 情境二：退休國小老師 ==========");
const p2 = freshProfile({
  occupationContext: "退休國小老師",
  metaphorScores: { "學生複習功課類比": 2 },
});
console.log(buildSystemPrompt("林女士", p2, demoContext));

console.log("\n========== 情境三：模擬連續追問，語彙複雜度應自動調降 ==========");
const p3 = freshProfile({ vocabLevel: "normal" });
console.log(`初始 vocabLevel：${p3.vocabLevel}`);
for (let i = 1; i <= 4; i++) {
  registerClarification(p3);
  console.log(
    `第 ${i} 次追問後 → clarificationCount=${p3.clarificationCount}, ` +
      `totalTurns=${p3.totalTurns}, vocabLevel=${p3.vocabLevel}`,
  );
}

console.log("\n========== 個人化提示文字單獨檢視 ==========");
console.log(personalizationHint(p3));
