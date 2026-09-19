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
      <div className="border border-ink/10 bg-white px-5 py-8 text-center text-ink/40">
        還沒有足夠的每日報告可以畫趨勢
      </div>
    );
  }

  const data = reports.map((r) => ({
    date: shortDate(r.date),
    score: OVERALL_SCORE[r.overall],
  }));

  return (
    <div className="border border-ink/10 bg-white px-5 py-4">
      <p className="mb-3 text-sm text-ink/50">近 7 天整體狀態</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#E5E2D8" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#8A8D82" }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 2]}
            ticks={[0, 1, 2]}
            tickFormatter={(v) => SCORE_LABEL[v]}
            tick={{ fontSize: 11, fill: "#8A8D82" }}
            width={70}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v: number) => SCORE_LABEL[v]} labelStyle={{ color: "#262922" }} />
          <Line type="monotone" dataKey="score" stroke="#4B7A45" strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
