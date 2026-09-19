/**
 * 獨立測試通話排程的純函式（jobs/call-rules.ts 的 decideCall / parseCallWindows）
 * 與 HTTP 輸入驗證用的純函式（data/firestore.ts isValidId、data/devices.ts normalizeToken）。
 * 完全不呼叫 Gemini/FCM API、不連 Firestore。
 *
 * 執行方式（在 backend 資料夾下）：
 *   npx tsx src/dev/test-call-schedule.ts
 *
 * 全部改用動態 import()：靜態 import 會被提升到模組最上方執行，
 * 比這裡設定 process.env.DEV_NO_DB 還早，config.ts 會讀到還沒設定的值（見 test-prompt.ts）。
 */

process.env.DEV_NO_DB = "1";

const failures: string[] = [];
function assert(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures.push(label);
}

async function main() {
  const { decideCall, parseCallWindows, DEFAULT_CALL_WINDOWS } = await import("../jobs/call-rules.js");
  const { isValidId } = await import("../data/firestore.js");
  const { normalizeToken } = await import("../data/devices.js");

  const t = (iso: string) => new Date(iso); // 全部用帶 +08:00 offset 的 ISO 字串，避免受執行環境時區影響

  console.log("========== decideCall：規則 A（時段） ==========");

  assert(
    "時段內、無任何紀錄 → 響(window)",
    (() => {
      const r = decideCall({
        now: t("2026-01-15T09:10:00+08:00"),
        callWindows: ["09:00", "19:00"],
        attemptsToday: [],
        sessionsToday: [],
        recentYellowAlert: false,
      });
      return r.ring === true && r.window === "09:00" && r.reason === "window";
    })(),
  );

  assert(
    "時段內、已有 answered 的 attempt → 不響",
    decideCall({
      now: t("2026-01-15T09:10:00+08:00"),
      callWindows: ["09:00", "19:00"],
      attemptsToday: [
        { window: "09:00", reason: "window", status: "answered", ts: t("2026-01-15T09:01:00+08:00") },
      ],
      sessionsToday: [],
      recentYellowAlert: false,
    }).ring === false,
  );

  assert(
    "時段內、長輩自己按按鈕打過且有 endedAt → 不響",
    decideCall({
      now: t("2026-01-15T09:10:00+08:00"),
      callWindows: ["09:00", "19:00"],
      attemptsToday: [],
      sessionsToday: [{ startedAt: t("2026-01-15T09:05:00+08:00"), endedAt: t("2026-01-15T09:15:00+08:00") }],
      recentYellowAlert: false,
    }).ring === false,
  );

  assert(
    "上次響鈴未滿 15 分 → 不響",
    decideCall({
      now: t("2026-01-15T09:10:00+08:00"),
      callWindows: ["09:00", "19:00"],
      attemptsToday: [{ window: "09:00", reason: "window", status: "missed", ts: t("2026-01-15T09:05:00+08:00") }],
      sessionsToday: [],
      recentYellowAlert: false,
    }).ring === false,
  );

  assert(
    "上次響鈴滿 15 分 → 響(retry)",
    (() => {
      const r = decideCall({
        now: t("2026-01-15T09:10:00+08:00"),
        callWindows: ["09:00", "19:00"],
        attemptsToday: [{ window: "09:00", reason: "window", status: "missed", ts: t("2026-01-15T08:55:00+08:00") }],
        sessionsToday: [],
        recentYellowAlert: false,
      });
      return r.ring === true && r.reason === "retry" && r.window === "09:00";
    })(),
  );

  assert(
    "這個時段已響 3 次（首響+2次重試）→ 不響",
    decideCall({
      now: t("2026-01-15T09:50:00+08:00"),
      callWindows: ["09:00", "19:00"],
      attemptsToday: [
        { window: "09:00", reason: "window", status: "missed", ts: t("2026-01-15T09:00:00+08:00") },
        { window: "09:00", reason: "retry", status: "missed", ts: t("2026-01-15T09:20:00+08:00") },
        { window: "09:00", reason: "retry", status: "missed", ts: t("2026-01-15T09:40:00+08:00") },
      ],
      sessionsToday: [],
      recentYellowAlert: false,
    }).ring === false,
  );

  assert(
    "時段外 → 不響",
    decideCall({
      now: t("2026-01-15T12:00:00+08:00"),
      callWindows: ["09:00", "19:00"],
      attemptsToday: [],
      sessionsToday: [],
      recentYellowAlert: false,
    }).ring === false,
  );

  console.log("\n========== decideCall：規則 B（風險加打） ==========");

  const riskBoostBase = {
    now: t("2026-01-15T14:00:00+08:00"), // 不在任何時段內、不在安靜時段
    callWindows: ["09:00", "19:00"],
    attemptsToday: [] as Parameters<typeof decideCall>[0]["attemptsToday"],
    sessionsToday: [{ startedAt: t("2026-01-15T06:50:00+08:00"), endedAt: t("2026-01-15T07:00:00+08:00") }],
    recentYellowAlert: true,
  };

  assert(
    "風險加打：四條件全滿足 → 響(risk_boost, window=boost)",
    (() => {
      const r = decideCall(riskBoostBase);
      return r.ring === true && r.window === "boost" && r.reason === "risk_boost";
    })(),
  );

  assert(
    "風險加打：缺「24小時內 yellow 警報」→ 不響",
    decideCall({ ...riskBoostBase, recentYellowAlert: false }).ring === false,
  );

  assert(
    "風險加打：缺「距上一通完成 > 6 小時」（5 小時前才通完話）→ 不響",
    decideCall({
      ...riskBoostBase,
      sessionsToday: [{ startedAt: t("2026-01-15T08:50:00+08:00"), endedAt: t("2026-01-15T09:00:00+08:00") }],
    }).ring === false,
  );

  assert(
    "風險加打：安靜時段（21:00–08:00）擋掉加打 → 不響",
    decideCall({
      ...riskBoostBase,
      now: t("2026-01-15T22:00:00+08:00"),
      sessionsToday: [{ startedAt: t("2026-01-15T06:50:00+08:00"), endedAt: t("2026-01-15T07:00:00+08:00") }],
    }).ring === false,
  );

  assert(
    "風險加打：缺「最近 6 小時沒有 risk_boost」（2 小時前才加打過）→ 不響",
    decideCall({
      ...riskBoostBase,
      attemptsToday: [{ window: "boost", reason: "risk_boost", status: "missed", ts: t("2026-01-15T12:00:00+08:00") }],
    }).ring === false,
  );

  console.log("\n========== parseCallWindows：格式解析與預設值 ==========");

  assert("callWindows 為 undefined → 用預設", JSON.stringify(parseCallWindows(undefined)) === JSON.stringify(DEFAULT_CALL_WINDOWS));
  assert("callWindows 不是陣列 → 用預設", JSON.stringify(parseCallWindows("09:00")) === JSON.stringify(DEFAULT_CALL_WINDOWS));
  assert("callWindows 為空陣列 → 用預設", JSON.stringify(parseCallWindows([])) === JSON.stringify(DEFAULT_CALL_WINDOWS));
  assert(
    "callWindows 格式錯（缺前導零）→ 用預設",
    JSON.stringify(parseCallWindows(["9:00", "19:00"])) === JSON.stringify(DEFAULT_CALL_WINDOWS),
  );
  assert(
    "callWindows 格式正確 → 照用",
    JSON.stringify(parseCallWindows(["08:30", "20:15"])) === JSON.stringify(["08:30", "20:15"]),
  );

  console.log("\n========== decideCall：跨日邊界（23:30 的時段） ==========");

  assert(
    "23:30 時段、now=隔天 00:15（仍在 60 分鐘內）→ 響(window)",
    (() => {
      const r = decideCall({
        now: t("2026-01-16T00:15:00+08:00"),
        callWindows: ["23:30"],
        attemptsToday: [],
        sessionsToday: [],
        recentYellowAlert: false,
      });
      return r.ring === true && r.window === "23:30" && r.reason === "window";
    })(),
  );

  assert(
    "23:30 時段、now=隔天 00:35（已超過 60 分鐘）→ 不響",
    decideCall({
      now: t("2026-01-16T00:35:00+08:00"),
      callWindows: ["23:30"],
      attemptsToday: [],
      sessionsToday: [],
      recentYellowAlert: false,
    }).ring === false,
  );

  console.log("\n========== HTTP 輸入驗證用的純函式 ==========");

  assert("isValidId('demo') 合法", isValidId("demo") === true);
  assert("isValidId('demo-elder_123') 合法", isValidId("demo-elder_123") === true);
  assert("isValidId 剛好 64 字元合法", isValidId("a".repeat(64)) === true);
  assert("isValidId 65 字元不合法", isValidId("a".repeat(65)) === false);
  assert("isValidId 空字串不合法", isValidId("") === false);
  assert("isValidId 含空白不合法", isValidId("has space") === false);
  assert("isValidId 含路徑字元不合法", isValidId("../etc/passwd") === false);
  assert("isValidId 非字串（number）不合法", isValidId(123) === false);
  assert("isValidId undefined 不合法", isValidId(undefined) === false);
  assert("isValidId null 不合法", isValidId(null) === false);
  assert("isValidId 物件不合法", isValidId({}) === false);

  assert("normalizeToken 去頭尾空白", normalizeToken("  abc123  ") === "abc123");
  assert("normalizeToken 空字串不合法", normalizeToken("") === null);
  assert("normalizeToken 全空白不合法", normalizeToken("   ") === null);
  assert("normalizeToken 非字串不合法", normalizeToken(123) === null);
  assert("normalizeToken 剛好 4096 字元合法", normalizeToken("a".repeat(4096)) === "a".repeat(4096));
  assert("normalizeToken 4097 字元不合法", normalizeToken("a".repeat(4097)) === null);
  assert("normalizeToken null 不合法", normalizeToken(null) === null);
  assert("normalizeToken undefined 不合法", normalizeToken(undefined) === null);

  console.log(`\n${failures.length === 0 ? "全部通過" : `失敗 ${failures.length} 項：${failures.join("；")}`}`);
  if (failures.length > 0) process.exit(1);
}

void main();
