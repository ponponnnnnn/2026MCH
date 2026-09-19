import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

/// 家屬端資料來源。正式版由 FirestoreRepository（cloud_firestore snapshots()）
/// 實作；尚未設定 Firebase 前使用 [DemoRepository] 讓畫面可獨立展示。
abstract class FamilyRepository {
  Stream<List<HealthLog>> todayLogs();
  Stream<List<AlertItem>> todayAlerts();
  Stream<String> todaySummary();
  Future<List<DailyReport>> reports();
  Future<List<TrendPoint>> trend7Days();

  /// Demo 工具：呼叫後端 POST /demo/daily-report，回傳是否成功
  Future<bool> triggerDailyReport();
}

class DemoRepository implements FamilyRepository {
  final _now = DateTime.now();

  DateTime _at(int h, int m) => DateTime(_now.year, _now.month, _now.day, h, m);

  @override
  Stream<List<HealthLog>> todayLogs() => Stream.value([
        HealthLog(_at(8, 30), 'medication', '早藥已服', '有啦，早上吃過了'),
        HealthLog(_at(9, 0), 'sleep', '5', '昨晚只睡了五個小時'),
        HealthLog(_at(9, 5), 'mood', '普通', '還可以啦'),
        HealthLog(_at(12, 10), 'meal', '午餐已吃', '吃了魚和青菜'),
        HealthLog(_at(14, 20), 'pain', '頭暈', '剛剛頭有點暈'),
      ]);

  @override
  Stream<List<AlertItem>> todayAlerts() => Stream.value([
        AlertItem(_at(14, 20), AlertLevel.yellow, '提到頭暈、差點跌倒', '剛剛頭有點暈，差點跌倒'),
      ]);

  @override
  Stream<String> todaySummary() =>
      Stream.value('今天聊了 3 次、約 12 分鐘。聊到孫子很開心；下午提到頭暈，已記錄並提醒休息。');

  @override
  Future<List<DailyReport>> reports() async => List.generate(5, (i) {
        final d = _now.subtract(Duration(days: i));
        final date =
            '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        return DailyReport(
          date: date,
          overall: i == 0 ? Overall.watch : Overall.normal,
          medication: i == 0 ? '早、午已服，晚藥待提醒' : '按時服藥',
          sleep: i == 0 ? '昨晚約 5 小時（偏少）' : '約 7 小時',
          mood: i == 0 ? '普通，聊到孫子很開心' : '愉快',
          meals: '三餐正常',
          pain: i == 0 ? '下午頭暈' : '無',
          summary: '與小幫手互動 3 次，整體聊得開心。',
          events: i == 0 ? ['14:20 提到頭暈、差點跌倒'] : [],
          followUps: i == 0 ? ['今晚打通電話關心，留意頭暈是否再發生'] : [],
        );
      });

  @override
  Future<List<TrendPoint>> trend7Days() async {
    const sleep = [7.0, 6.5, 7.5, 6.0, 7.0, 5.5, 5.0];
    const mood = [4.0, 4.0, 3.5, 4.0, 3.0, 3.5, 3.0];
    return List.generate(
        7, (i) => TrendPoint(_now.subtract(Duration(days: 6 - i)), sleep[i], mood[i]));
  }

  @override
  Future<bool> triggerDailyReport() async {
    final ws = Uri.parse(AppConfig.backendWs);
    final url = Uri(
      scheme: ws.scheme == 'wss' ? 'https' : 'http',
      host: ws.host,
      port: ws.hasPort ? ws.port : null,
      path: '/demo/daily-report',
    );
    try {
      final res = await http
          .post(url,
              headers: {'content-type': 'application/json'},
              body: jsonEncode({'elderId': AppConfig.elderId}))
          .timeout(const Duration(seconds: 30));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
