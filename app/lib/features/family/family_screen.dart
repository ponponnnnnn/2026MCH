import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/config.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';

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
        toolbarHeight: 72,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Row(children: [
              BrandMark(),
              SizedBox(width: 4),
              Text('安心快報', style: TextStyle(fontSize: 13, color: AppColors.inkSoft)),
            ]),
            const SizedBox(height: 4),
            Text(AppConfig.elderName, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          ],
        ),
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
      Overall.normal => AppColors.green50,
      Overall.watch => AppColors.yellow50,
      Overall.alert => AppColors.red50,
    };

Color _overallAccent(Overall o) => switch (o) {
      Overall.normal => AppColors.green500,
      Overall.watch => AppColors.yellow500,
      Overall.alert => AppColors.red500,
    };

Widget _sectionTitle(String t) => Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Text(t, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
    );

final _hm = DateFormat('HH:mm');

class _TodayTab extends ConsumerWidget {
  const _TodayTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overall = ref.watch(overallProvider);
    final logs = ref.watch(logsProvider).value ?? const [];
    final summary = ref.watch(summaryProvider).value;

    const meta = [
      ('medication', '💊 用藥', AppColors.blue500),
      ('meal', '🍚 飲食', AppColors.red500),
      ('sleep', '😴 睡眠', AppColors.yellow500),
      ('pain', '🩹 疼痛／不適', AppColors.green500),
      ('mood', '🙂 心情', AppColors.blue500),
    ];

    HealthLog? latest(String type) =>
        logs.where((l) => l.type == type).fold<HealthLog?>(
            null, (a, b) => a == null || b.ts.isAfter(a.ts) ? b : a);

    Widget healthCard((String, String, Color) m) {
      final l = latest(m.$1);
      // sleep 的 value 是「數值或狀態」（tools/declarations.ts），不一定是數字，
      // 不是數字就不套「約 X 小時」這個單位
      final v = l == null ? null : (m.$1 == 'sleep' && num.tryParse(l.value.trim()) != null ? '約 ${l.value} 小時' : l.value);
      return AccentCard(
        accent: m.$3,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(m.$2, style: const TextStyle(fontSize: 14, color: AppColors.inkSoft))),
            if (l != null) Text(_hm.format(l.ts), style: const TextStyle(fontSize: 12, color: AppColors.inkSoft)),
          ]),
          const SizedBox(height: 4),
          Text(v ?? '今天還沒聊到',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: v == null ? AppColors.inkSoft.withValues(alpha: 0.5) : AppColors.ink)),
          if (l != null && l.note.isNotEmpty)
            Text('「${l.note}」', style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
        ]),
      );
    }

    return ListView(padding: const EdgeInsets.all(16), children: [
      AccentCard(
        accent: _overallAccent(overall),
        child: Container(
          width: double.infinity,
          color: _overallColor(overall),
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text('今日整體：${_overallLabel(overall)}',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
        ),
      ),
      _sectionTitle('今日健康狀況'),
      for (final m in meta) Padding(padding: const EdgeInsets.only(bottom: 10), child: healthCard(m)),
      if (summary != null) ...[
        _sectionTitle('今日摘要'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(summary, style: const TextStyle(fontSize: 15, height: 1.5)),
          ),
        ),
      ],
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
    if (ok) {
      ref.invalidate(reportsProvider);
      ref.invalidate(trendProvider);
    }
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
    if (alerts.isEmpty) {
      return ListView(padding: const EdgeInsets.all(16), children: const [
        SideBarBox(
          border: AppColors.green500,
          background: AppColors.green50,
          child: Text('目前沒有異常警報，一切平順。', style: TextStyle(color: AppColors.green700)),
        ),
      ]);
    }
    return ListView(padding: const EdgeInsets.all(16), children: [
      for (final a in alerts)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: SideBarBox(
            border: a.level == AlertLevel.red ? AppColors.red500 : AppColors.yellow500,
            background: a.level == AlertLevel.red ? AppColors.red50 : AppColors.yellow50,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: Text(a.level == AlertLevel.red ? '緊急' : '請留意',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: a.level == AlertLevel.red ? AppColors.red700 : AppColors.yellow700)),
                ),
                Text(_hm.format(a.ts), style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
              ]),
              const SizedBox(height: 4),
              Text(a.reason, style: const TextStyle(fontSize: 16)),
              if (a.quote.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('長輩原話：「${a.quote}」', style: const TextStyle(fontSize: 13, color: AppColors.inkSoft)),
                ),
            ]),
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
                if (r.events.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('⚠️ ${r.events.join('；')}', style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 8),
                Text('🗣 ${r.summary}'),
                if (r.followUps.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  SideBarBox(
                    border: AppColors.green500,
                    background: AppColors.green50,
                    child: Text('建議關心：${r.followUps.join('；')}', style: const TextStyle(color: AppColors.green700)),
                  ),
                ],
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
        _chart(pts, (p) => p.sleepHours, 0, 10, AppColors.blue500, null),
        const SizedBox(height: 24),
        Text('近 7 天整體狀態', style: Theme.of(context).textTheme.titleMedium),
        _chart(pts, (p) => _overallScore(p.overall), 0, 2, AppColors.blue700, _overallEmoji),
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
                  return Text(DateFormat('M/d').format(pts[i].day), style: const TextStyle(fontSize: 11));
                },
              ),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: [for (var i = 0; i < pts.length; i++) FlSpot(i.toDouble(), y(pts[i]))],
              // 整體狀態是離散的三段燈號，曲線平滑在連續同值後突然變化時會讓線條
              // 視覺上衝過頭（例如從 normal 掉到 watch 卻在圖上貼近 alert），
              // 改用直線段忠實呈現；睡眠時數是連續數值，維持原本的平滑曲線。
              isCurved: leftLabel == null,
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
