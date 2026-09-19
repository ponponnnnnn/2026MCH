import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:care_helper/core/models.dart';
import 'package:care_helper/core/providers.dart';
import 'package:care_helper/core/repository.dart';

/// 只餵 overallProvider 用得到的兩個 stream，其餘方法未被本測試用到
class _FakeRepository implements FamilyRepository {
  _FakeRepository({required this.alerts, required this.reportOverall});

  final List<AlertItem> alerts;
  final Overall? reportOverall;

  @override
  Stream<List<AlertItem>> todayAlerts() => Stream.value(alerts);

  @override
  Stream<Overall?> todayReportOverall() => Stream.value(reportOverall);

  @override
  Stream<List<HealthLog>> todayLogs() => Stream.value(const []);

  @override
  Stream<String> todaySummary() => Stream.value('');

  @override
  Future<List<DailyReport>> reports() async => const [];

  @override
  Future<List<TrendPoint>> trend7Days() async => const [];

  @override
  Future<bool> triggerDailyReport() async => false;

  @override
  Future<int?> triggerRing() async => null;
}

final _now = DateTime.now();

Future<Overall> _overallFor({required List<AlertItem> alerts, required Overall? reportOverall}) async {
  final container = ProviderContainer(overrides: [
    repositoryProvider.overrideWithValue(_FakeRepository(alerts: alerts, reportOverall: reportOverall)),
  ]);
  addTearDown(container.dispose);
  // Riverpod 3：沒有強引用的 listener 時 provider 會 pause、不會真的訂閱底下的
  // stream，先 listen 讓它保持啟用，再等兩個 StreamProvider 送出第一筆值
  container.listen(alertsProvider, (_, _) {});
  container.listen(todayReportOverallProvider, (_, _) {});
  await container.read(alertsProvider.future);
  await container.read(todayReportOverallProvider.future);
  return container.read(overallProvider);
}

void main() {
  test('沒有警報但晚報 watch → watch', () async {
    final overall = await _overallFor(alerts: const [], reportOverall: Overall.watch);
    expect(overall, Overall.watch);
  });

  test('黃色警報但晚報 normal → watch', () async {
    final overall = await _overallFor(
      alerts: [AlertItem(_now, AlertLevel.yellow, '提到頭暈', '頭有點暈')],
      reportOverall: Overall.normal,
    );
    expect(overall, Overall.watch);
  });

  test('紅色警報且晚報 watch → alert', () async {
    final overall = await _overallFor(
      alerts: [AlertItem(_now, AlertLevel.red, '緊急', '救命')],
      reportOverall: Overall.watch,
    );
    expect(overall, Overall.alert);
  });

  test('沒有警報也沒有晚報 → normal', () async {
    final overall = await _overallFor(alerts: const [], reportOverall: null);
    expect(overall, Overall.normal);
  });
}
