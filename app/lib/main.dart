import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/providers.dart';
import 'core/theme.dart';
import 'features/elder/elder_screen.dart';
import 'features/family/family_screen.dart';
import 'features/role_select_screen.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (DefaultFirebaseOptions.isConfigured) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.android);
  }
  final prefs = await SharedPreferences.getInstance();
  runApp(ProviderScope(
    overrides: [prefsProvider.overrideWithValue(prefs)],
    child: const CareApp(),
  ));
}

class CareApp extends ConsumerWidget {
  const CareApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(roleProvider);
    return MaterialApp(
      title: '長照小幫手',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: switch (role) {
        Role.elder => const ElderScreen(),
        Role.family => const FamilyScreen(),
        null => const RoleSelectScreen(),
      },
    );
  }
}
