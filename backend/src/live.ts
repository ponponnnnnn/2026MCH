import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { DocumentReference } from "firebase-admin/firestore";
import type { WebSocket } from "ws";
import { config } from "./config.js";
import { elderRef, Timestamp } from "./firestore.js";
import { buildSystemPrompt } from "./prompt.js";
import { runTool, toolDeclarations } from "./tools.js";
import { getProfile, saveProfile, registerTurn } from "./profile.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

interface TranscriptLine {
  role: "elder" | "agent";
  text: string;
}

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
export async function handleCall(ws: WebSocket, elderId: string) {
  let elderName = "長輩";
  let sessionId = `dev-${Date.now()}`;
  let sessionRef: DocumentReference | undefined;
  if (!config.devNoDb) {
    const elder = elderRef(elderId);
    elderName = ((await elder.get()).data()?.name as string | undefined) ?? "長輩";
    sessionRef = elder.collection("sessions").doc();
    sessionId = sessionRef.id;
    await sessionRef.set({ startedAt: Timestamp.now() });
  }

  // F11：載入這位長輩的個人化 Profile。DEV_NO_DB 模式下 getProfile 內部會直接回傳預設值，
  // 所以個人化邏輯不需要等 Firestore 接好就能開發、測試。
  const profile = await getProfile(elderId);

  const transcript: TranscriptLine[] = [];
  const pushLine = (role: TranscriptLine["role"], text: string) => {
    const last = transcript[transcript.length - 1];
    if (last && last.role === role) last.text += text;
    else transcript.push({ role, text });
  };
  const sendJson = (obj: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

  let session: Session | undefined;
  let closed = false;
  let statTimer: NodeJS.Timeout | undefined;

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
    if (sc?.inputTranscription?.text) {
      pushLine("elder", sc.inputTranscription.text);
      sendJson({ type: "transcript", role: "elder", text: sc.inputTranscription.text });
    }
    if (sc?.outputTranscription?.text) {
      pushLine("agent", sc.outputTranscription.text);
      sendJson({ type: "transcript", role: "agent", text: sc.outputTranscription.text });
    }
    if (sc?.turnComplete) {
      sendJson({ type: "turnComplete" });
      // F11：一輪對話正常結束就累計輪數；追問發生時 register_clarification 工具會自己累計，
      // 這裡不重複加，避免同一輪被算兩次。
      registerTurn(profile);
    }

    if (msg.toolCall?.functionCalls) {
      const functionResponses = await Promise.all(
        msg.toolCall.functionCalls.map(async (fc) => {
          let response: Record<string, unknown>;
          try {
            response = await runTool(fc.name ?? "", fc.args ?? {}, { elderId, sessionId, profile });
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

  const finish = async () => {
    if (closed) return;
    closed = true;
    if (statTimer) clearInterval(statTimer);
    try {
      session?.close();
    } catch {}
    await Promise.all([
      sessionRef
        ?.update({ endedAt: Timestamp.now(), transcript })
        .catch((e) => console.error("[session] 收尾寫入失敗", e)),
      // F11：把這通電話裡累積的 Profile 變化（追問次數、語彙等級調整）寫回 Firestore
      saveProfile(elderId, profile).catch((e) => console.error("[profile] 收尾寫入失敗", e)),
    ]);
    if (ws.readyState === ws.OPEN) ws.close();
  };

  try {
    session = await ai.live.connect({
      model: config.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemPrompt(elderName, profile),
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
        onclose: () => void finish(),
      },
    });
  } catch (err) {
    console.error("[live] 連線失敗", err);
    sendJson({ type: "error", message: "無法連線到語音服務" });
    await finish();
    return;
  }

  // 長輩按下通話後由小幫手先開口問候（之後全靠語音）
  session.sendRealtimeInput({ text: `（${elderName}剛按下通話按鈕，請你先親切問候並開始聊天）` });

  // 收音診斷：每秒印出收到的音訊量與峰值
  let statBytes = 0;
  let statPeak = 0;
  statTimer = setInterval(() => {
    console.log(`[mic] ${statBytes} bytes/s, peak=${(statPeak / 32768).toFixed(3)}`);
    statBytes = 0;
    statPeak = 0;
  }, 1000);

  ws.on("message", (data, isBinary) => {
    if (closed) return;
    if (isBinary) {
      const buf = data as Buffer;
      statBytes += buf.length;
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
}
