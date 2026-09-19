import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'config.dart';
import 'mic_pacer.dart';

enum CallState { idle, connecting, listening, speaking, error }

/// 一通語音對話：麥克風 16kHz PCM → WebSocket → 後端 → Gemini Live →
/// 24kHz PCM 回傳並即時播放。協定見 v2_mvp.md §5 與後端 live.ts。
class CallClient {
  CallClient({
    required this.onState,
    required this.onError,
    this.onLevel,
  });

  final void Function(CallState) onState;
  final void Function(String message) onError;

  /// 收音診斷：每個音訊區塊的峰值（0~1），用來確認麥克風有沒有收到聲音
  final void Function(double level)? onLevel;

  final _recorder = AudioRecorder();
  WebSocketChannel? _ws;
  StreamSubscription? _wsSub, _micSub;
  bool _active = false;

  static const _playRate = 24000;
  Future<void>? _teardown;
  CallState _state = CallState.idle;

  /// 播放排隊：Gemini 送音訊比實際播放快，全部直接餵給原生播放器的話，長輩插話時
  /// 原生緩衝裡還有好幾秒停不下來，只能整個拆掉重建——而通話中重建 AudioTrack 會讓
  /// 模擬器的畫面停止更新。改成自己排隊、原生端只保留約 0.25~0.5 秒，插話時清排隊即可。
  static const _feedSlice = _playRate ~/ 4;
  final Queue<Int16List> _playQueue = Queue();
  int _headOffset = 0;
  bool _nativeHungry = true;

  void _setState(CallState s) {
    if (s == _state) return;
    _state = s;
    onState(s);
  }

  /// 首次會跳出系統麥克風授權視窗
  Future<bool> requestMicPermission() => _recorder.hasPermission();

  /// [attemptId]：從「小幫手來電」接聽進來的通話要帶上，讓後端能把這通對應到
  /// 該次 /demo/ring 的 attempt（見 incoming_call.dart）。一般長輩主動按按鈕
  /// 撥打時不需要帶。
  Future<void> start({String? attemptId}) async {
    if (_active) return;
    await _teardown;
    _active = true;
    _setState(CallState.connecting);
    try {
      final session = await AudioSession.instance;
      // 用媒體路徑播放：voiceCommunication 在模擬器上會走窄頻通話路徑，小幫手的聲音會糊掉。
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
    await FlutterPcmSound.setFeedThreshold(_feedSlice);
    FlutterPcmSound.setFeedCallback(_onNativeBufferLow);
    _clearPlayQueue();
  }

  void _clearPlayQueue() {
    _playQueue.clear();
    _headOffset = 0;
    _nativeHungry = true;
  }

  void _onNativeBufferLow(int remainingFrames) {
    if (!_active) return;
    if (remainingFrames == 0 && _playQueue.isEmpty) _setState(CallState.listening);
    _pump();
  }

  void _pump() {
    if (_playQueue.isEmpty) {
      _nativeHungry = true;
      return;
    }
    _nativeHungry = false;
    final out = Int16List(_feedSlice);
    var n = 0;
    while (n < _feedSlice && _playQueue.isNotEmpty) {
      final head = _playQueue.first;
      final take = min(_feedSlice - n, head.length - _headOffset);
      out.setRange(n, n + take, head, _headOffset);
      n += take;
      _headOffset += take;
      if (_headOffset >= head.length) {
        _playQueue.removeFirst();
        _headOffset = 0;
      }
    }
    FlutterPcmSound.feed(PcmArrayInt16.fromList(Int16List.sublistView(out, 0, n)));
    _setState(CallState.speaking);
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
      // 預設 pause 會讓錄音器自己搶音訊焦點，焦點一被搶（播放器重建、通知音）就暫停且不會自動恢復，
      // 畫面仍顯示聆聽但後端收不到聲音。焦點已由 audio_session 統一管理，這裡不參與。
      audioInterruption: AudioInterruptionMode.none,
    ));
    final pacer = MicPacer();
    final clock = Stopwatch()..start();
    _micSub = stream.listen((chunk) {
      final paced = pacer.process(chunk, clock.elapsedMilliseconds);
      if (paced.isNotEmpty) _ws?.sink.add(paced);
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
        _startMic().then((_) => _setState(CallState.listening));
      case 'interrupted':
        _clearPlayQueue();
        _setState(CallState.listening);
      case 'turnComplete':
        if (_playQueue.isEmpty && _nativeHungry) _setState(CallState.listening);
      case 'error':
        _fail(msg['message'] as String? ?? '語音服務錯誤');
    }
  }

  void _playChunk(Uint8List bytes) {
    if (bytes.length < 2) return;
    // 複製一份：WebSocket 的緩衝區之後可能被重用
    _playQueue.add(Int16List.fromList(bytes.buffer.asInt16List(bytes.offsetInBytes, bytes.length ~/ 2)));
    if (_nativeHungry) _pump();
  }

  void _fail(String message) {
    onError(message);
    stop();
    _setState(CallState.error);
  }

  Future<void> stop({bool fromServer = false}) {
    if (!_active) return _teardown ?? Future.value();
    _active = false;
    return _teardown = _tearDown(fromServer);
  }

  /// 每一步各自限時、各自接錯：原生音訊或 WebSocket 任何一步卡住或丟錯，
  /// 都不能讓畫面停在通話中（那樣「結束通話」會因為 _active 已是 false 而完全沒反應）。
  Future<void> _tearDown(bool fromServer) async {
    try {
      if (!fromServer) {
        try {
          _ws?.sink.add(jsonEncode({'type': 'end'}));
        } catch (_) {}
      }
      await _step('麥克風串流', () async => _micSub?.cancel());
      await _step('錄音器', () async {
        if (await _recorder.isRecording()) await _recorder.stop();
      });
      // 先關 sink 再取消訂閱：沒人監聽時 WebSocket 的關閉交握等不到對方回應
      final ws = _ws;
      _ws = null;
      await _step('WebSocket', () async => ws?.sink.close());
      await _step('WebSocket 訂閱', () async => _wsSub?.cancel());
      FlutterPcmSound.setFeedCallback(null);
      _clearPlayQueue();
      await _step('播放器', FlutterPcmSound.release);
    } finally {
      _setState(CallState.idle);
    }
  }

  Future<void> _step(String name, Future<void> Function() run) async {
    try {
      await run().timeout(const Duration(seconds: 3));
    } catch (e) {
      debugPrint('[call] 收尾步驟「$name」逾時或失敗：$e');
    }
  }

  Future<void> dispose() async {
    await stop();
    await _recorder.dispose();
  }
}
