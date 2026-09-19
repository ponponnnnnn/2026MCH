import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config.js";
import { elderRef, taipeiDate, taipeiDayStart, Timestamp } from "../data/firestore.js";
import { getTodayAttempts } from "../data/call-attempts.js";
import { notifyFamily } from "../notify.js";

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

const OVERALL_LABEL = { normal: "正常", watch: "需留意", alert: "需立即關心" } as const;
// email 客戶端對現代 CSS 支援參差不齊，色票用最保守的寫法（inline hex），
// 三色跟前端儀表板的 pine/amber/brick 對齊，維持同一套視覺語言
const OVERALL_COLOR = {
  normal: { bg: "#EEF3ED", text: "#33552F", border: "#4B7A45" },
  watch: { bg: "#FBF2E3", text: "#8C5F1E", border: "#C98A2E" },
  alert: { bg: "#FAEEEB", text: "#7E3426", border: "#B54B3A" },
} as const;

const hhmm = (ts: Timestamp) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(ts.toDate());

const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini 尖峰時段偶爾會回 503 (UNAVAILABLE，模型暫時過載)，這種錯誤重試通常就會過。
 * 最多重試 2 次，間隔逐次拉長 (1.5s / 3s)。其他類型錯誤（模型不存在、金鑰錯誤）直接拋出。
 */
async function generateContentWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 2,
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = message.includes("UNAVAILABLE") || message.includes("high demand");
      if (!isRetryable || attempt === maxRetries) throw err;
      const delayMs = 1500 * (attempt + 1);
      console.warn(`[report] Gemini 暫時過載，${delayMs}ms 後重試（第 ${attempt + 1} 次）`);
      await sleepMs(delayMs);
    }
  }
  throw lastErr;
}

/** 純文字版本（既有格式，當作 HTML 顯示不出來時的備援，也是 Firestore dailyReports.text 存的內容） */
function buildPlainText(
  elderName: string,
  dateStr: string,
  report: ReportJson,
  sessionCount: number,
  minutes: number,
  calls: { rang: number; answered: number; missed: number },
) {
  const OVERALL_EMOJI = { normal: "🟢", watch: "🟡", alert: "🔴" } as const;
  const lines = [
    `📋 ${elderName}｜今日狀況報告 (${dateStr})`,
    `整體：${OVERALL_EMOJI[report.overall]} ${OVERALL_LABEL[report.overall]}`,
    `💊 用藥：${report.medication}`,
    `😴 睡眠：${report.sleep}`,
    `🙂 心情：${report.mood}`,
    `🍚 飲食：${report.meals}`,
    `🩹 不適：${report.pain}`,
    ...(report.events.length ? [`⚠️ 異常：${report.events.join("；")}`] : []),
    `🗣 互動：共 ${sessionCount} 次、約 ${minutes} 分鐘`,
    ...(calls.rang > 0 ? [`📞 主動通話：響鈴 ${calls.rang} 次、接聽 ${calls.answered} 次、未接 ${calls.missed} 次`] : []),
    ...(report.summary ? [`📝 ${report.summary}`] : []),
    ...(report.followUps.length ? [`👉 建議：${report.followUps.join("；")}`] : []),
    ...(config.dashboardUrl ? [`🔗 詳細儀表板：${config.dashboardUrl}`] : []),
  ];
  return lines.join("\n");
}

/**
 * HTML 版本：表格排版是 email HTML 的慣例做法（不是偷懶），因為 Outlook 桌面版
 * 的排版引擎不支援 flexbox/grid，table 是少數所有主流信箱都吃的排版方式。
 * 所有樣式用 inline style，不用 <style> 區塊（部分信箱會整段吃掉 <style>）。
 */
function buildHtml(
  elderName: string,
  dateStr: string,
  report: ReportJson,
  sessionCount: number,
  minutes: number,
) {
  const color = OVERALL_COLOR[report.overall];
  const metricRow = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #EDEBE1;color:#8A8D82;font-size:13px;width:88px;vertical-align:top;">${label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #EDEBE1;color:#262922;font-size:14px;">${value}</td>
    </tr>`;

  const eventsBlock = report.events.length
    ? `
    <tr><td style="padding:16px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAEEEB;border-left:4px solid #B54B3A;">
        <tr><td style="padding:12px 16px;color:#7E3426;font-size:13px;">⚠ ${report.events.join("；")}</td></tr>
      </table>
    </td></tr>`
    : "";

  const followUpsBlock = report.followUps.length
    ? `
    <tr><td style="padding:16px 24px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3ED;border-left:4px solid #4B7A45;">
        <tr><td style="padding:12px 16px;color:#33552F;font-size:13px;">
          建議關心：${report.followUps.join("；")}
        </td></tr>
      </table>
    </td></tr>`
    : "";

  const dashboardButton = config.dashboardUrl
    ? `
    <tr><td style="padding:24px 24px 0;text-align:center;">
      <a href="${config.dashboardUrl}" style="display:inline-block;padding:10px 24px;background:#33552F;color:#ffffff;text-decoration:none;font-size:14px;border-radius:4px;">
        查看完整儀表板
      </a>
    </td></tr>`
    : "";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F4;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;font-family:'PingFang TC','Microsoft JhengHei',Arial,sans-serif;">

      <tr><td style="padding:24px 24px 8px;">
        <p style="margin:0;color:#8A8D82;font-size:13px;">長照小幫手・今日狀況報告</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-top:4px;font-size:22px;color:#262922;font-weight:bold;">${elderName}</td>
          <td style="padding-left:12px;padding-top:4px;">
            <span style="display:inline-block;padding:4px 12px;background:${color.bg};color:${color.text};border:1px solid ${color.border};font-size:13px;border-radius:4px;">
              ${OVERALL_LABEL[report.overall]}
            </span>
          </td>
        </tr></table>
        <p style="margin:4px 0 0;color:#8A8D82;font-size:12px;">${dateStr}｜共互動 ${sessionCount} 次、約 ${minutes} 分鐘</p>
      </td></tr>

      <tr><td style="padding:8px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${metricRow("用藥", report.medication)}
          ${metricRow("睡眠", report.sleep)}
          ${metricRow("心情", report.mood)}
          ${metricRow("飲食", report.meals)}
          ${metricRow("不適", report.pain)}
        </table>
      </td></tr>

      ${eventsBlock}

      ${report.summary ? `<tr><td style="padding:16px 24px 0;color:#262922;font-size:14px;line-height:1.6;">${report.summary}</td></tr>` : ""}

      ${followUpsBlock}
      ${dashboardButton}

      <tr><td style="padding:24px 24px 20px;text-align:center;">
        <p style="margin:0;color:#B4B2A9;font-size:11px;">此報告由 AI 根據當日對話自動彙整，僅供參考，非醫療診斷。</p>
      </td></tr>

    </table>
  </td></tr>
</table>`;
}

/** 產生並推送某天的狀況報告（預設今天，台北時區）。重複呼叫會覆寫同日報告。 */
export async function generateDailyReport(elderId: string, dateStr = taipeiDate()) {
  const elder = elderRef(elderId);
  const start = Timestamp.fromDate(taipeiDayStart(dateStr));
  const end = Timestamp.fromMillis(start.toMillis() + 24 * 3600 * 1000);

  const [elderDoc, logsSnap, alertsSnap, sessionsSnap, concernsSnap, attempts] = await Promise.all([
    elder.get(),
    elder.collection("healthLogs").where("ts", ">=", start).where("ts", "<", end).orderBy("ts").get(),
    elder.collection("alerts").where("ts", ">=", start).where("ts", "<", end).orderBy("ts").get(),
    elder.collection("sessions").where("startedAt", ">=", start).where("startedAt", "<", end).get(),
    elder.collection("concerns").where("ts", ">=", start).where("ts", "<", end).orderBy("ts").get(),
    getTodayAttempts(elderId, dateStr),
  ]);

  const elderName = (elderDoc.data()?.name as string | undefined) ?? "長輩";
  const logs = logsSnap.docs.map((d) => d.data());
  const alerts = alertsSnap.docs.map((d) => d.data());
  const sessions = sessionsSnap.docs.map((d) => d.data());
  const concerns = concernsSnap.docs.map((d) => d.data());

  const minutes = Math.round(
    sessions.reduce((sum, s) => sum + (s.endedAt ? s.endedAt.toMillis() - s.startedAt.toMillis() : 0), 0) / 60000,
  );

  const calls = {
    rang: attempts.length,
    answered: attempts.filter((a) => a.status === "answered").length,
    missed: attempts.filter((a) => a.status === "missed").length,
  };

  let report: ReportJson;
  if (sessions.length === 0 && logs.length === 0 && alerts.length === 0 && concerns.length === 0) {
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
      // 健康項目清單以外、模型主動聽到的擔憂（詐騙、居家安全、走失等），來源見 tools/handlers.ts flag_uncovered_concern
      concerns: concerns.map((c) => ({ time: hhmm(c.ts), category: c.category, summary: c.summary, quote: c.quote })),
      calls,
    };
    const res = await generateContentWithRetry({
      model: config.reportModel,
      contents: `你是長照家屬通報助手。根據以下長輩當日資料，用繁體中文產生給家屬的簡潔日報。
規則：只根據資料，不要推測或診斷；有 red 警報則 overall 必為 alert；有 yellow 警報或關鍵項目缺漏則至少 watch；
concerns 是健康項目以外的擔憂，請視情況整理進 events 或 followUps。

${JSON.stringify(material)}`,
      config: { responseMimeType: "application/json", responseSchema: reportSchema },
    });
    report = JSON.parse(res.text ?? "{}") as ReportJson;
  }

  // 主動響鈴全部未接、且今天完全沒有任何 session：不管 overall 是模型判的還是上面的預設值，都至少要 watch，並提醒家屬打電話確認
  if (calls.rang > 0 && calls.answered === 0 && sessions.length === 0) {
    if (report.overall === "normal") report.overall = "watch";
    if (!report.followUps.some((f) => f.includes("打電話"))) {
      report.followUps.push("建議打電話確認長輩狀況（今天主動撥打的提醒電話都沒有接聽）");
    }
  }

  const text = buildPlainText(elderName, dateStr, report, sessions.length, minutes, calls);
  const html = buildHtml(elderName, dateStr, report, sessions.length, minutes);

  const sent = await notifyFamily(
    elderId,
    `【長照小幫手】${elderName} ${dateStr} 今日狀況報告｜${OVERALL_LABEL[report.overall]}`,
    text,
    html,
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
