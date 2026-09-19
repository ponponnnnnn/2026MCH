import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/incoming_call.dart';
import 'core/providers.dart';
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
  // 盡早登記背景推播 handler，覆蓋「App 冷啟動前就有來電推播」的情況；
  // 若使用者是在同一個 session 中途才切換成長輩身分，elder_screen.dart 還會再登記一次。
  if (DefaultFirebaseOptions.isConfigured && prefs.getString('role') == Role.elder.name) {
    registerBackgroundHandler();
  }
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2E7D6B)),
        useMaterial3: true,
      ),
      home: switch (role) {
        Role.elder => const ElderScreen(),
        Role.family => const FamilyScreen(),
        null => const RoleSelectScreen(),
      },
    );
  }
}
