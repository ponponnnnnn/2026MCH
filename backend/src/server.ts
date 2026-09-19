import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { handleCall } from "./live.js";
import { generateDailyReport } from "./report.js";

const app = express();
app.use(express.json());
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

/** 保護排程／手動觸發的 endpoint（Cloud Scheduler 以 x-job-secret 帶入） */
function requireJobSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.jobSecret || req.header("x-job-secret") !== config.jobSecret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// 每晚 20:00 由 Cloud Scheduler 呼叫；Demo 現場也可手動 POST 觸發
app.post("/jobs/daily-report", requireJobSecret, async (req, res) => {
  try {
    const elderId = (req.body?.elderId as string | undefined) ?? config.defaultElderId;
    const date = req.body?.date as string | undefined;
    res.json(await generateDailyReport(elderId, date));
  } catch (err) {
    console.error("[daily-report]", err);
    res.status(500).json({ error: String(err) });
  }
});

// Demo 專用：App 內「立即產生晚報」按鈕呼叫，不需密鑰，DEMO_MODE=1 才啟用
app.post("/demo/daily-report", async (req, res) => {
  if (!config.demoMode) {
    res.status(404).json({ error: "not found" });
    return;
  }
  try {
    const elderId = (req.body?.elderId as string | undefined) ?? config.defaultElderId;
    res.json(await generateDailyReport(elderId));
  } catch (err) {
    console.error("[demo-daily-report]", err);
    res.status(500).json({ error: String(err) });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const elderId = url.searchParams.get("elderId") ?? config.defaultElderId;
  handleCall(ws, elderId).catch((err) => {
    console.error("[ws] handleCall 失敗", err);
    ws.close();
  });
});

server.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});
