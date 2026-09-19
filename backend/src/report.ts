import { GoogleGenAI, Type } from "@google/genai";
import { config } from "./config.js";
import { elderRef, taipeiDate, taipeiDayStart, Timestamp } from "./firestore.js";
import { notifyFamily } from "./notify.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

interface ReportJson {
  overall: "normal" | "watch" | "alert";
  medication: string;
  sleep: string;
  mood: string;
  meals: string;
  pain: string;
  events: string[];
  summary: string;
  followUps: string[];
}

const reportSchema = {
  type: Type.OBJECT,
  properties: {
    overall: { type: Type.STRING, enum: ["normal", "watch", "alert"] },
    medication: { type: Type.STRING, description: "用藥狀況一句話" },
    sleep: { type: Type.STRING, description: "睡眠狀況一句話" },
    mood: { type: Type.STRING, description: "心情狀況一句話" },
    meals: { type: Type.STRING, description: "飲食狀況一句話" },
    pain: { type: Type.STRING, description: "疼痛或不適一句話" },
    events: { type: Type.ARRAY, items: { type: Type.STRING }, description: "當日異常事件，含時間" },
    summary: { type: Type.STRING, description: "對話摘要，最多三句" },
    followUps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "建議家屬關心重點" },
  },
  required: ["overall", "medication", "sleep", "mood", "meals", "pain", "events", "summary", "followUps"],
};

const OVERALL_LABEL = { normal: "🟢 正常", watch: "🟡 需留意", alert: "🔴 需立即關心" } as const;

const hhmm = (ts: Timestamp) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(ts.toDate());

/** 產生並推送某天的狀況報告（預設今天，台北時區）。重複呼叫會覆寫同日報告。 */
export async function generateDailyReport(elderId: string, dateStr = taipeiDate()) {
  const elder = elderRef(elderId);
  const start = Timestamp.fromDate(taipeiDayStart(dateStr));
  const end = Timestamp.fromMillis(start.toMillis() + 24 * 3600 * 1000);

  const [elderDoc, logsSnap, alertsSnap, sessionsSnap] = await Promise.all([
    elder.get(),
    elder.collection("healthLogs").where("ts", ">=", start).where("ts", "<", end).orderBy("ts").get(),
    elder.collection("alerts").where("ts", ">=", start).where("ts", "<", end).orderBy("ts").get(),
    elder.collection("sessions").where("startedAt", ">=", start).where("startedAt", "<", end).get(),
  ]);

  const elderName = (elderDoc.data()?.name as string | undefined) ?? "長輩";
  const logs = logsSnap.docs.map((d) => d.data());
  const alerts = alertsSnap.docs.map((d) => d.data());
  const sessions = sessionsSnap.docs.map((d) => d.data());

  const minutes = Math.round(
    sessions.reduce((sum, s) => sum + (s.endedAt ? s.endedAt.toMillis() - s.startedAt.toMillis() : 0), 0) / 60000,
  );

  let report: ReportJson;
  if (sessions.length === 0 && logs.length === 0 && alerts.length === 0) {
    report = {
      overall: "watch",
      medication: "無資料",
      sleep: "無資料",
      mood: "無資料",
      meals: "無資料",
      pain: "無資料",
      events: [],
      summary: "今天長輩沒有和小幫手互動。",
      followUps: ["建議打電話確認長輩狀況"],
    };
  } else {
    const material = {
      elderName,
      healthLogs: logs.map((l) => ({ time: hhmm(l.ts), type: l.type, value: l.value, note: l.note })),
      alerts: alerts.map((a) => ({ time: hhmm(a.ts), level: a.level, reason: a.reason, quote: a.sourceQuote })),
      conversations: sessions.map((s) => s.transcript ?? []),
    };
    const res = await ai.models.generateContent({
      model: config.reportModel,
      contents: `你是長照家屬通報助手。根據以下長輩當日資料，用繁體中文產生給家屬的簡潔日報。
規則：只根據資料，不要推測或診斷；有 red 警報則 overall 必為 alert；有 yellow 警報或關鍵項目缺漏則至少 watch。

${JSON.stringify(material)}`,
      config: { responseMimeType: "application/json", responseSchema: reportSchema },
    });
    report = JSON.parse(res.text ?? "{}") as ReportJson;
  }

  const lines = [
    `📋 ${elderName}｜今日狀況報告 (${dateStr})`,
    `整體：${OVERALL_LABEL[report.overall] ?? report.overall}`,
    `💊 用藥：${report.medication}`,
    `😴 睡眠：${report.sleep}`,
    `🙂 心情：${report.mood}`,
    `🍚 飲食：${report.meals}`,
    `🩹 不適：${report.pain}`,
    ...(report.events.length ? [`⚠️ 異常：${report.events.join("；")}`] : []),
    `🗣 互動：共 ${sessions.length} 次、約 ${minutes} 分鐘`,
    ...(report.summary ? [`📝 ${report.summary}`] : []),
    ...(report.followUps.length ? [`👉 建議：${report.followUps.join("；")}`] : []),
    ...(config.dashboardUrl ? [`🔗 詳細儀表板：${config.dashboardUrl}`] : []),
  ];
  const text = lines.join("\n");

  const sent = await notifyFamily(
    elderId,
    `【長照小幫手】${elderName} ${dateStr} 今日狀況報告｜${OVERALL_LABEL[report.overall] ?? report.overall}`,
    text,
  );
  await elder.collection("dailyReports").doc(dateStr).set({
    generatedAt: Timestamp.now(),
    overall: report.overall,
    metrics: {
      medication: report.medication,
      sleep: report.sleep,
      mood: report.mood,
      meals: report.meals,
      pain: report.pain,
    },
    events: report.events,
    summary: report.summary,
    followUps: report.followUps,
    text,
    sent,
  });

  return { dateStr, sent, text };
}
