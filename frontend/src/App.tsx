import { DEFAULT_ELDER_ID } from "./lib/firebase";
import { useElderDashboard } from "./hooks/useElderDashboard";
import { AlertList } from "./components/AlertList";
import { HealthCards } from "./components/HealthCards";
import { DailySummary } from "./components/DailySummary";
import { TrendChart } from "./components/TrendChart";
import { OVERALL_LABEL } from "./types";

function BrandMark() {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
    </div>
  );
}

export default function App() {
  const { elder, todayLogs, alerts, todayReport, recentReports, loading, error } =
    useElderDashboard(DEFAULT_ELDER_ID);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md border-l-4 border-red-500 bg-red-50 px-5 py-4">
          <p className="text-red-700">{error}</p>
          <p className="mt-2 text-sm text-ink-soft">
            常見原因：Firestore 安全規則沒開放讀取，或 .env 裡的專案 ID 跟 Firestore 對不起來。
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-soft">讀取中…</div>;
  }

  return (
    <div className="relative min-h-screen">
      <div className="bg-shape s1" />
      <div className="bg-shape s2" />
      <div className="bg-shape s3" />
      <div className="bg-shape s4" />

      <div className="relative z-10">
        <header className="border-b border-black/5 bg-white/90 px-6 py-6 backdrop-blur sm:px-10">
          <div className="mb-2 flex items-center gap-3">
            <BrandMark />
            <p className="text-sm text-ink-soft">安心快報</p>
          </div>
          <div className="flex items-baseline gap-4">
            <h1 className="text-3xl font-black">{elder?.name ?? "長輩"}</h1>
            {todayReport && (
              <span className="text-lg text-ink-soft">{OVERALL_LABEL[todayReport.overall]}</span>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-8 px-6 py-8 sm:px-10">
          <section>
            <h2 className="mb-3 text-lg font-bold">警報</h2>
            <AlertList alerts={alerts} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">今日健康狀況</h2>
            <HealthCards logs={todayLogs} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">今日摘要</h2>
            <DailySummary report={todayReport} />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">長期趨勢</h2>
            <TrendChart reports={recentReports} />
          </section>
        </main>
      </div>
    </div>
  );
}
