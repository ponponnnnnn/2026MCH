import type { HealthLog, HealthType } from "../types";
import { HEALTH_TYPE_LABEL } from "../types";

const CATEGORY_ORDER: HealthType[] = ["medication", "sleep", "meal", "pain", "mood"];

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
      {CATEGORY_ORDER.map((type) => {
        const log = latest[type];
        return (
          <div key={type} className="border border-ink/10 bg-white px-4 py-3">
            <p className="text-sm text-ink/50">{HEALTH_TYPE_LABEL[type]}</p>
            {log ? (
              <>
                <p className="mt-1 text-lg text-ink">{log.value}</p>
                {log.note && <p className="mt-0.5 text-sm text-ink/50">{log.note}</p>}
              </>
            ) : (
              <p className="mt-1 text-lg text-ink/30">今天還沒聊到</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
