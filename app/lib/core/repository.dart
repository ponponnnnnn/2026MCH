import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

/// 家屬端資料來源。正式版由 FirestoreRepository（cloud_firestore snapshots()）
/// 實作；尚未設定 Firebase 前使用 [DemoRepository] 讓畫面可獨立展示。
abstract class FamilyRepository {
  Stream<List<HealthLog>> todayLogs();
  Stream<List<AlertItem>> todayAlerts();
  Stream<String> todaySummary();

  /// 今日晚報的整體燈號；尚未產生晚報或欄位不合法時為 null
  Stream<Overall?> todayReportOverall();
  Future<List<DailyReport>> reports();
  Future<List<TrendPoint>> trend7Days();

  /// Demo 工具：呼叫後端 POST /demo/daily-report，回傳是否成功
  Future<bool> triggerDailyReport();

  /// Demo 工具：呼叫後端 POST /demo/ring，回傳送達裝置數；呼叫失敗回傳 null
  Future<int?> triggerRing();
}

Future<bool> _postJson(String path, Map<String, dynamic> body) async {
  try {
    final res = await http
        .post(AppConfig.httpUri(path),
            headers: {'content-type': 'application/json'}, body: jsonEncode(body))
        .timeout(const Duration(seconds: 30));
    return res.statusCode == 200;
  } catch (_) {
    return false;
  }
}

Future<int?> _triggerRing() async {
  try {
    final res = await http
        .post(AppConfig.httpUri('/demo/ring'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'elderId': AppConfig.elderId}))
        .timeout(const Duration(seconds: 30));
    if (res.statusCode != 200) return null;
    final body = jsonDecode(res.body);
    final pushed = body is Map ? body['pushed'] : null;
    return pushed is int ? pushed : 0;
  } catch (_) {
    return null;
  }
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
  Stream<Overall?> todayReportOverall() => Stream.value(null);

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
    const overall = [
      Overall.normal,
      Overall.normal,
      Overall.normal,
      Overall.normal,
      Overall.normal,
      Overall.normal,
      Overall.watch,
    ];
    return List.generate(
        7, (i) => TrendPoint(_now.subtract(Duration(days: 6 - i)), sleep[i], overall[i]));
  }

  @override
  Future<bool> triggerDailyReport() => _postJson('/demo/daily-report', {'elderId': AppConfig.elderId});

  @override
  Future<int?> triggerRing() => _triggerRing();
}

/// 正式版家屬資料來源：直接讀 Firestore（App 只讀，寫入全部由後端負責）。
/// 對應的文件結構見 v2_mvp.md §6 與後端 firestore.ts；「今天」統一用台北時區
/// 00:00 起算，算法比照網頁版 useElderDashboard.ts 的 taipeiTodayStart()。
class FirestoreRepository implements FamilyRepository {
  FirestoreRepository() : _fs = FirebaseFirestore.instance;

  final FirebaseFirestore _fs;

  CollectionReference<Map<String, dynamic>> _col(String name) =>
      _fs.collection('elders/${AppConfig.elderId}/$name');

  // ---- 台北時區（Asia/Taipei 全年 UTC+8，無日光節約） ----

  DateTime _toTaipei(DateTime instant) => instant.toUtc().add(const Duration(hours: 8));

  String _ymd(DateTime taipeiWallClock) =>
      '${taipeiWallClock.year.toString().padLeft(4, '0')}-'
      '${taipeiWallClock.month.toString().padLeft(2, '0')}-'
      '${taipeiWallClock.day.toString().padLeft(2, '0')}';

  /// 台北時區「daysAgo 天前那天」00:00 所對應的絕對時間（UTC 瞬間）
  DateTime _taipeiDayStart(int daysAgo) {
    final t = _toTaipei(DateTime.now()).subtract(Duration(days: daysAgo));
    return DateTime.utc(t.year, t.month, t.day).subtract(const Duration(hours: 8));
  }

  String _taipeiDateStr(int daysAgo) => _ymd(_toTaipei(DateTime.now()).subtract(Duration(days: daysAgo)));

  // ---- Firestore 是 schemaless，後端寫入的資料可能不完整：安全取值 ----

  String _str(Map<String, dynamic> d, String key, [String fallback = '']) {
    final v = d[key];
    return v is String ? v : fallback;
  }

  List<String> _strList(Map<String, dynamic> d, String key) {
    final v = d[key];
    return v is List ? v.whereType<String>().toList() : const [];
  }

  DateTime? _time(Map<String, dynamic> d, String key) {
    final v = d[key];
    return v is Timestamp ? v.toDate() : null;
  }

  Overall? _overall(Map<String, dynamic> d) => switch (d['overall']) {
        'normal' => Overall.normal,
        'watch' => Overall.watch,
        'alert' => Overall.alert,
        _ => null,
      };

  AlertLevel? _alertLevel(Map<String, dynamic> d) => switch (d['level']) {
        'red' => AlertLevel.red,
        'yellow' => AlertLevel.yellow,
        _ => null,
      };

  @override
  Stream<List<HealthLog>> todayLogs() {
    return _col('healthLogs')
        .where('ts', isGreaterThanOrEqualTo: Timestamp.fromDate(_taipeiDayStart(0)))
        .orderBy('ts', descending: true)
        .snapshots()
        .map((snap) {
      final out = <HealthLog>[];
      for (final doc in snap.docs) {
        try {
          final d = doc.data();
          final ts = _time(d, 'ts');
          if (ts == null) continue; // 沒有時間就無法排序顯示，跳過
          out.add(HealthLog(ts, _str(d, 'type', 'other'), _str(d, 'value'), _str(d, 'note')));
        } catch (_) {
          // 單筆資料型別不對時跳過，不影響其他筆
        }
      }
      return out;
    });
  }

  @override
  Stream<List<AlertItem>> todayAlerts() {
    return _col('alerts')
        .where('ts', isGreaterThanOrEqualTo: Timestamp.fromDate(_taipeiDayStart(0)))
        .orderBy('ts', descending: true)
        .limit(20)
        .snapshots()
        .map((snap) {
      final out = <AlertItem>[];
      for (final doc in snap.docs) {
        try {
          final d = doc.data();
          final ts = _time(d, 'ts');
          final level = _alertLevel(d);
          if (ts == null || level == null) continue;
          out.add(AlertItem(ts, level, _str(d, 'reason'), _str(d, 'sourceQuote')));
        } catch (_) {}
      }
      return out;
    });
  }

  @override
  Stream<String> todaySummary() {
    final reportStream = _col('dailyReports').doc(_taipeiDateStr(0)).snapshots();
    final sessionStream = _col('sessions')
        .where('startedAt', isGreaterThanOrEqualTo: Timestamp.fromDate(_taipeiDayStart(0)))
        .orderBy('startedAt', descending: true)
        .limit(1)
        .snapshots();

    String? reportSummary;
    String? sessionSummary;
    var reportLoaded = false;
    var sessionLoaded = false;
    StreamSubscription? sub1, sub2;
    late final StreamController<String> controller;

    void emit() {
      if (!reportLoaded || !sessionLoaded) return;
      if (reportSummary != null && reportSummary!.isNotEmpty) {
        controller.add(reportSummary!);
      } else if (sessionSummary != null && sessionSummary!.isNotEmpty) {
        controller.add(sessionSummary!);
      } else {
        controller.add('今天還沒有對話紀錄');
      }
    }

    controller = StreamController<String>(
      onListen: () {
        sub1 = reportStream.listen((snap) {
          final d = snap.data();
          reportSummary = d == null ? null : _str(d, 'summary');
          reportLoaded = true;
          emit();
        }, onError: (_) {
          reportLoaded = true;
          emit();
        });
        sub2 = sessionStream.listen((snap) {
          sessionSummary = snap.docs.isEmpty ? null : _str(snap.docs.first.data(), 'summary');
          sessionLoaded = true;
          emit();
        }, onError: (_) {
          sessionLoaded = true;
          emit();
        });
      },
      onCancel: () {
        sub1?.cancel();
        sub2?.cancel();
      },
    );
    return controller.stream;
  }

  @override
  Stream<Overall?> todayReportOverall() {
    return _col('dailyReports').doc(_taipeiDateStr(0)).snapshots().map((snap) {
      final d = snap.data();
      return d == null ? null : _overall(d);
    });
  }

  DailyReport? _toDailyReport(String date, Map<String, dynamic> d) {
    final overall = _overall(d);
    if (overall == null) return null; // overall 缺漏或型別不對，跳過整份壞資料
    final rawMetrics = d['metrics'];
    final metrics = rawMetrics is Map ? Map<String, dynamic>.from(rawMetrics) : <String, dynamic>{};
    return DailyReport(
      date: date,
      overall: overall,
      medication: _str(metrics, 'medication'),
      sleep: _str(metrics, 'sleep'),
      mood: _str(metrics, 'mood'),
      meals: _str(metrics, 'meals'),
      pain: _str(metrics, 'pain'),
      summary: _str(d, 'summary'),
      events: _strList(d, 'events'),
      followUps: _strList(d, 'followUps'),
    );
  }

  @override
  Future<List<DailyReport>> reports() async {
    try {
      final snap =
          await _col('dailyReports').orderBy(FieldPath.documentId, descending: true).limit(14).get();
      final out = <DailyReport>[];
      for (final doc in snap.docs) {
        final r = _toDailyReport(doc.id, doc.data());
        if (r != null) out.add(r);
      }
      return out;
    } catch (_) {
      return const [];
    }
  }

  /// 7 天趨勢：睡眠時數取當天 healthLogs 裡 type=sleep 的 value（跟今日卡片同一套
  /// 慣例：value 是小時數字的字串）取平均；整體狀態則比照網頁版 TrendChart.tsx，
  /// 直接用當天 dailyReports.overall。當天沒有 dailyReports 時預設 normal。
  @override
  Future<List<TrendPoint>> trend7Days() async {
    final overallByDate = <String, Overall>{};
    try {
      final snap =
          await _col('dailyReports').orderBy(FieldPath.documentId, descending: true).limit(7).get();
      for (final doc in snap.docs) {
        final o = _overall(doc.data());
        if (o != null) overallByDate[doc.id] = o;
      }
    } catch (_) {}

    // 用單一時間範圍查詢（不加 type 條件）避免需要額外的 Firestore 複合索引，
    // type 過濾改在本機做。
    final sleepByDate = <String, List<double>>{};
    try {
      final snap = await _col('healthLogs')
          .where('ts', isGreaterThanOrEqualTo: Timestamp.fromDate(_taipeiDayStart(6)))
          .orderBy('ts')
          .get();
      for (final doc in snap.docs) {
        try {
          final d = doc.data();
          if (_str(d, 'type') != 'sleep') continue;
          final ts = _time(d, 'ts');
          final hours = double.tryParse(_str(d, 'value'));
          if (ts == null || hours == null) continue;
          (sleepByDate[_ymd(_toTaipei(ts))] ??= []).add(hours);
        } catch (_) {}
      }
    } catch (_) {}

    return List.generate(7, (i) {
      final daysAgo = 6 - i;
      final dateStr = _taipeiDateStr(daysAgo);
      final hoursList = sleepByDate[dateStr];
      final avgHours =
          (hoursList == null || hoursList.isEmpty) ? 0.0 : hoursList.reduce((a, b) => a + b) / hoursList.length;
      return TrendPoint(_taipeiDayStart(daysAgo), avgHours, overallByDate[dateStr] ?? Overall.normal);
    });
  }

  @override
  Future<bool> triggerDailyReport() => _postJson('/demo/daily-report', {'elderId': AppConfig.elderId});

  @override
  Future<int?> triggerRing() => _triggerRing();
}
