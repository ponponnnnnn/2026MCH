import type { HealthLog, HealthType } from "../types";
import { HEALTH_TYPE_LABEL } from "../types";

const CATEGORY_ORDER: HealthType[] = ["medication", "sleep", "meal", "pain", "mood"];

// 每張卡片輪流用一個 Google 品牌色當頂部色條，呼應長輩端的四色視覺語言
const ACCENT_CYCLE = ["bg-blue-500", "bg-red-500", "bg-yellow-500", "bg-green-500", "bg-blue-500"];

function latestByType(logs: HealthLog[]): Partial<Record<HealthType, HealthLog>> {
  const result: Partial<Record<HealthType, HealthLog>> = {};
  for (const log of logs) {
    // logs 已經是 ts desc 排序，第一次遇到某個 type 就是最新的
    if (!result[log.type]) result[log.type] = log;
  }
  return result;
}

export function HealthCards({ logs }: { logs: HealthLog[] }) {
  const latest = latestByType(logs);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CATEGORY_ORDER.map((type, i) => {
        const log = latest[type];
        return (
          <div key={type} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className={`h-1.5 ${ACCENT_CYCLE[i]}`} />
            <div className="px-4 py-3">
              <p className="text-sm text-ink-soft">{HEALTH_TYPE_LABEL[type]}</p>
              {log ? (
                <>
                  <p className="mt-1 text-lg font-bold text-ink">{log.value}</p>
                  {log.note && <p className="mt-0.5 text-sm text-ink-soft">{log.note}</p>}
                </>
              ) : (
                <p className="mt-1 text-lg text-ink-soft/40">今天還沒聊到</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
