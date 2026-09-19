import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/config.dart';
import '../../core/models.dart';
import '../../core/providers.dart';

class FamilyScreen extends ConsumerStatefulWidget {
  const FamilyScreen({super.key});

  @override
  ConsumerState<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends ConsumerState<FamilyScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    const pages = [_TodayTab(), _AlertsTab(), _HistoryTab(), _TrendTab()];
    return Scaffold(
      appBar: AppBar(
        title: Text('${AppConfig.elderName}｜家屬模式'),
        actions: [
          IconButton(
            tooltip: '切換身分',
            icon: const Icon(Icons.swap_horiz),
            onPressed: () => ref.read(roleProvider.notifier).set(null),
          ),
        ],
      ),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.today), label: '今日'),
          NavigationDestination(icon: Icon(Icons.warning_amber), label: '警報'),
          NavigationDestination(icon: Icon(Icons.history), label: '歷史'),
          NavigationDestination(icon: Icon(Icons.show_chart), label: '趨勢'),
        ],
      ),
    );
  }
}

String _overallLabel(Overall o) => switch (o) {
      Overall.normal => '🟢 正常',
      Overall.watch => '🟡 需留意',
      Overall.alert => '🔴 需立即關心',
    };

Color _overallColor(Overall o) => switch (o) {
      Overall.normal => Colors.green.shade100,
      Overall.watch => Colors.amber.shade100,
      Overall.alert => Colors.red.shade100,
    };

final _hm = DateFormat('HH:mm');

class _TodayTab extends ConsumerWidget {
  const _TodayTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overall = ref.watch(overallProvider);
    final logs = ref.watch(logsProvider).value ?? const [];
    final summary = ref.watch(summaryProvider).value;

    const meta = {
      'medication': ('💊 用藥', 'medication'),
      'sleep': ('😴 睡眠', 'sleep'),
      'mood': ('🙂 心情', 'mood'),
      'meal': ('🍚 飲食', 'meal'),
      'pain': ('🩹 疼痛／不適', 'pain'),
    };

    HealthLog? latest(String type) =>
        logs.where((l) => l.type == type).fold<HealthLog?>(
            null, (a, b) => a == null || b.ts.isAfter(a.ts) ? b : a);

    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
        color: _overallColor(overall),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text('今日整體：${_overallLabel(overall)}',
              style: Theme.of(context).textTheme.headlineSmall),
        ),
      ),
      const SizedBox(height: 8),
      for (final e in meta.entries)
        Builder(builder: (_) {
          final l = latest(e.key);
          final v = l == null
              ? '尚無紀錄'
              : e.key == 'sleep'
                  ? '約 ${l.value} 小時'
                  : l.value;
          return Card(
            child: ListTile(
              title: Text(e.value.$1),
              subtitle: Text(l == null || l.note.isEmpty ? v : '$v\n「${l.note}」'),
              isThreeLine: l != null && l.note.isNotEmpty,
              trailing: l == null ? null : Text(_hm.format(l.ts)),
            ),
          );
        }),
      if (summary != null)
        Card(
          child: ListTile(
            leading: const Icon(Icons.forum),
            title: const Text('今日對話摘要'),
            subtitle: Text(summary),
          ),
        ),
      if (AppConfig.demoMode) const _DemoTools(),
    ]);
  }
}

class _DemoTools extends ConsumerStatefulWidget {
  const _DemoTools();

  @override
  ConsumerState<_DemoTools> createState() => _DemoToolsState();
}

class _DemoToolsState extends ConsumerState<_DemoTools> {
  bool _busyReport = false;
  bool _busyRing = false;

  Future<void> _runReport() async {
    setState(() => _busyReport = true);
    final ok = await ref.read(repositoryProvider).triggerDailyReport();
    if (!mounted) return;
    setState(() => _busyReport = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? '晚報已產生並寄出，請查看信箱' : '產生失敗，請確認後端已啟動且 DEMO_MODE=1')));
  }

  Future<void> _runRing() async {
    setState(() => _busyRing = true);
    final pushed = await ref.read(repositoryProvider).triggerRing();
    if (!mounted) return;
    setState(() => _busyRing = false);
    final msg = pushed == null
        ? '撥打失敗，請確認後端已啟動且 DEMO_MODE=1'
        : pushed == 0
            ? '已送出，但長輩端還沒登記裝置'
            : '已送達 $pushed 台裝置';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Column(children: [
          OutlinedButton.icon(
            onPressed: _busyReport ? null : _runReport,
            icon: _busyReport
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.mail),
            label: const Text('Demo：立即產生晚報'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busyRing ? null : _runRing,
            icon: _busyRing
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.phone_in_talk),
            label: const Text('Demo：請小幫手打給長輩'),
          ),
        ]),
      );
}

class _AlertsTab extends ConsumerWidget {
  const _AlertsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider).value ?? const [];
    if (alerts.isEmpty) return const Center(child: Text('今天沒有警報 🎉'));
    return ListView(padding: const EdgeInsets.all(16), children: [
      for (final a in alerts)
        Card(
          color: a.level == AlertLevel.red ? Colors.red.shade50 : Colors.amber.shade50,
          child: ListTile(
            leading: Icon(Icons.warning,
                color: a.level == AlertLevel.red ? Colors.red : Colors.amber.shade800),
            title: Text('${a.level == AlertLevel.red ? '🔴 緊急' : '🟡 留意'}｜${a.reason}'),
            subtitle: Text('「${a.quote}」'),
            trailing: Text(_hm.format(a.ts)),
          ),
        ),
    ]);
  }
}

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reports = ref.watch(reportsProvider);
    return reports.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('載入失敗：$e')),
      data: (list) => ListView(padding: const EdgeInsets.all(16), children: [
        for (final r in list)
          Card(
            child: ExpansionTile(
              title: Text('${r.date}　${_overallLabel(r.overall)}'),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('💊 ${r.medication}\n😴 ${r.sleep}\n🙂 ${r.mood}\n🍚 ${r.meals}\n🩹 ${r.pain}'),
                if (r.events.isNotEmpty) Text('\n⚠️ ${r.events.join('；')}'),
                Text('\n🗣 ${r.summary}'),
                if (r.followUps.isNotEmpty) Text('\n👉 ${r.followUps.join('；')}'),
              ],
            ),
          ),
      ]),
    );
  }
}

class _TrendTab extends ConsumerWidget {
  const _TrendTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trend = ref.watch(trendProvider);
    return trend.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('載入失敗：$e')),
      data: (pts) => ListView(padding: const EdgeInsets.all(16), children: [
        Text('7 天睡眠時數', style: Theme.of(context).textTheme.titleMedium),
        _chart(pts, (p) => p.sleepHours, 0, 10, Colors.indigo, null),
        const SizedBox(height: 24),
        Text('近 7 天整體狀態', style: Theme.of(context).textTheme.titleMedium),
        _chart(pts, (p) => _overallScore(p.overall), 0, 2, Colors.teal, _overallEmoji),
      ]),
    );
  }

  Widget _chart(List<TrendPoint> pts, double Function(TrendPoint) y, double minY, double maxY,
      Color color, String Function(int)? leftLabel) {
    return SizedBox(
      height: 200,
      child: Padding(
        padding: const EdgeInsets.only(top: 16, right: 12),
        child: LineChart(LineChartData(
          minY: minY,
          maxY: maxY,
          gridData: const FlGridData(drawVerticalLine: false),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: AxisTitles(
              sideTitles: leftLabel == null
                  ? const SideTitles(showTitles: true, reservedSize: 32)
                  : SideTitles(
                      showTitles: true,
                      reservedSize: 40,
                      interval: 1,
                      getTitlesWidget: (v, _) {
                        final i = v.toInt();
                        if (i != v || i < minY || i > maxY) return const SizedBox();
                        return Text(leftLabel(i), style: const TextStyle(fontSize: 14));
                      },
                    ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                getTitlesWidget: (v, _) {
                  final i = v.toInt();
                  if (i < 0 || i >= pts.length) return const SizedBox();
                  return Text(DateFormat('M/d').format(pts[i].day),
                      style: const TextStyle(fontSize: 11));
                },
              ),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (var i = 0; i < pts.length; i++) FlSpot(i.toDouble(), y(pts[i]))],
              isCurved: true,
              color: color,
              barWidth: 4,
              dotData: const FlDotData(show: true),
            ),
          ],
        )),
      ),
    );
  }
}

double _overallScore(Overall o) => switch (o) {
      Overall.alert => 0,
      Overall.watch => 1,
      Overall.normal => 2,
    };

String _overallEmoji(int score) => switch (score) {
      0 => '🔴',
      1 => '🟡',
      _ => '🟢',
    };
