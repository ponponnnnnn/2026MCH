import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:care_helper/core/providers.dart';
import 'package:care_helper/main.dart';

void main() {
  testWidgets('首次開啟顯示身分選擇', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(ProviderScope(
      overrides: [prefsProvider.overrideWithValue(prefs)],
      child: const CareApp(),
    ));
    expect(find.text('我是長輩'), findsOneWidget);
    expect(find.text('我是家屬'), findsOneWidget);
  });
}
