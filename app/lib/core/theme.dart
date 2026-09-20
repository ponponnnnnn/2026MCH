import 'dart:ui';

import 'package:flutter/material.dart';

/// 與 web 版家屬儀表板一致的 Google 四色視覺語言。
class AppColors {
  static const paper = Color(0xFFFAFBFC);
  static const ink = Color(0xFF202124);
  static const inkSoft = Color(0xFF5F6368);

  static const blue50 = Color(0xFFE8F0FE);
  static const blue500 = Color(0xFF4285F4);
  static const blue700 = Color(0xFF1A56C4);

  static const red50 = Color(0xFFFCE8E6);
  static const red500 = Color(0xFFEA4335);
  static const red700 = Color(0xFFB0281E);

  static const yellow50 = Color(0xFFFEF7E0);
  static const yellow500 = Color(0xFFFBBC05);
  static const yellow700 = Color(0xFFB88400);

  static const green50 = Color(0xFFE6F4EA);
  static const green500 = Color(0xFF34A853);
  static const green700 = Color(0xFF1E7E37);
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.blue500,
    surface: AppColors.paper,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.paper,
    fontFamilyFallback: const ['Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei'],
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: AppColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 1,
      shadowColor: Colors.black26,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.blue50,
    ),
  );
}

/// 四個小圓點品牌標記，對應 web 版的 BrandMark。
class BrandMark extends StatelessWidget {
  const BrandMark({super.key});

  @override
  Widget build(BuildContext context) {
    const colors = [
      AppColors.blue500,
      AppColors.red500,
      AppColors.yellow500,
      AppColors.green500,
    ];
    return Row(mainAxisSize: MainAxisSize.min, children: [
      for (final c in colors)
        Container(
          width: 10,
          height: 10,
          margin: const EdgeInsets.only(right: 6),
          decoration: BoxDecoration(color: c, shape: BoxShape.circle),
        ),
    ]);
  }
}

/// 卡片頂部帶一條品牌色色條（web 版 HealthCards 的樣式）。
class AccentCard extends StatelessWidget {
  final Color accent;
  final Widget child;
  const AccentCard({super.key, required this.accent, required this.child});

  @override
  Widget build(BuildContext context) => Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 6, color: accent),
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 14), child: child),
        ]),
      );
}

/// 裝飾性四色模糊圓形背景，對應 web 版（backend/public/index.html）的 .bg-shape。
/// 純裝飾、蓋在畫面最底層，不吃點擊事件。
class BrandBackground extends StatelessWidget {
  const BrandBackground({super.key});

  static const _shapes = [
    (AppColors.blue500, -60.0, -50.0, 170.0),
    (AppColors.yellow500, -45.0, null, 130.0),
    (AppColors.green500, null, -40.0, 150.0),
    (AppColors.red500, null, null, 110.0),
  ];

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(children: [
        _shape(_shapes[0].$1, top: _shapes[0].$2, left: _shapes[0].$3, size: _shapes[0].$4),
        _shape(_shapes[1].$1, top: 20, right: -45, size: _shapes[1].$4),
        _shape(_shapes[2].$1, bottom: -50, left: -40, size: _shapes[2].$4),
        _shape(_shapes[3].$1, bottom: 30, right: -35, size: _shapes[3].$4),
      ]),
    );
  }

  Widget _shape(Color color, {double? top, double? bottom, double? left, double? right, required double size}) {
    return Positioned(
      top: top,
      bottom: bottom,
      left: left,
      right: right,
      child: ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
        ),
      ),
    );
  }
}

/// 通話中的四色跳動指示，對應 web 版的 .pulse-row（取代單調的純文字狀態）。
class CallPulse extends StatefulWidget {
  const CallPulse({super.key});

  @override
  State<CallPulse> createState() => _CallPulseState();
}

class _CallPulseState extends State<CallPulse> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const colors = [AppColors.blue500, AppColors.red500, AppColors.yellow500, AppColors.green500];
    return SizedBox(
      height: 34,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final (i, c) in colors.indexed)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 5),
            child: AnimatedBuilder(
              animation: _controller,
              builder: (_, child) {
                // 每個點延遲一點點開始跳，跟 web 版 animation-delay 0/.12/.24/.36s 對應
                final t = (_controller.value - i * 0.11) % 1.0;
                final lift = t < 0 ? 0.0 : (t < 0.4 ? (1 - (t / 0.4 - 1) * (t / 0.4 - 1)) : 0.0);
                return Transform.translate(offset: Offset(0, -14 * lift), child: child);
              },
              child: Container(width: 14, height: 14, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            ),
          ),
      ]),
    );
  }
}

/// 左側色條的訊息區塊（web 版警報與建議關心的樣式）。
class SideBarBox extends StatelessWidget {
  final Color border;
  final Color background;
  final Widget child;
  const SideBarBox({
    super.key,
    required this.border,
    required this.background,
    required this.child,
  });

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: background,
          borderRadius: const BorderRadius.horizontal(right: Radius.circular(16)),
          border: Border(left: BorderSide(color: border, width: 4)),
        ),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
        child: child,
      );
}
