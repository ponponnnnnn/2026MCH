import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../core/call_client.dart';
import '../../core/config.dart';
import '../../core/models.dart';
import '../../core/providers.dart';

class ElderScreen extends ConsumerStatefulWidget {
  const ElderScreen({super.key});

  @override
  ConsumerState<ElderScreen> createState() => _ElderScreenState();
}

class _ElderScreenState extends ConsumerState<ElderScreen> {
  late final CallClient _client;
  CallState _state = CallState.idle;
  bool _captions = true;
  String? _error;
  double _level = 0;
  final _lines = <TranscriptLine>[];
  final _scroll = ScrollController();

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
      onTranscript: (isElder, text) {
        if (!mounted) return;
        setState(() {
          if (_lines.isNotEmpty && _lines.last.isElder == isElder) {
            _lines.last.text += text;
          } else {
            _lines.add(TranscriptLine(isElder, text));
          }
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
        });
      },
      onLevel: (v) {
        if (mounted) setState(() => _level = v);
      },
      onError: (m) => mounted ? setState(() => _error = m) : null,
    );
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _client.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool get _inCall =>
      _state == CallState.connecting ||
      _state == CallState.listening ||
      _state == CallState.speaking;

  Future<void> _start() async {
    setState(() {
      _error = null;
      _lines.clear();
    });
    if (!await _client.requestMicPermission()) {
      setState(() => _error = '需要允許麥克風，小幫手才聽得到您說話');
      return;
    }
    await _client.start();
  }

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (_state) {
      CallState.connecting => ('連線中…', Colors.grey),
      CallState.listening => ('我在聽，請說話', const Color(0xFF2E7D6B)),
      CallState.speaking => ('小幫手說話中', const Color(0xFFE07A2F)),
      _ => ('跟小幫手聊聊', const Color(0xFF2E7D6B)),
    };

    return Scaffold(
      appBar: AppBar(
        title: Text('${AppConfig.elderName}，您好', style: const TextStyle(fontSize: 24)),
        actions: [
          IconButton(
            tooltip: '字幕',
            iconSize: 32,
            icon: Icon(_captions ? Icons.closed_caption : Icons.closed_caption_disabled),
            onPressed: () => setState(() => _captions = !_captions),
          ),
          if (!_inCall)
            IconButton(
              tooltip: '切換身分',
              iconSize: 32,
              icon: const Icon(Icons.swap_horiz),
              onPressed: () => ref.read(roleProvider.notifier).set(null),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(children: [
          if (_captions)
            Expanded(
              flex: 3,
              child: ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.all(16),
                itemCount: _lines.length,
                itemBuilder: (_, i) {
                  final l = _lines[i];
                  return Align(
                    alignment: l.isElder ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 6),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: l.isElder ? const Color(0xFFFFE6CC) : const Color(0xFFDDF1EC),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(l.text, style: const TextStyle(fontSize: 26, height: 1.4)),
                    ),
                  );
                },
              ),
            )
          else
            const Spacer(flex: 2),
          if (_inCall)
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
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!,
                  style: const TextStyle(fontSize: 22, color: Colors.red),
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
                    color: color,
                    shape: BoxShape.circle,
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
                  backgroundColor: Colors.red.shade700,
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
                onPressed: _client.stop,
                icon: const Icon(Icons.call_end, size: 32),
                label: const Text('結束通話', style: TextStyle(fontSize: 26)),
              ),
            ),
        ]),
      ),
    );
  }
}
