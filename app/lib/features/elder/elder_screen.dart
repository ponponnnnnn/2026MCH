import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../core/call_client.dart';
import '../../core/config.dart';
import '../../core/incoming_call.dart';
import '../../core/providers.dart';
import '../../core/push_registration.dart';
import '../../core/theme.dart';
import '../../firebase_options.dart';

class ElderScreen extends ConsumerStatefulWidget {
  const ElderScreen({super.key});

  @override
  ConsumerState<ElderScreen> createState() => _ElderScreenState();
}

class _ElderScreenState extends ConsumerState<ElderScreen> {
  late final CallClient _client;
  CallState _state = CallState.idle;
  String? _error;
  double _level = 0;
  DateTime _levelShownAt = DateTime.fromMillisecondsSinceEpoch(0);

  // 來電中（響鈴，等長輩接聽／拒接／逾時）；45 秒跟後端 push.ts 的 FCM TTL 對齊。
  static const _ringSeconds = 45;
  IncomingCallPayload? _incoming;
  Timer? _incomingTimer;

  @override
  void initState() {
    super.initState();
    _client = CallClient(
      onState: (s) {
        if (!mounted) return;
        setState(() => _state = s);
        s == CallState.idle || s == CallState.error
            ? WakelockPlus.disable()
            : WakelockPlus.enable();
      },
      onLevel: (v) {
        // 麥克風每秒回報數十次，音量條每秒更新 4 次就夠，不必每包都重畫整個畫面
        final now = DateTime.now();
        if (!mounted || now.difference(_levelShownAt).inMilliseconds < 250) return;
        _levelShownAt = now;
        setState(() => _level = v);
      },
      onError: (m) => mounted ? setState(() => _error = m) : null,
    );
    // 只有在 Firebase 已設定時才碰任何 Firebase API（FCM 推播、來電）
    if (DefaultFirebaseOptions.isConfigured) {
      ensureDeviceRegistered();
      startIncomingCallListening(onIncoming: (payload) {
        if (!mounted || _inCall) return; // 通話中收到的來電（理論上不會發生）直接忽略
        _incomingTimer?.cancel();
        setState(() => _incoming = payload);
        _incomingTimer = Timer(const Duration(seconds: _ringSeconds), () {
          if (mounted) setState(() => _incoming = null); // 逾時：後端自行判定未接，App 端不用回報
        });
      });
    }
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _incomingTimer?.cancel();
    _client.dispose();
    super.dispose();
  }

  void _acceptIncoming() {
    final payload = _incoming;
    if (payload == null) return;
    _incomingTimer?.cancel();
    setState(() => _incoming = null);
    _start(attemptId: payload.attemptId);
  }

  void _declineIncoming() {
    _incomingTimer?.cancel();
    setState(() => _incoming = null); // 拒接：後端自行判定未接，App 端不用回報
  }

  bool get _inCall =>
      _state == CallState.connecting ||
      _state == CallState.listening ||
      _state == CallState.speaking;

  Future<void> _start({String? attemptId}) async {
    if (_inCall) return; // 來電接聽時若已經在通話中就不重複撥打
    setState(() => _error = null);
    if (!await _client.requestMicPermission()) {
      setState(() => _error = '需要允許麥克風，小幫手才聽得到您說話');
      return;
    }
    await _client.start(attemptId: attemptId);
  }

  @override
  Widget build(BuildContext context) {
    if (_incoming != null) return _buildIncomingCallScreen(_incoming!);

    // 跟 web 版（backend/public/index.html）同一套配色：待機／可以撥出＝綠、
    // 聽長輩說話＝藍、小幫手說話中＝黃，連線中維持中性灰。
    final (label, color) = switch (_state) {
      CallState.connecting => ('連線中…', Colors.grey),
      CallState.listening => ('我在聽，請說話', AppColors.blue500),
      CallState.speaking => ('小幫手說話中', AppColors.yellow700),
      _ => ('跟小幫手聊聊', AppColors.green500),
    };

    return Scaffold(
      appBar: AppBar(
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          const BrandMark(),
          const SizedBox(width: 10),
          Flexible(
            child: Text('${AppConfig.elderName}，您好',
                style: const TextStyle(fontSize: 22), overflow: TextOverflow.ellipsis),
          ),
        ]),
        actions: [
          if (!_inCall)
            IconButton(
              tooltip: '切換身分',
              iconSize: 32,
              icon: const Icon(Icons.swap_horiz),
              onPressed: () => ref.read(roleProvider.notifier).set(null),
            ),
        ],
      ),
      body: Stack(children: [
        const BrandBackground(),
        SafeArea(
          child: Column(children: [
            const Spacer(flex: 2),
            if (_inCall) ...[
              const CallPulse(),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                child: Row(children: [
                  const Icon(Icons.mic),
                  const SizedBox(width: 8),
                  Expanded(
                      child: LinearProgressIndicator(
                          value: (_level * 4).clamp(0.0, 1.0), minHeight: 12)),
                  const SizedBox(width: 8),
                  Text(_level.toStringAsFixed(3)),
                ]),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(_error!,
                    style: const TextStyle(fontSize: 22, color: AppColors.red700),
                    textAlign: TextAlign.center),
              ),
            Expanded(
              flex: 4,
              child: Center(
                child: GestureDetector(
                  onTap: _state == CallState.connecting
                      ? null
                      : (_inCall ? _client.stop : _start),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: _state == CallState.speaking ? 280 : 250,
                    height: _state == CallState.speaking ? 280 : 250,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [color, Color.lerp(color, Colors.black, 0.18)!],
                      ),
                      boxShadow: [
                        BoxShadow(
                            color: color.withValues(alpha: 0.45),
                            blurRadius: _inCall ? 40 : 12,
                            spreadRadius: _inCall ? 12 : 0),
                      ],
                    ),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(20),
                    child: Text(label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 34, fontWeight: FontWeight.bold)),
                  ),
                ),
              ),
            ),
            if (_inCall)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.red500,
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  ),
                  onPressed: _client.stop,
                  icon: const Icon(Icons.call_end, size: 32),
                  label: const Text('結束通話', style: TextStyle(fontSize: 26)),
                ),
              ),
          ]),
        ),
      ]),
    );
  }

  /// 來電中畫面：接聽／拒接都在同一個 Flutter Scaffold 裡完成，不開額外的系統畫面，
  /// 也就不會有「接聽後跟原本畫面沒接好」這種殘留舊畫面擋住觸控的問題。
  Widget _buildIncomingCallScreen(IncomingCallPayload payload) {
    return Scaffold(
      backgroundColor: AppColors.blue500,
      body: SafeArea(
        child: Column(children: [
          const Spacer(flex: 2),
          const Icon(Icons.phone_in_talk, size: 72, color: Colors.white),
          const SizedBox(height: 16),
          Text('${payload.callerName}來電',
              style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
          const Spacer(flex: 3),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
              _incomingActionButton(
                onPressed: _declineIncoming,
                color: AppColors.red500,
                icon: Icons.call_end,
                label: '拒接',
              ),
              _incomingActionButton(
                onPressed: _acceptIncoming,
                color: AppColors.green500,
                icon: Icons.call,
                label: '接聽',
              ),
            ]),
          ),
          const SizedBox(height: 32),
        ]),
      ),
    );
  }

  Widget _incomingActionButton({
    required VoidCallback onPressed,
    required Color color,
    required IconData icon,
    required String label,
  }) {
    return Column(children: [
      IconButton(
        onPressed: onPressed,
        iconSize: 72,
        padding: const EdgeInsets.all(20),
        style: IconButton.styleFrom(backgroundColor: color, shape: const CircleBorder()),
        icon: Icon(icon, color: Colors.white, size: 36),
      ),
      const SizedBox(height: 8),
      Text(label, style: const TextStyle(color: Colors.white, fontSize: 22)),
    ]);
  }
}
