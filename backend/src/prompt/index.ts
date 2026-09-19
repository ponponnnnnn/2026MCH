import type { ElderProfile } from "../data/profile.js";
import { personalizationHint } from "../data/profile.js";
import { PERSONA } from "./sections/persona.js";
import { OPENING_FIRST_CALL, OPENING_ROUTINE } from "./sections/opening.js";
import { TOPICS } from "./sections/topics.js";
import { DEPTH } from "./sections/depth.js";
import { GETTING_TO_KNOW } from "./sections/getting-to-know.js";
import { SENSITIVE } from "./sections/sensitive.js";
import { RECORDING } from "./sections/recording.js";
import { renderBriefing, type Briefing } from "./render-briefing.js";

/**
 * 組裝完整 system prompt：靜態規則段（sections/）+ 個人化提示（data/profile.ts，F11）
 * + 開場（首次／例行擇一）+ 話題／深淺／建檔／敏感／記錄規則 + 本通通話背景（Briefing）。
 * 純函式，不做任何 I/O；systemInstruction 只能在 Live 連線時設定一次，通話中不能改。
 */
export function buildSystemPrompt(briefing: Briefing, profile: ElderProfile): string {
  const opening = briefing.isFirstCall ? OPENING_FIRST_CALL : OPENING_ROUTINE;

  return `${PERSONA}

現在是${briefing.timeOfDayLabel}。${briefing.mealHint}

【個人化提示】
${personalizationHint(profile)}

${opening}

${TOPICS}

${DEPTH}

${GETTING_TO_KNOW}

${SENSITIVE}

${RECORDING}

${renderBriefing(briefing)}`;
}
