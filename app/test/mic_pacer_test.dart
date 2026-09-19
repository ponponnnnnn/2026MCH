import 'dart:typed_data';

import 'package:care_helper/core/mic_pacer.dart';
import 'package:flutter_test/flutter_test.dart';

Uint8List _pcm(List<int> samples) {
  final b = ByteData(samples.length * 2);
  for (var i = 0; i < samples.length; i++) {
    b.setInt16(i * 2, samples[i], Endian.little);
  }
  return b.buffer.asUint8List();
}

List<int> _samples(Uint8List bytes) {
  final d = ByteData.sublistView(bytes);
  return [for (var i = 0; i < bytes.length ~/ 2; i++) d.getInt16(i * 2, Endian.little)];
}

/// 有底噪的「真實」聲音：不含連續的 0
List<int> _voice(int n, int seed) => [for (var i = 0; i < n; i++) ((i * 37 + seed * 101) % 2001) - 1000 == 0 ? 7 : ((i * 37 + seed * 101) % 2001) - 1000];

void main() {
  test('正常速率：整包原樣通過（連長段數位靜音也不動）', () {
    final p = MicPacer();
    var elapsed = 0;
    for (var k = 0; k < 50; k++) {
      elapsed += 64; // 1024 samples @16k = 64ms
      final chunk = _pcm(k.isEven ? _voice(1024, k) : List.filled(1024, 0));
      expect(identical(p.process(chunk, elapsed), chunk), isTrue);
    }
  });

  test('模擬器超速補零：補的 0 被丟掉，真實聲音逐樣本保留且順序不變', () {
    final p = MicPacer();
    final realSent = <int>[];
    final out = <int>[];
    var elapsed = 0;
    // 每 64ms 實際時間內收到 1 包真聲音 + 約 3.6 包的 0（與實測 4.6 倍一致），補零不對齊包邊界
    final stream = <int>[];
    for (var k = 0; k < 40; k++) {
      final v = _voice(1024, k);
      realSent.addAll(v);
      stream
        ..addAll(v.sublist(0, 500))
        ..addAll(List.filled(1900, 0))
        ..addAll(v.sublist(500))
        ..addAll(List.filled(1786, 0));
    }
    const perTick = 4710; // 每 64ms 交出的樣本數
    for (var off = 0; off < stream.length; off += 1024) {
      if (off % perTick < 1024) elapsed += 64;
      final end = off + 1024 > stream.length ? stream.length : off + 1024;
      out.addAll(_samples(p.process(_pcm(stream.sublist(off, end)), elapsed)));
    }
    final voiceOnly = out.where((s) => s != 0).toList();
    expect(voiceOnly, equals(realSent.where((s) => s != 0).toList()));
    // 開頭 200ms 的容許量內會放行少量的 0，其餘補零都要被丟掉
    expect(out.length, lessThan(realSent.length + 3200 + 1024));
  });

  test('超速但整包都是真聲音（卡頓後的補送）：不丟任何樣本', () {
    final p = MicPacer();
    final burst = _pcm(_voice(16000, 3));
    expect(_samples(p.process(burst, 10)).length, 16000);
  });
}
