import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:audio_session/audio_session.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'config.dart';

enum CallState { idle, connecting, listening, speaking, error }

/// 一通語音對話：麥克風 16kHz PCM → WebSocket → 後端 → Gemini Live →
/// 24kHz PCM 回傳並即時播放。協定見 v2_mvp.md §5 與後端 live.ts。
class CallClient {
  CallClient({
    required this.onState,
    required this.onTranscript,
    required this.onError,
    this.onLevel,
  });

  final void Function(CallState) onState;
  final void Function(bool isElder, String text) onTranscript;
  final void Function(String message) onError;

  /// 收音診斷：每個音訊區塊的峰值（0~1），用來確認麥克風有沒有收到聲音
  final void Function(double level)? onLevel;

  final _recorder = AudioRecorder();
  WebSocketChannel? _ws;
  StreamSubscription? _wsSub, _micSub;
  bool _active = false;
  Timer? _speakingTimer;

  static const _playRate = 24000;

  /// 首次會跳出系統麥克風授權視窗
  Future<bool> requestMicPermission() => _recorder.hasPermission();

  /// [attemptId]：從「小幫手來電」接聽進來的通話要帶上，讓後端能把這通對應到
  /// 該次 /demo/ring 的 attempt（見 incoming_call.dart）。一般長輩主動按按鈕
  /// 撥打時不需要帶。
  Future<void> start({String? attemptId}) async {
    if (_active) return;
    _active = true;
    onState(CallState.connecting);
    try {
      final session = await AudioSession.instance;
      await session.configure(AudioSessionConfiguration(
        androidAudioAttributes: const AndroidAudioAttributes(
          contentType: AndroidAudioContentType.music,
          usage: AndroidAudioUsage.media,
        ),
        androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
      ));
      await session.setActive(true);

      await _setupPlayer();

      final query = attemptId == null
          ? 'elderId=${AppConfig.elderId}'
          : 'elderId=${AppConfig.elderId}&attemptId=$attemptId';
      final uri = Uri.parse('${AppConfig.backendWs}?$query');
      final ws = WebSocketChannel.connect(uri);
      _ws = ws;
      await ws.ready;
      _wsSub = ws.stream.listen(_onWsData,
          onError: (_) => _fail('與後端連線中斷'), onDone: () => stop(fromServer: true));
    } catch (e) {
      _fail('無法連線到後端：$e');
    }
  }

  Future<void> _setupPlayer() async {
    await FlutterPcmSound.setup(sampleRate: _playRate, channelCount: 1);
    await FlutterPcmSound.setFeedThreshold(_playRate ~/ 10);
  }

  Future<void> _startMic() async {
    if (!await _recorder.hasPermission()) {
      _fail('沒有麥克風權限');
      return;
    }
    final stream = await _recorder.startStream(const RecordConfig(
      encoder: AudioEncoder.pcm16bits,
      sampleRate: 16000,
      numChannels: 1,
      echoCancel: true,
      noiseSuppress: true,
      autoGain: true,
    ));
    _micSub = stream.listen((chunk) {
      _ws?.sink.add(chunk);
      if (onLevel != null && chunk.length >= 2) {
        final samples = Uint8List.fromList(chunk).buffer.asInt16List(0, chunk.length ~/ 2);
        var peak = 0;
        for (final v in samples) {
          final a = v.abs();
          if (a > peak) peak = a;
        }
        onLevel!(peak / 32768);
      }
    });
  }

  void _onWsData(dynamic data) {
    if (data is List<int>) {
      _playChunk(data is Uint8List ? data : Uint8List.fromList(data));
      return;
    }
    final msg = jsonDecode(data as String) as Map<String, dynamic>;
    switch (msg['type']) {
      case 'ready':
        _startMic().then((_) => onState(CallState.listening));
      case 'interrupted':
        _flushPlayer();
        onState(CallState.listening);
      case 'transcript':
        onTranscript(msg['role'] == 'elder', msg['text'] as String);
      case 'turnComplete':
        _speakingTimer?.cancel();
        onState(CallState.listening);
      case 'error':
        _fail(msg['message'] as String? ?? '語音服務錯誤');
    }
  }

  void _playChunk(Uint8List bytes) {
    if (bytes.length < 2) return;
    final n = bytes.length ~/ 2;
    final samples = bytes.buffer.asInt16List(bytes.offsetInBytes, n);
    FlutterPcmSound.feed(PcmArrayInt16.fromList(samples));
    onState(CallState.speaking);
    // 保底：一段時間沒新音訊就回到聆聽
    _speakingTimer?.cancel();
    _speakingTimer = Timer(const Duration(milliseconds: 1500), () {
      if (_active) onState(CallState.listening);
    });
  }

  /// 被長輩打斷：套件無「清空緩衝」API，重建播放器以立即停聲
  Future<void> _flushPlayer() async {
    await FlutterPcmSound.release();
    await _setupPlayer();
  }

  void _fail(String message) {
    onError(message);
    stop();
    onState(CallState.error);
  }

  Future<void> stop({bool fromServer = false}) async {
    if (!_active) return;
    _active = false;
    _speakingTimer?.cancel();
    if (!fromServer) {
      try {
        _ws?.sink.add(jsonEncode({'type': 'end'}));
      } catch (_) {}
    }
    await _micSub?.cancel();
    if (await _recorder.isRecording()) await _recorder.stop();
    await _wsSub?.cancel();
    await _ws?.sink.close();
    _ws = null;
    await FlutterPcmSound.release();
    onState(CallState.idle);
  }

  Future<void> dispose() async {
    await stop();
    await _recorder.dispose();
  }
}
