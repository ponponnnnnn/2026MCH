/**
 * 把一位「測試用」長輩重置成全空：刪掉他底下所有紀錄（healthLogs、alerts、sessions、
 * dailyReports、topicHooks、concerns、callAttempts），文件本身只留一個 resetAt。
 * 稱呼、基本資料、個人化語域全部回到程式的預設值，下一通電話會被當成首次通話。
 *
 *   npx tsx --env-file=.env src/dev/reset-elder.ts test-local
 *
 * 會真的連 Firestore 並刪資料，不可復原。
 */
const PROTECTED_IDS = new Set(["demo"]);

async function main() {
  const elderId = process.argv[2];
  if (!elderId || !/^[A-Za-z0-9_-]{1,64}$/.test(elderId)) {
    console.error("用法：npx tsx --env-file=.env src/dev/reset-elder.ts <elderId>");
    process.exit(1);
  }
  if (PROTECTED_IDS.has(elderId)) {
    console.error(`拒絕執行：「${elderId}」是團隊共用的展示資料（網頁儀表板也讀這一份），不能用這支腳本清空。`);
    process.exit(1);
  }
  process.env.DEV_NO_DB = "0";
  const { db, elderRef, Timestamp } = await import("../data/firestore.js");

  const ref = elderRef(elderId);
  const subs = await ref.listCollections();
  for (const c of subs) {
    const n = (await c.count().get()).data().count;
    console.log(`刪除 ${elderId}/${c.id}：${n} 筆`);
  }
  await db.recursiveDelete(ref);
  await ref.set({ resetAt: Timestamp.now() });
  console.log(`完成：elders/${elderId} 已重置為全空。`);
}

main().catch((e) => {
  console.error("重置失敗：", e);
  process.exit(1);
});
