const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8080),
  /** DEV_NO_DB=1：不連 Firestore，只驗證語音；tool call 只印 log */
  devNoDb: env.DEV_NO_DB === "1",
  geminiApiKey: env.GEMINI_API_KEY ?? "",
  liveModel: env.LIVE_MODEL ?? "gemini-3.8-live",
  reportModel: env.REPORT_MODEL ?? "gemini-flash-latest",
  gmailUser: env.GMAIL_USER ?? "",
  gmailAppPassword: env.GMAIL_APP_PASSWORD ?? "",
  familyEmails: (env.FAMILY_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
  jobSecret: env.JOB_SECRET ?? "",
  dashboardUrl: env.DASHBOARD_URL ?? "",
  /** DEMO_MODE=1：開放免密鑰的 /demo/daily-report（僅 Demo 用，正式環境關閉） */
  demoMode: env.DEMO_MODE === "1",
  defaultElderId: env.DEFAULT_ELDER_ID ?? "demo",
};

if (!config.geminiApiKey) {
  console.warn("[config] GEMINI_API_KEY 未設定，語音與晚報功能無法使用");
}
