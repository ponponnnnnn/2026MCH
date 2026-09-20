import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DailyReport } from "../types";

const OVERALL_SCORE: Record<DailyReport["overall"], number> = { normal: 2, watch: 1, alert: 0 };
const SCORE_LABEL = ["🔴 alert", "🟡 watch", "🟢 normal"];

function shortDate(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

export function TrendChart({ reports }: { reports: DailyReport[] }) {
  if (reports.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-5 py-8 text-center text-ink-soft/60 shadow-sm">
        還沒有足夠的每日報告可以畫趨勢
      </div>
    );
  }

  const data = reports.map((r) => ({
    date: shortDate(r.date),
    score: OVERALL_SCORE[r.overall],
  }));

  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
      <p className="mb-3 text-sm text-ink-soft">近 7 天整體狀態</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#EEF1F5" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#5F6368" }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 2]}
            ticks={[0, 1, 2]}
            tickFormatter={(v) => SCORE_LABEL[v]}
            tick={{ fontSize: 11, fill: "#5F6368" }}
            width={70}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v: number) => SCORE_LABEL[v]} labelStyle={{ color: "#202124" }} />
          <Line type="monotone" dataKey="score" stroke="#4285F4" strokeWidth={2.5} dot={{ r: 4, fill: "#4285F4" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
