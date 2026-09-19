import type { HealthType } from "../data/firestore.js";
import type { ElderFacts } from "../data/facts.js";

/**
 * 通話前算好的「本通通話背景」。這是 prompt 層的輸入契約，所以定義在這裡；
 * call/briefing.ts 往下 import 這個型別並負責從 Firestore 算出對應的值（不做渲染）。
 */
export interface Briefing {
  elderName: string;
  preferredName?: string;
  isFirstCall: boolean;
  timeOfDayLabel: string;
  mealHint: string;
  todayLoggedSlots: HealthType[];
  lastSummary?: string;
  topicHooks: { entity: string; context: string }[];
  slotPriority: { slot: HealthType; daysSinceCollected: number | null; recentAbnormal: boolean }[];
  factTargets: string[];
  knownFacts: ElderFacts;
}

type HealthSlot = Exclude<HealthType, "other">;

const HEALTH_TYPE_LABEL: Record<HealthSlot, string> = {
  medication: "用藥",
  sleep: "睡眠",
  meal: "飲食",
  pain: "疼痛",
  mood: "心情",
};

const healthLabel = (slot: HealthType): string => HEALTH_TYPE_LABEL[slot as HealthSlot] ?? slot;

/** factTargets 的欄位 key → 繁中說法。habitualBedtime / habitualWake 共用同一個標籤，出現一次即可。 */
const FACT_TARGET_LABEL: Partial<Record<keyof ElderFacts, string>> = {
  preferredName: "稱呼",
  interests: "興趣（平常喜歡做什麼）",
  habitualBedtime: "作息（昨天幾點睡、今天幾點起）",
  habitualWake: "作息（昨天幾點睡、今天幾點起）",
  familyMembers: "家人（等他自己提到再順著問，不盤問）",
  chronicConditions: "慢性病（聊到看醫生、身體狀況時順著問）",
  medicationsSelfReported: "在吃的藥（聊到用藥時順著問）",
  languagePref: "慣用語言（聽他講什麼話就記，不用問）",
};

function renderFactTargetsLine(factTargets: string[]): string {
  const labels: string[] = [];
  for (const key of factTargets) {
    const label = FACT_TARGET_LABEL[key as keyof ElderFacts];
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) return "本通要認識的項目：（這通不用特別問）";
  return `本通要認識的項目（只主動問這些）：${labels.join("、")}`;
}

function isKnownFactsEmpty(facts: ElderFacts): boolean {
  return (
    facts.familyMembers.length === 0 &&
    facts.interests.length === 0 &&
    !facts.habitualBedtime &&
    !facts.habitualWake &&
    facts.chronicConditions.length === 0 &&
    facts.medicationsSelfReported.length === 0 &&
    !facts.languagePref &&
    facts.notes.length === 0
  );
}

/** preferredName 已在「稱呼」行渲染過，這裡不重複 */
function renderKnownFactsBlock(facts: ElderFacts): string {
  const lines: string[] = [];
  if (facts.familyMembers.length) lines.push(`- 家人：${facts.familyMembers.join("、")}`);
  if (facts.interests.length) lines.push(`- 興趣：${facts.interests.join("、")}`);
  if (facts.habitualBedtime && facts.habitualWake) {
    lines.push(`- 作息：大約 ${facts.habitualBedtime} 睡、${facts.habitualWake} 起`);
  } else if (facts.habitualBedtime) {
    lines.push(`- 作息：大約 ${facts.habitualBedtime} 睡`);
  } else if (facts.habitualWake) {
    lines.push(`- 作息：${facts.habitualWake} 起`);
  }
  if (facts.chronicConditions.length) lines.push(`- 慢性病：${facts.chronicConditions.join("、")}`);
  if (facts.medicationsSelfReported.length)
    lines.push(`- 在吃的藥（長輩自己說的）：${facts.medicationsSelfReported.join("、")}`);
  if (facts.languagePref) lines.push(`- 慣用語言：${facts.languagePref}`);
  if (facts.notes.length) lines.push(`- 其他：${facts.notes.join("；")}`);

  if (lines.length === 0) return "已知基本資料：（無）";
  return ["已知基本資料：", ...lines].join("\n");
}

function renderTodayLoggedLine(slots: HealthType[]): string {
  if (slots.length === 0) return "今天稍早已經聊過：（無）";
  return `今天稍早已經聊過：${slots.map(healthLabel).join("、")}（不重問基礎題，只問後續變化）`;
}

function renderTopicHooksBlock(hooks: Briefing["topicHooks"]): string {
  if (hooks.length === 0) return "掛勾清單：（無）";
  const lines = hooks
    .slice(0, 5)
    .map((h) => (h.context ? `- ${h.entity}：${h.context}` : `- ${h.entity}`));
  return ["掛勾清單（新的排前面）：", ...lines].join("\n");
}

function renderSlotPriorityLineFirstCall(slotPriority: Briefing["slotPriority"]): string {
  const labels = slotPriority.map((s) => healthLabel(s.slot));
  return `健康項目優先序：${labels.join(" → ")}（第一通不必問齊）`;
}

/**
 * 例行通話的健康項目優先序：把今天已聊過的項目從序列拿掉，剩下的依序標註
 * 最近有狀況／還沒問到過／N 天沒聊到；被拿掉的項目集中註記在最後一個項目後面。
 */
function renderSlotPriorityLineRoutine(
  slotPriority: Briefing["slotPriority"],
  todayLoggedSlots: HealthType[],
): string {
  const removed = slotPriority.filter((s) => todayLoggedSlots.includes(s.slot));
  const remaining = slotPriority.filter((s) => !todayLoggedSlots.includes(s.slot));

  if (remaining.length === 0) {
    return "健康項目優先序：（五項今天都聊過了，只問後續變化）";
  }

  const parts = remaining.map((s) => {
    let note: string | undefined;
    if (s.recentAbnormal) note = "最近有狀況";
    else if (s.daysSinceCollected === null) note = "還沒問到過";
    else if (s.daysSinceCollected >= 3) note = `${s.daysSinceCollected} 天沒聊到`;
    return { label: healthLabel(s.slot), note };
  });

  if (removed.length > 0) {
    const removedNote = `${removed.map((s) => healthLabel(s.slot)).join("、")}今天已聊過，只問後續變化`;
    const last = parts[parts.length - 1];
    last.note = last.note ? `${last.note}；${removedNote}` : removedNote;
  }

  const joined = parts.map((p) => (p.note ? `${p.label}（${p.note}）` : p.label)).join(" → ");
  return `健康項目優先序：${joined}`;
}

function renderFirstCall(b: Briefing): string {
  const lines = ["【本通通話背景】", "通話類型：第一次通話", `現在時段：${b.timeOfDayLabel}。${b.mealHint}`];

  if (isKnownFactsEmpty(b.knownFacts)) {
    lines.push("稱呼、今天稍早已經聊過、上次通話摘要、掛勾清單、已知基本資料：（都還沒有，這是第一通）");
  } else {
    lines.push("稱呼、今天稍早已經聊過、上次通話摘要、掛勾清單：（都還沒有，這是第一通）");
    lines.push(renderKnownFactsBlock(b.knownFacts));
  }

  lines.push(renderSlotPriorityLineFirstCall(b.slotPriority));
  lines.push(renderFactTargetsLine(b.factTargets));
  return lines.join("\n");
}

function renderRoutine(b: Briefing): string {
  const lines = ["【本通通話背景】", "通話類型：例行通話（不是第一通）"];

  if (b.elderName && b.elderName !== "長輩") {
    lines.push(`登記姓名：${b.elderName}（只供辨識；叫他一律用「稱呼」）`);
  }

  const preferredName = b.preferredName ?? b.knownFacts.preferredName;
  lines.push(
    preferredName ? `稱呼：${preferredName}` : "稱呼：（還沒問到，先用「您」，找機會問他希望怎麼稱呼）",
  );

  lines.push(`現在時段：${b.timeOfDayLabel}。${b.mealHint}`);
  lines.push(renderTodayLoggedLine(b.todayLoggedSlots));
  lines.push(`上次通話摘要：${b.lastSummary ?? "（無）"}`);
  lines.push(renderTopicHooksBlock(b.topicHooks));
  lines.push(renderSlotPriorityLineRoutine(b.slotPriority, b.todayLoggedSlots));
  lines.push(renderKnownFactsBlock(b.knownFacts));
  lines.push(renderFactTargetsLine(b.factTargets));

  return lines.join("\n");
}

/** Briefing → 【本通通話背景】文字區塊。純函式，不排序、不查資料、不讀時鐘。 */
export function renderBriefing(b: Briefing): string {
  return b.isFirstCall ? renderFirstCall(b) : renderRoutine(b);
}
