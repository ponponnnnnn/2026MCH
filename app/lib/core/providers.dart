import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../firebase_options.dart';
import 'models.dart';
import 'repository.dart';

enum Role { elder, family }

final prefsProvider = Provider<SharedPreferences>((_) => throw UnimplementedError());

/// 身分（本機記住；null 代表尚未選擇）
class RoleNotifier extends Notifier<Role?> {
  @override
  Role? build() {
    final v = ref.read(prefsProvider).getString('role');
    return Role.values.where((r) => r.name == v).firstOrNull;
  }

  void set(Role? role) {
    final p = ref.read(prefsProvider);
    role == null ? p.remove('role') : p.setString('role', role.name);
    state = role;
  }
}

final roleProvider = NotifierProvider<RoleNotifier, Role?>(RoleNotifier.new);

final repositoryProvider = Provider<FamilyRepository>(
    (_) => DefaultFirebaseOptions.isConfigured ? FirestoreRepository() : DemoRepository());

final logsProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todayLogs());
final alertsProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todayAlerts());
final summaryProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todaySummary());
final todayReportOverallProvider =
    StreamProvider((ref) => ref.watch(repositoryProvider).todayReportOverall());
final reportsProvider = FutureProvider((ref) => ref.watch(repositoryProvider).reports());
final trendProvider = FutureProvider((ref) => ref.watch(repositoryProvider).trend7Days());

/// 由今日 alerts 與今日晚報 overall 推算整體燈號，取兩者較嚴重者
/// （Overall 宣告順序 normal < watch < alert，嚴重度可直接用 index 比較）
final overallProvider = Provider<Overall>((ref) {
  final alerts = ref.watch(alertsProvider).value ?? const [];
  final fromAlerts = alerts.any((a) => a.level == AlertLevel.red)
      ? Overall.alert
      : alerts.isNotEmpty
          ? Overall.watch
          : Overall.normal;
  final fromReport = ref.watch(todayReportOverallProvider).value ?? Overall.normal;
  return fromAlerts.index >= fromReport.index ? fromAlerts : fromReport;
});
