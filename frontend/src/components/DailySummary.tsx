import type { DailyReport } from "../types";
import { OVERALL_LABEL } from "../types";

export function DailySummary({ report }: { report: DailyReport | null }) {
  if (!report) {
    return (
      <div className="border border-ink/10 bg-white px-5 py-4">
        <p className="text-ink/50">今天的狀況報告還沒有產生，通常在每晚固定時間自動產生。</p>
      </div>
    );
  }

  return (
    <div className="border border-ink/10 bg-white px-5 py-4">
      <p className="text-lg">{OVERALL_LABEL[report.overall]}</p>
      {report.summary && <p className="mt-2 text-ink">{report.summary}</p>}
      {report.events.length > 0 && (
        <p className="mt-2 text-sm text-brick-700">⚠️ {report.events.join("；")}</p>
      )}
      {report.followUps.length > 0 && (
        <div className="mt-3 border-l-4 border-pine-500 bg-pine-50 px-4 py-2">
          <p className="text-sm text-pine-700">建議關心：{report.followUps.join("；")}</p>
        </div>
      )}
    </div>
  );
}
