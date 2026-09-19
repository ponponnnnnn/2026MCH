/**
 * 獨立測試規則層（prompt/）的組裝結果，完全不呼叫 Gemini API、不需要 GEMINI_API_KEY、不連 Firestore。
 * 只匯入 call/briefing.ts（DEV_NO_DB 模式回傳固定 fixture）、data/profile.ts、prompt/index.ts、tools/declarations.ts。
 *
 * 執行方式（在 backend 資料夾下）：
 *   npx tsx src/dev/test-prompt.ts
 *
 * 不需要先設定 .env，這支腳本自己會用 DEV_NO_DB 模式。任一斷言失敗會印出訊息並 process.exit(1)。
 *
 * 全部改用動態 import()：靜態 import 會被提升到模組最上方執行，
 * 比這裡設定 process.env.DEV_NO_DB 還早，config.ts 會讀到還沒設定的值。
 */

process.env.DEV_NO_DB = "1";

const failures: string[] = [];
function assert(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures.push(label);
}

const hanCharCount = (text: string): number => (text.match(/\p{Script=Han}/gu) ?? []).length;

async function main() {
  const { buildBriefing } = await import("../call/briefing.js");
  const { getProfile } = await import("../data/profile.js");
  const { buildSystemPrompt } = await import("../prompt/index.js");
  const { toolDeclarations } = await import("../tools/declarations.js");
  const { runTool } = await import("../tools/handlers.js");
  const { PERSONA } = await import("../prompt/sections/persona.js");
  const { OPENING_FIRST_CALL, OPENING_ROUTINE, buildKickoff } = await import("../prompt/sections/opening.js");
  const { TOPICS } = await import("../prompt/sections/topics.js");
  const { DEPTH } = await import("../prompt/sections/depth.js");
  const { GETTING_TO_KNOW } = await import("../prompt/sections/getting-to-know.js");
  const { SENSITIVE } = await import("../prompt/sections/sensitive.js");
  const { RECORDING } = await import("../prompt/sections/recording.js");

  const profile = await getProfile("demo");

  const firstCallBriefing = await buildBriefing("demo");
  const routineBriefing = await buildBriefing("demo-routine");

  const firstCallPrompt = buildSystemPrompt(firstCallBriefing, profile);
  const routinePrompt = buildSystemPrompt(routineBriefing, profile);

  console.log("========== 首次通話 system prompt ==========");
  console.log(firstCallPrompt);
  console.log(`\n（共 ${hanCharCount(firstCallPrompt)} 個漢字）`);

  console.log("\n========== 例行通話 system prompt ==========");
  console.log(routinePrompt);
  console.log(`\n（共 ${hanCharCount(routinePrompt)} 個漢字）`);

  const toolNames = toolDeclarations.map((d) => d.name);
  console.log("\n========== 工具名稱清單 ==========");
  console.log(toolNames.join(", "));

  console.log("\n========== 斷言 ==========");

  assert("首次通話 briefing.isFirstCall 為 true", firstCallBriefing.isFirstCall === true);
  assert("例行通話 briefing.isFirstCall 為 false", routineBriefing.isFirstCall === false);

  const sectionCodePattern = /\b[ORP]\d{1,2}\b/;
  assert("首次通話 prompt 不含規則代號", !sectionCodePattern.test(firstCallPrompt));
  assert("例行通話 prompt 不含規則代號", !sectionCodePattern.test(routinePrompt));

  assert("首次通話 prompt 含「怎麼稱呼」", firstCallPrompt.includes("怎麼稱呼"));
  const routineOnlyLine = "是我，小幫手啦";
  assert("首次通話 prompt 不含例行版開場獨有句", !firstCallPrompt.includes(routineOnlyLine));

  assert("例行通話 prompt 含 fixture 掛勾「蘭花」", routinePrompt.includes("蘭花"));
  assert("例行通話 prompt 含「睡眠」優先提示", routinePrompt.includes("睡眠"));

  const expectedTools = [
    "log_health",
    "raise_alert",
    "register_clarification",
    "register_metaphor_result",
    "mark_topic_hook",
    "flag_uncovered_concern",
    "remember_fact",
  ];
  assert(
    "工具清單恰為預期七個（含順序）",
    toolNames.length === expectedTools.length && toolNames.every((n, i) => n === expectedTools[i]),
  );

  const commonRuleText = [PERSONA, TOPICS, DEPTH, GETTING_TO_KNOW, SENSITIVE, RECORDING].join("");
  const firstCallRuleCharCount = hanCharCount(commonRuleText + OPENING_FIRST_CALL);
  const routineRuleCharCount = hanCharCount(commonRuleText + OPENING_ROUTINE);
  console.log(`\n規則文字（首次通話組合）漢字數：${firstCallRuleCharCount}`);
  console.log(`規則文字（例行通話組合）漢字數：${routineRuleCharCount}`);
  assert(
    "首次通話規則文字漢字數落在 1400–2700",
    firstCallRuleCharCount >= 1400 && firstCallRuleCharCount <= 2700,
  );
  assert(
    "例行通話規則文字漢字數落在 1400–2700",
    routineRuleCharCount >= 1400 && routineRuleCharCount <= 2700,
  );

  console.log("\n========== kickoff 觸發語 ==========");
  const firstCallKickoff = buildKickoff(firstCallBriefing);
  const routineKickoff = buildKickoff(routineBriefing);
  console.log(`首次通話：${firstCallKickoff}`);
  console.log(`例行通話：${routineKickoff}`);
  assert("首次通話 kickoff 含「第一次通話」", firstCallKickoff.includes("第一次通話"));
  assert("例行通話 kickoff 不含「開始聊天」（會讓模型一輪講完問候+提問）", !routineKickoff.includes("開始聊天"));
  assert("例行通話 kickoff 含「不帶問句」", routineKickoff.includes("不帶問句"));

  console.log("\n========== runTool 輸入驗證（DEV_NO_DB，信任邊界） ==========");
  const toolCtx = { elderId: "demo", sessionId: "test-session", profile };
  const rememberConstructor = await runTool("remember_fact", { field: "constructor", value: "x" }, toolCtx);
  const rememberProto = await runTool("remember_fact", { field: "__proto__", value: "x" }, toolCtx);
  const rememberUnknown = await runTool("remember_fact", { field: "bogus", value: "x" }, toolCtx);
  const rememberEmpty = await runTool("remember_fact", { field: "preferredName", value: "" }, toolCtx);
  const rememberValid = await runTool("remember_fact", { field: "preferredName", value: "阿霞姨" }, toolCtx);
  const hookEmpty = await runTool("mark_topic_hook", { entity: "", context: "x" }, toolCtx);
  const hookValid = await runTool("mark_topic_hook", { entity: "蘭花", context: "冒了新花苞" }, toolCtx);
  const concernFallback = await runTool(
    "flag_uncovered_concern",
    { category: "not_a_real_category", summary: "s", quote: "q" },
    toolCtx,
  );
  console.log(JSON.stringify({ rememberConstructor, rememberProto, rememberUnknown, rememberEmpty, rememberValid, hookEmpty, hookValid, concernFallback }));
  assert("remember_fact field='constructor' 被白名單拒絕（原型鏈繞過）", rememberConstructor.ok === false);
  assert("remember_fact field='__proto__' 被白名單拒絕", rememberProto.ok === false);
  assert("remember_fact field='bogus' 被白名單拒絕", rememberUnknown.ok === false);
  assert("remember_fact value 空字串被拒絕", rememberEmpty.ok === false);
  assert("remember_fact 合法輸入通過（devNoDb 只印 log）", rememberValid.ok === true);
  assert("mark_topic_hook entity 空字串被拒絕", hookEmpty.ok === false);
  assert("mark_topic_hook 合法輸入通過", hookValid.ok === true);
  assert("flag_uncovered_concern 未知 category 退回 other、仍算成功", concernFallback.ok === true);

  console.log(`\n${failures.length === 0 ? "全部通過" : `失敗 ${failures.length} 項：${failures.join("；")}`}`);
  if (failures.length > 0) process.exit(1);
}

void main();
