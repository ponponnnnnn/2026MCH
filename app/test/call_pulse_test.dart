import 'package:care_helper/core/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CallPulse：四個圓點會上下跳動，而且彼此錯開時間', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: CallPulse())));

    List<double> lifts() => tester
        .widgetList<Transform>(find.descendant(of: find.byType(CallPulse), matching: find.byType(Transform)))
        .map((t) => t.transform.getTranslation().y)
        .toList();

    expect(lifts().length, 4);

    // 動畫剛開始（t=0）：只有第一個點開始起跳，其餘還沒輪到
    await tester.pump(const Duration(milliseconds: 1));
    final start = lifts();

    // 動畫週期 1100ms，第一個點在 0.2 週期（220ms）時跳到最高附近
    await tester.pump(const Duration(milliseconds: 220));
    final peak = lifts();

    expect(peak[0], lessThan(-8), reason: '第一個點應該明顯往上跳（y 為負代表往上）');
    expect(peak[0], lessThan(start[0]), reason: '畫面有在動，不是靜止的');
    expect(peak[3], greaterThan(peak[0]), reason: '第四個點比第一個晚出發，此時還沒跳到同樣高度');
  });
}
