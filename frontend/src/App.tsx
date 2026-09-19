import { DEFAULT_ELDER_ID } from "./lib/firebase";
import { useElderDashboard } from "./hooks/useElderDashboard";
import { AlertList } from "./components/AlertList";
import { HealthCards } from "./components/HealthCards";
import { DailySummary } from "./components/DailySummary";
import { TrendChart } from "./components/TrendChart";
import { OVERALL_LABEL } from "./types";

export default function App() {
  const { elder, todayLogs, alerts, todayReport, recentReports, loading } =
    useElderDashboard(DEFAULT_ELDER_ID);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink/40">讀取中…</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-white px-6 py-6 sm:px-10">
        <p className="text-sm text-ink/50">安心快報</p>
        <div className="mt-1 flex items-baseline gap-4">
          <h1 className="text-3xl">{elder?.name ?? "長輩"}</h1>
          {todayReport && (
            <span className="text-lg text-ink/60">{OVERALL_LABEL[todayReport.overall]}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8 sm:px-10">
        <section>
          <h2 className="mb-3 text-lg">警報</h2>
          <AlertList alerts={alerts} />
        </section>

        <section>
          <h2 className="mb-3 text-lg">今日健康狀況</h2>
          <HealthCards logs={todayLogs} />
        </section>

        <section>
          <h2 className="mb-3 text-lg">今日摘要</h2>
          <DailySummary report={todayReport} />
        </section>

        <section>
          <h2 className="mb-3 text-lg">長期趨勢</h2>
          <TrendChart reports={recentReports} />
        </section>
      </main>
    </div>
  );
}
