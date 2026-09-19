enum Overall { normal, watch, alert }

enum AlertLevel { red, yellow }

class HealthLog {
  final DateTime ts;
  final String type; // medication | sleep | mood | pain | meal | other
  final String value;
  final String note;
  const HealthLog(this.ts, this.type, this.value, this.note);
}

class AlertItem {
  final DateTime ts;
  final AlertLevel level;
  final String reason;
  final String quote;
  const AlertItem(this.ts, this.level, this.reason, this.quote);
}

class DailyReport {
  final String date; // yyyy-mm-dd
  final Overall overall;
  final String medication, sleep, mood, meals, pain, summary;
  final List<String> events, followUps;
  const DailyReport({
    required this.date,
    required this.overall,
    required this.medication,
    required this.sleep,
    required this.mood,
    required this.meals,
    required this.pain,
    required this.summary,
    required this.events,
    required this.followUps,
  });
}

class TrendPoint {
  final DateTime day;
  final double sleepHours;
  // 當天沒有 dailyReports 時預設 normal，避免把「沒資料」誤顯示成警示
  final Overall overall;
  const TrendPoint(this.day, this.sleepHours, this.overall);
}

class TranscriptLine {
  final bool isElder;
  String text;
  TranscriptLine(this.isElder, this.text);
}
