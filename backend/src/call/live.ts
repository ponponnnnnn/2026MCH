import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { DocumentReference } from "firebase-admin/firestore";
import type { WebSocket } from "ws";
import { config } from "../config.js";
import { elderRef, Timestamp } from "../data/firestore.js";
import { buildSystemPrompt } from "../prompt/index.js";
import { runTool } from "../tools/handlers.js";
import { toolDeclarations } from "../tools/declarations.js";
import { getProfile, saveProfile, registerTurn, registerTurnPace, type ElderProfile } from "../data/profile.js";
import { markAnswered } from "../data/call-attempts.js";
import { buildBriefing } from "./briefing.js";
import { summarizeSession, type TranscriptLine } from "./summary.js";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DUMP_DIR = fileURLToPath(new URL("../../debug-audio/", import.meta.url));

/** 診斷用：把收到的 16kHz/16-bit/mono PCM 原樣寫成 WAV，結束時回填長度 */
function openWavDump(name: string) {
  mkdirSync(DUMP_DIR, { recursive: true });
  const fd = openSync(`${DUMP_DIR}${name}.wav`, "w");
  writeSync(fd, Buffer.alloc(44));
  let bytes = 0;
  return {
    write(buf: Buffer) {
      writeSync(fd, buf);
      bytes += buf.length;
    },
    close() {
      const h = Buffer.alloc(44);
      h.write("RIFF", 0); h.writeUInt32LE(36 + bytes, 4); h.write("WAVE", 8);
      h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
      h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
      h.write("data", 36); h.writeUInt32LE(bytes, 40);
      writeSync(fd, h, 0, 44, 0);
      closeSync(fd);
      return bytes;
    },
  };
}
import { buildKickoff } from "../prompt/sections/opening.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * 一通語音對話 = 一條瀏覽器 WebSocket ↔ 一條 Gemini Live 連線。
 *
 * 瀏覽器 → 後端：
 *   binary  16kHz / 16-bit / mono PCM（little-endian）麥克風音訊
 *   text    JSON {"type":"end"} 結束通話
 * 後端 → 瀏覽器：
 *   binary  24kHz / 16-bit / mono PCM 模型語音
 *   text    JSON {"type":"ready"|"interrupted"|"transcript"|"turnComplete"|"error", ...}
 */
export async function handleCall(ws: WebSocket, elderId: string, attemptId?: string) {
  let sessionId = `dev-${Date.now()}`;
  let sessionRef: DocumentReference | undefined;
  // F11：這通電話的個人化 Profile；要等 Firestore 讀完才有值，但 finish() 在那之前就可能被呼叫
  // （ws 提早關閉／出錯），所以型別誠實標成可能是 undefined，收尾時要判斷過再寫回。
  let profile: ElderProfile | undefined;
  let elderName = "長輩";

  const transcript: TranscriptLine[] = [];
  const pushLine = (role: TranscriptLine["role"], text: string) => {
    const last = transcript[transcript.length - 1];
    if (last && last.role === role) last.text += text;
    else transcript.push({ role, text });
  };
  const sendJson = (obj: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

  // 訊號 4（語速估計）用：記錄這一輪長輩說話的第一個逐字稿片段時間，
  // 到這輪結束時用累積字數 / 經過時間估算語速。是近似值，不是精確測量。
  let elderSpeechStartedAt: number | null = null;
  let elderSpeechCharCount = 0;

  let session: Session | undefined;
  let closed = false;
  let statTimer: NodeJS.Timeout | undefined;
  let statBytes = 0;
  let statPeak = 0;
  let statChunks = 0;
  let statDup = 0;
  let lastChunkHash = "";
  let dump: ReturnType<typeof openWavDump> | undefined;

  const finish = async () => {
    if (closed) return;
    closed = true;
    if (statTimer) clearInterval(statTimer);
    if (dump) console.log(`[mic] 診斷：WAV 已寫入 ${dump.close()} bytes`);
    try {
      session?.close();
    } catch {}
    await Promise.all([
      sessionRef
        ?.update({
          endedAt: Timestamp.now(),
          transcript,
          // 首次通話判斷（call/briefing.ts）靠這個欄位分辨「真的聊過」跟「連線失敗／秒掛」
          elderSpoke: transcript.some((l) => l.role === "elder"),
        })
        .catch((e) => console.error("[session] 收尾寫入失敗", e)),
      // F11：把這通電話裡累積的 Profile 變化（追問次數、比喻分數、語速估計等）寫回 Firestore
      profile ? saveProfile(elderId, profile).catch((e) => console.error("[profile] 收尾寫入失敗", e)) : Promise.resolve(),
    ]);
    if (ws.readyState === ws.OPEN) ws.close();

    // 通話摘要在 ws 關閉之後才跑，失敗不影響前面已經完成的收尾寫入與關閉
    if (!config.devNoDb && sessionRef) {
      try {
        const summary = await summarizeSession(elderName, transcript);
        if (summary) await sessionRef.update({ summary });
      } catch (e) {
        console.error("[summary] 收尾寫入失敗", e);
      }
    }
  };

  // ws 的事件註冊放在任何 await 之前：通話前置作業（讀 Firestore、連線 Gemini）要花一點時間，
  // 這段期間瀏覽器就可能關頁或斷線，事件必須有人接住，'error' 沒人接會讓整個 process 掛掉。
  ws.on("message", (data, isBinary) => {
    if (closed) return;
    if (isBinary) {
      const buf = data as Buffer;
      statBytes += buf.length;
      statChunks += 1;
      if (dump) {
        const h = createHash("md5").update(buf).digest("hex");
        if (h === lastChunkHash) statDup += 1;
        lastChunkHash = h;
        dump.write(buf);
      }
      for (let i = 0; i + 1 < buf.length; i += 2) statPeak = Math.max(statPeak, Math.abs(buf.readInt16LE(i)));
      session?.sendRealtimeInput({
        audio: { data: buf.toString("base64"), mimeType: "audio/pcm;rate=16000" },
      });
      return;
    }
    try {
      const ctrl = JSON.parse(data.toString());
      if (ctrl.type === "end") void finish();
    } catch {}
  });
  ws.on("close", () => void finish());
  ws.on("error", () => void finish());

  // 通話前讀 Firestore 一次：登記姓名、稱呼、是否首次通話、時段、今天已聊、上次摘要、掛勾、健康項目優先序、已知基本資料
  const briefing = await buildBriefing(elderId);
  elderName = briefing.preferredName ?? briefing.elderName;

  if (!config.devNoDb) {
    sessionRef = elderRef(elderId).collection("sessions").doc();
    sessionId = sessionRef.id;
    await sessionRef.set({ startedAt: Timestamp.now() });
  }

  // F11：載入這位長輩的個人化 Profile。DEV_NO_DB 模式下 getProfile 內部會直接回傳預設值，
  // 所以個人化邏輯不需要等 Firestore 接好就能開發、測試。
  profile = await getProfile(elderId);

  const onMessage = async (msg: LiveServerMessage) => {
    const sc = msg.serverContent;
    if (sc?.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.inlineData?.data && ws.readyState === ws.OPEN) {
          ws.send(Buffer.from(part.inlineData.data, "base64"));
        }
      }
    }
    if (sc?.interrupted) sendJson({ type: "interrupted" });
    if (msg.goAway) {
      console.log(`[live] Gemini 即將斷線 timeLeft=${msg.goAway.timeLeft ?? "(未提供)"}`);
    }
    if (msg.sessionResumptionUpdate) {
      console.log(`[live] sessionResumptionUpdate resumable=${msg.sessionResumptionUpdate.resumable}`);
    }
    if (sc?.inputTranscription?.text) {
      const text = sc.inputTranscription.text;
      console.log(`[live] 長輩：「${text}」`);
      pushLine("elder", text);
      sendJson({ type: "transcript", role: "elder", text });
      // 這輪長輩開口的第一段文字，記錄起始時間；之後累加字數
      if (elderSpeechStartedAt === null) elderSpeechStartedAt = Date.now();
      elderSpeechCharCount += text.length;
    }
    if (sc?.outputTranscription?.text) {
      console.log(`[live] 小幫手：「${sc.outputTranscription.text}」`);
      pushLine("agent", sc.outputTranscription.text);
      sendJson({ type: "transcript", role: "agent", text: sc.outputTranscription.text });
    }
    if (sc?.turnComplete) {
      console.log("[live] turnComplete");
      sendJson({ type: "turnComplete" });
      // F11：一輪對話正常結束就累計輪數；追問發生時 register_clarification 工具會自己累計，
      // 這裡不重複加，避免同一輪被算兩次。
      // profile 在這裡一定已賦值：onMessage 只會被 Gemini 連線回呼，而連線是在 profile 讀完之後才建立的。
      registerTurn(profile!);

      // 訊號 4：這輪有蒐集到長輩說話的逐字稿，估算語速並重置累計器供下一輪使用
      if (elderSpeechStartedAt !== null && elderSpeechCharCount > 0) {
        const durationMs = Date.now() - elderSpeechStartedAt;
        registerTurnPace(profile!, elderSpeechCharCount, durationMs);
        elderSpeechStartedAt = null;
        elderSpeechCharCount = 0;
      }
    }

    if (msg.toolCall?.functionCalls) {
      const functionResponses = await Promise.all(
        msg.toolCall.functionCalls.map(async (fc) => {
          let response: Record<string, unknown>;
          try {
            response = await runTool(fc.name ?? "", fc.args ?? {}, { elderId, sessionId, profile: profile! });
          } catch (err) {
            console.error(`[tool:${fc.name}]`, err);
            response = { ok: false, error: String(err) };
          }
          return { id: fc.id, name: fc.name, response };
        }),
      );
      session?.sendToolResponse({ functionResponses });
    }
  };

  try {
    session = await ai.live.connect({
      model: config.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemPrompt(briefing, profile),
        tools: [{ functionDeclarations: toolDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => sendJson({ type: "ready", sessionId }),
        onmessage: (m) => void onMessage(m),
        onerror: (e) => {
          console.error("[live] error", e.message);
          sendJson({ type: "error", message: "語音連線發生錯誤" });
        },
        onclose: (e) => {
          console.log(`[live] Gemini 連線關閉 code=${e.code} reason=${e.reason || "(無)"}`);
          void finish();
        },
      },
    });
  } catch (err) {
    console.error("[live] 連線失敗", err);
    sendJson({ type: "error", message: "無法連線到語音服務" });
    await finish();
    return;
  }

  // 通話前置作業（讀 Firestore、連線 Gemini）期間 ws 已經關閉或出錯：finish() 已經跑過，
  // 這裡剛建立的 Gemini 連線是多出來的，關掉即可，不送 kickoff、不註冊 statTimer。
  if (closed || ws.readyState !== ws.OPEN) {
    try {
      session.close();
    } catch {}
    return;
  }

  // 後端主動響鈴接通：把對應的 callAttempt 標成 answered，失敗不能影響通話本身
  if (attemptId && !config.devNoDb) {
    try {
      await markAnswered(elderId, attemptId, sessionId, new Date());
    } catch (err) {
      console.error("[call-attempts] 標記 answered 失敗", err);
    }
  }

  // 長輩按下通話後由小幫手先開口，依首次通話／例行通話走不同開場順序（之後全靠語音）
  session.sendRealtimeInput({ text: buildKickoff(briefing) });

  // 收音診斷：每秒印出收到的音訊量、峰值、區塊數、與前一塊完全相同的區塊數（抓重複送）
  if (config.debugDumpAudio) {
    dump = openWavDump(sessionId);
    console.log(`[mic] 診斷：原始 PCM 會存到 debug-audio/${sessionId}.wav`);
  }
  statTimer = setInterval(() => {
    console.log(`[mic] ${statBytes} bytes/s, peak=${(statPeak / 32768).toFixed(3)}, chunks=${statChunks}, dup=${statDup}`);
    statBytes = 0;
    statPeak = 0;
    statChunks = 0;
    statDup = 0;
  }, 1000);
}
