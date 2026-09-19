import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

final repositoryProvider = Provider<FamilyRepository>((_) => DemoRepository());

final logsProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todayLogs());
final alertsProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todayAlerts());
final summaryProvider = StreamProvider((ref) => ref.watch(repositoryProvider).todaySummary());
final reportsProvider = FutureProvider((ref) => ref.watch(repositoryProvider).reports());
final trendProvider = FutureProvider((ref) => ref.watch(repositoryProvider).trend7Days());

/// 由今日 alerts 推算整體燈號
final overallProvider = Provider<Overall>((ref) {
  final alerts = ref.watch(alertsProvider).value ?? const [];
  if (alerts.any((a) => a.level == AlertLevel.red)) return Overall.alert;
  if (alerts.isNotEmpty) return Overall.watch;
  return Overall.normal;
});
