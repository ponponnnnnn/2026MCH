import type { DocumentData } from "firebase-admin/firestore";
import { config } from "../config.js";
import { elderRef, taipeiDate, taipeiDayStart, Timestamp, type HealthType } from "../data/firestore.js";
import { readFacts, EMPTY_FACTS, type ElderFacts } from "../data/facts.js";
// Briefing 是 prompt 層的輸入契約，型別定義在 prompt/render-briefing.ts；這裡往下 import，
// 文字渲染（Briefing → prompt 文字）交給 prompt 層，這裡只準備資料。
import type { Briefing } from "../prompt/render-briefing.js";

/** 心裡記著的五個健康項目，順序即 topics 段規則講的順序 */
type HealthSlot = Exclude<HealthType, "other">;
const HEALTH_SLOTS: HealthSlot[] = ["medication", "sleep", "meal", "pain", "mood"];

/** raise_alert 的 reason 是自由文字，用簡單關鍵字對應到槽位；對不到就不標記 recentAbnormal */
const ALERT_SLOT_KEYWORDS: Record<HealthSlot, string[]> = {
  medication: ["藥"],
  sleep: ["睡"],
  meal: ["飲食", "吃"],
  pain: ["痛", "跌倒", "暈"],
  mood: ["心情", "情緒", "低落"],
};

function matchAlertSlot(reason: string): HealthSlot | undefined {
  return HEALTH_SLOTS.find((slot) => ALERT_SLOT_KEYWORDS[slot].some((kw) => reason.includes(kw)));
}

/**
 * 判斷一筆 session 是否真的有聊到話。優先看 live.ts finish() 寫入的 elderSpoke 欄位；
 * 舊 session 沒有這個欄位時，退回檢查 transcript 陣列裡有沒有 role === "elder" 的逐字稿。
 */
function sessionHadElderSpeech(session: DocumentData): boolean {
  if (typeof session.elderSpoke === "boolean") return session.elderSpoke;
  const transcript = session.transcript;
  return Array.isArray(transcript) && transcript.some((line) => line?.role === "elder");
}

/** 依台北時間現在幾點，決定時段標籤與用餐提問提示，避免問出不合時宜的問題（例如晚上問早餐） */
function getConversationTimeContext(): { timeOfDayLabel: string; mealHint: string } {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 10) return { timeOfDayLabel: "早上", mealHint: "如果要問用餐，適合問早餐吃了沒。" };
  if (hour < 14) return { timeOfDayLabel: "中午", mealHint: "如果要問用餐，適合問午餐吃了沒，不要問早餐。" };
  if (hour < 18) return { timeOfDayLabel: "下午", mealHint: "如果要問用餐，適合問午餐吃得如何，不要問早餐。" };
  return { timeOfDayLabel: "晚上", mealHint: "如果要問用餐，適合問晚餐吃了沒，不要問早餐或午餐。" };
}

/** factTargets 挑選順序：依固定順序找還是空的欄位，取前 2 個。preferredName 排第一，只要還沒問到，首次或例行通話都會被選到。 */
const FACT_TARGET_ORDER: (keyof ElderFacts)[] = [
  "preferredName",
  "interests",
  "habitualBedtime",
  "familyMembers",
  "chronicConditions",
];

function isFactEmpty(facts: ElderFacts, key: keyof ElderFacts): boolean {
  const value = facts[key];
  return Array.isArray(value) ? value.length === 0 : !value;
}

function pickFactTargets(facts: ElderFacts): string[] {
  return FACT_TARGET_ORDER.filter((key) => isFactEmpty(facts, key)).slice(0, 2);
}

function buildFirstCallFixture(timeOfDayLabel: string, mealHint: string): Briefing {
  return {
    elderName: "長輩",
    isFirstCall: true,
    timeOfDayLabel,
    mealHint,
    todayLoggedSlots: [],
    topicHooks: [],
    slotPriority: HEALTH_SLOTS.map((slot) => ({ slot, daysSinceCollected: null, recentAbnormal: false })),
    factTargets: ["preferredName", "interests"],
    knownFacts: { ...EMPTY_FACTS },
  };
}

function buildRoutineFixture(timeOfDayLabel: string, mealHint: string): Briefing {
  return {
    elderName: "王秀霞",
    preferredName: "阿霞姨",
    isFirstCall: false,
    timeOfDayLabel,
    mealHint,
    todayLoggedSlots: ["medication", "meal"],
    lastSummary: "阿霞姨說陽台的蘭花冒了新花苞，禮拜五要去活動中心打麻將。右膝下雨天會痠，爬樓梯要扶扶手。",
    topicHooks: [
      { entity: "陽台的蘭花", context: "冒了新花苞" },
      { entity: "孫子小翔", context: "參加學校機器人比賽得獎" },
      { entity: "活動中心打麻將", context: "禮拜二、禮拜五下午" },
    ],
    slotPriority: [
      { slot: "sleep", daysSinceCollected: 4, recentAbnormal: true },
      { slot: "pain", daysSinceCollected: 2, recentAbnormal: false },
      { slot: "mood", daysSinceCollected: 1, recentAbnormal: false },
      { slot: "medication", daysSinceCollected: 0, recentAbnormal: false },
      { slot: "meal", daysSinceCollected: 0, recentAbnormal: false },
    ],
    factTargets: ["habitualBedtime"],
    knownFacts: {
      ...EMPTY_FACTS,
      familyMembers: ["女兒淑芬"],
      interests: ["蘭花"],
    },
  };
}

/**
 * 通話前讀 Firestore 一次，組成這通電話要用的 Briefing。
 * DEV_NO_DB：'demo-routine' 回傳例行通話 fixture，其他任何 elderId 回傳首次通話 fixture（全空）。
 */
export async function buildBriefing(elderId: string): Promise<Briefing> {
  const { timeOfDayLabel, mealHint } = getConversationTimeContext();

  if (config.devNoDb) {
    return elderId === "demo-routine"
      ? buildRoutineFixture(timeOfDayLabel, mealHint)
      : buildFirstCallFixture(timeOfDayLabel, mealHint);
  }

  const elder = elderRef(elderId);
  const todayStart = Timestamp.fromDate(taipeiDayStart(taipeiDate()));
  const threeDaysAgo = Timestamp.fromMillis(Date.now() - 3 * 24 * 3600 * 1000);

  const [elderDoc, sessionsSnap, topicHooksSnap, healthLogsSnap, alertsSnap] = await Promise.all([
    elder.get(),
    elder.collection("sessions").orderBy("startedAt", "desc").limit(5).get(),
    elder.collection("topicHooks").orderBy("mentionedAt", "desc").limit(20).get(),
    elder.collection("healthLogs").orderBy("ts", "desc").limit(60).get(),
    elder.collection("alerts").where("ts", ">=", threeDaysAgo).orderBy("ts", "desc").limit(10).get(),
  ]);

  const elderData = elderDoc.data();
  const elderName = (elderData?.name as string | undefined) ?? "長輩";
  const knownFacts = readFacts(elderData);

  const sessions = sessionsSnap.docs.map((d) => d.data());
  // 首次通話的判斷不能只看「有沒有 endedAt」：連線失敗、或長輩按了馬上掛斷，
  // live.ts 的 finish() 一樣會寫 endedAt，但那通並沒有真的聊到話。改看有沒有任何一通長輩真的開口過。
  const isFirstCall = !sessions.some(sessionHadElderSpeech);
  const lastSummary = sessions.find((s) => typeof s.summary === "string" && s.summary)?.summary as
    | string
    | undefined;

  // 掛勾清單依 entity 去重（trim 後相同視為同一個），只留最新一筆；避免同一個掛勾（例如「蘭花」）
  // 每通都新增一筆，把還沒聊過的掛勾擠出通話背景。
  const seenEntities = new Set<string>();
  const topicHooks: { entity: string; context: string }[] = [];
  for (const doc of topicHooksSnap.docs) {
    const data = doc.data();
    const entity = String(data.entity ?? "").trim();
    if (!entity || seenEntities.has(entity)) continue;
    seenEntities.add(entity);
    topicHooks.push({ entity, context: String(data.context ?? "") });
  }

  const todayLoggedSlots: HealthType[] = [];
  const lastSeenAt = new Map<HealthSlot, Timestamp>();
  for (const doc of healthLogsSnap.docs) {
    const data = doc.data();
    const type = data.type as HealthType;
    const ts = data.ts as Timestamp;
    if (ts.toMillis() >= todayStart.toMillis() && !todayLoggedSlots.includes(type)) {
      todayLoggedSlots.push(type);
    }
    if (type !== "other" && !lastSeenAt.has(type)) lastSeenAt.set(type, ts);
  }

  const abnormalSlots = new Set<HealthSlot>();
  for (const doc of alertsSnap.docs) {
    const slot = matchAlertSlot(String(doc.data().reason ?? ""));
    if (slot) abnormalSlots.add(slot);
  }

  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const slotPriority = HEALTH_SLOTS.map((slot) => {
    const seenAt = lastSeenAt.get(slot);
    const daysSinceCollected = seenAt ? Math.floor((now - seenAt.toMillis()) / dayMs) : null;
    return { slot, daysSinceCollected, recentAbnormal: abnormalSlots.has(slot) };
  }).sort((a, b) => {
    const aToday = todayLoggedSlots.includes(a.slot);
    const bToday = todayLoggedSlots.includes(b.slot);
    if (aToday !== bToday) return aToday ? 1 : -1;
    if (a.recentAbnormal !== b.recentAbnormal) return a.recentAbnormal ? -1 : 1;
    const aDays = a.daysSinceCollected ?? Infinity;
    const bDays = b.daysSinceCollected ?? Infinity;
    return bDays - aDays;
  });

  return {
    elderName,
    preferredName: knownFacts.preferredName,
    isFirstCall,
    timeOfDayLabel,
    mealHint,
    todayLoggedSlots,
    lastSummary,
    topicHooks,
    slotPriority,
    factTargets: pickFactTargets(knownFacts),
    knownFacts,
  };
}
