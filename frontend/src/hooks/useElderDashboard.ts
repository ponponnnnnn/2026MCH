import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AlertItem, DailyReport, ElderInfo, HealthLog } from "../types";

/** 台北時區今天 00:00 的 Date，跟後端 firestore.ts 的 taipeiDayStart 邏輯一致 */
function taipeiTodayStart(): Date {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  return new Date(`${todayStr}T00:00:00+08:00`);
}

function taipeiDateStr(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d);
}

export function useElderDashboard(elderId: string) {
  const [elder, setElder] = useState<ElderInfo | null>(null);
  const [todayLogs, setTodayLogs] = useState<HealthLog[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [todayReport, setTodayReport] = useState<DailyReport | null>(null);
  const [recentReports, setRecentReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubElder = onSnapshot(doc(db, "elders", elderId), (snap) => {
      const data = snap.data();
      setElder(data ? { name: data.name ?? "長輩", age: data.age } : null);
    });

    const logsQuery = query(
      collection(db, "elders", elderId, "healthLogs"),
      where("ts", ">=", Timestamp.fromDate(taipeiTodayStart())),
      orderBy("ts", "desc"),
    );
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setTodayLogs(
        snap.docs.map((d) => ({
          id: d.id,
          ts: d.data().ts.toDate(),
          type: d.data().type,
          value: d.data().value,
          note: d.data().note,
        })),
      );
      setLoading(false);
    });

    const alertsQuery = query(
      collection(db, "elders", elderId, "alerts"),
      orderBy("ts", "desc"),
      limit(20),
    );
    const unsubAlerts = onSnapshot(alertsQuery, (snap) => {
      setAlerts(
        snap.docs.map((d) => ({
          id: d.id,
          ts: d.data().ts.toDate(),
          level: d.data().level,
          reason: d.data().reason,
          sourceQuote: d.data().sourceQuote,
          notified: d.data().notified,
        })),
      );
    });

    const unsubTodayReport = onSnapshot(
      doc(db, "elders", elderId, "dailyReports", taipeiDateStr(0)),
      (snap) => {
        const data = snap.data();
        setTodayReport(data ? ({ date: taipeiDateStr(0), ...data } as DailyReport) : null);
      },
    );

    // 近 7 天報告（用來畫趨勢圖），逐一監聽各天文件比查詢範圍簡單，
    // Demo 規模（7 筆）下效能沒有差異
    const dateStrs = Array.from({ length: 7 }, (_, i) => taipeiDateStr(6 - i));
    const unsubReports = dateStrs.map((dateStr) =>
      onSnapshot(doc(db, "elders", elderId, "dailyReports", dateStr), (snap) => {
        const data = snap.data();
        setRecentReports((prev) => {
          const others = prev.filter((r) => r.date !== dateStr);
          const next = data ? [...others, { date: dateStr, ...data } as DailyReport] : others;
          return next.sort((a, b) => a.date.localeCompare(b.date));
        });
      }),
    );

    return () => {
      unsubElder();
      unsubLogs();
      unsubAlerts();
      unsubTodayReport();
      unsubReports.forEach((unsub) => unsub());
    };
  }, [elderId]);

  return { elder, todayLogs, alerts, todayReport, recentReports, loading };
}
