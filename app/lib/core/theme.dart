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
