import type { AlertItem } from "../types";

const LEVEL_STYLE = {
  red: {
    border: "border-brick-500",
    bg: "bg-brick-50",
    text: "text-brick-700",
    label: "緊急",
  },
  yellow: {
    border: "border-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
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
      <div className="rounded-none border-l-4 border-pine-500 bg-pine-50 px-5 py-4">
        <p className="text-pine-700">目前沒有異常警報，一切平順。</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {alerts.map((a) => {
        const style = LEVEL_STYLE[a.level];
        return (
          <li key={a.id} className={`rounded-none border-l-4 ${style.border} ${style.bg} px-5 py-4`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
              <span className="text-sm text-ink/60">{formatTime(a.ts)}</span>
            </div>
            <p className="mt-1 text-ink">{a.reason}</p>
            {a.sourceQuote && (
              <p className="mt-1 text-sm text-ink/70">長輩原話：「{a.sourceQuote}」</p>
            )}
            <p className="mt-1 text-sm text-ink/50">{a.notified ? "已通知家人" : "通知處理中"}</p>
          </li>
        );
      })}
    </ul>
  );
}
