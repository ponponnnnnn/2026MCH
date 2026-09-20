import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import '../core/theme.dart';

class RoleSelectScreen extends ConsumerWidget {
  const RoleSelectScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Widget big(String label, IconData icon, Role role, Color color) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: color,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              ),
              onPressed: () => ref.read(roleProvider.notifier).set(role),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 72),
                  const SizedBox(height: 12),
                  Text(label, style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        );

    return Scaffold(
      appBar: AppBar(
        title: Row(mainAxisSize: MainAxisSize.min, children: const [
          BrandMark(),
          SizedBox(width: 10),
          Text('長照小幫手'),
        ]),
      ),
      body: Stack(children: [
        const BrandBackground(),
        SafeArea(
          child: Column(children: [
            big('我是長輩', Icons.elderly, Role.elder, AppColors.yellow700),
            big('我是家屬', Icons.family_restroom, Role.family, AppColors.blue500),
          ]),
        ),
      ]),
    );
  }
}
