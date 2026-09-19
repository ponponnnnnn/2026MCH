/**
 * 不需要麥克風的 Gemini Live 探針：用文字走跟 call/live.ts 一樣的設定（同一份 system prompt、
 * 同一組工具、AUDIO 輸出），看工具呼叫前後 session 會不會斷、模型會不會繼續回應。
 * 會真的呼叫 Gemini（需要 GEMINI_API_KEY），不碰 Firestore。
 *
 *   npx tsx --env-file=.env src/dev/probe-live.ts
 */
process.env.DEV_NO_DB = "1";

async function main() {
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const { config } = await import("../config.js");
  const { buildBriefing } = await import("../call/briefing.js");
  const { getProfile } = await import("../data/profile.js");
  const { buildSystemPrompt } = await import("../prompt/index.js");
  const { buildKickoff } = await import("../prompt/sections/opening.js");
  const { toolDeclarations } = await import("../tools/declarations.js");
  const { runTool } = await import("../tools/handlers.js");

  const elderId = process.argv[2] ?? "demo";
  const briefing = await buildBriefing(elderId);
  const profile = await getProfile(elderId);
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  let said = "";
  let audioBytes = 0;
  let toolCalledThisTurn = false;
  let closed: string | null = null;
  let turnDone: (() => void) | null = null;
  const t0 = Date.now();
  const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

  const session = await ai.live.connect({
    model: config.liveModel,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: buildSystemPrompt(briefing, profile),
      tools: [{ functionDeclarations: toolDeclarations }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onopen: () => log("OPEN model=" + config.liveModel),
      onerror: (e) => log("ERROR", e.message),
      onclose: (e) => {
        closed = `code=${e.code} reason=${e.reason || "(空)"}`;
        log("CLOSE", closed);
        turnDone?.();
      },
      onmessage: async (msg) => {
        const sc = msg.serverContent;
        for (const p of sc?.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) audioBytes += Buffer.from(p.inlineData.data, "base64").length;
        }
        if (sc?.outputTranscription?.text) said += sc.outputTranscription.text;
        if (msg.goAway) log("GOAWAY", JSON.stringify(msg.goAway));
        if (msg.toolCall?.functionCalls) {
          const functionResponses = [];
          for (const fc of msg.toolCall.functionCalls) {
            log("TOOLCALL", fc.name, JSON.stringify(fc.args));
            const response = await runTool(fc.name ?? "", fc.args ?? {}, { elderId, sessionId: "probe", profile });
            functionResponses.push({ id: fc.id, name: fc.name, response });
          }
          session.sendToolResponse({ functionResponses });
          toolCalledThisTurn = true;
          log("TOOLRESPONSE sent x" + functionResponses.length);
        }
        if (sc?.turnComplete) {
          log(`TURN_COMPLETE 音訊=${audioBytes}B 小幫手：「${said.trim()}」`);
          const silentToolTurn = toolCalledThisTurn && audioBytes === 0;
          said = "";
          audioBytes = 0;
          toolCalledThisTurn = false;
          if (silentToolTurn) {
            log("... 工具呼叫後這輪沒講話，再等 12 秒看模型會不會自己接著開口");
            setTimeout(() => {
              if (turnDone) {
                log("!!! 等了 12 秒，模型還是沒開口");
                turnDone();
              }
            }, 12000);
            return;
          }
          turnDone?.();
        }
      },
    },
  });

  const turn = (label: string, text: string) =>
    new Promise<void>((resolve) => {
      if (closed) return resolve();
      log(`>>> ${label}：${text}`);
      const timer = setTimeout(() => {
        log("!!! 30 秒內沒有 turnComplete（模型沒回應）");
        resolve();
      }, 30000);
      turnDone = () => {
        clearTimeout(timer);
        turnDone = null;
        resolve();
      };
      session.sendRealtimeInput({ text });
    });

  await turn("kickoff", buildKickoff(briefing));
  await turn("長輩", "喂，你好。");
  await turn("長輩", "叫我阿霞姨就好啦。");
  await turn("長輩", "今天還好啦，就是昨天晚上沒睡好，半夜一直醒來。");
  await turn("長輩", "我女兒淑芬每兩個禮拜會來看我。");
  await turn("長輩", "前幾天有人打電話來叫我去匯款，我覺得怪怪的。");

  log(closed ? `結論：session 中途被關閉 → ${closed}` : "結論：六輪都走完，session 沒斷");
  try {
    session.close();
  } catch {}
  setTimeout(() => process.exit(0), 500);
}

main().catch((e) => {
  console.error("探針失敗：", e);
  process.exit(1);
});
