import type { AlertItem } from "../types";

const LEVEL_STYLE = {
  red: {
    border: "border-red-500",
    bg: "bg-red-50",
    text: "text-red-700",
    label: "緊急",
  },
  yellow: {
    border: "border-yellow-500",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    label: "請留意",
  },
} as const;

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-r-2xl border-l-4 border-green-500 bg-green-50 px-5 py-4">
        <p className="text-green-700">目前沒有異常警報，一切平順。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {alerts.map((a) => {
        const style = LEVEL_STYLE[a.level];
        return (
          <li key={a.id} className={`rounded-r-2xl border-l-4 ${style.border} ${style.bg} px-5 py-4`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm font-bold ${style.text}`}>{style.label}</span>
              <span className="text-sm text-ink-soft">{formatTime(a.ts)}</span>
            </div>
            <p className="mt-1 text-ink">{a.reason}</p>
            {a.sourceQuote && (
              <p className="mt-1 text-sm text-ink-soft">長輩原話：「{a.sourceQuote}」</p>
            )}
            <p className="mt-1 text-sm text-ink-soft/70">{a.notified ? "已通知家人" : "通知處理中"}</p>
          </li>
        );
      })}
    </ul>
  );
}
