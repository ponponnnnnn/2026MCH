import 'dart:typed_data';

/// 確保送出的麥克風音訊量不超過實際經過的時間。
///
/// Android 模擬器的虛擬麥克風在某些狀態下不會等聲音來才交資料，而是被要就立刻交、
/// 沒聲音就補 0，結果每秒交出 4~5 倍的樣本，真實語音被大段的 0 切碎，語音辨識完全失效。
/// 這裡只在「已送出的量超過實際時間」時介入，而且只丟連續的 0；真實聲音一個樣本都不動。
/// 正常裝置的資料量不會超過實際時間，整包原樣通過。
class MicPacer {
  MicPacer({this.sampleRate = 16000, this.slackSamples = 3200, this.minZeroRun = 64});

  final int sampleRate;

  /// 容許超前的量（預設 200ms），吸收正常的傳遞抖動
  final int slackSamples;

  /// 超速時，連續幾個 0 以上才視為補零（預設 4ms；真實麥克風有底噪，不會連續這麼多個 0）
  final int minZeroRun;

  int _sentSamples = 0;

  /// [pcm16]：一包 little-endian 16-bit PCM；[elapsedMs]：開始錄音至今的毫秒數。
  /// 回傳實際要送出的位元組（可能是空的）。
  Uint8List process(Uint8List pcm16, int elapsedMs) {
    final n = pcm16.length ~/ 2;
    final budget = elapsedMs * sampleRate ~/ 1000 + slackSamples - _sentSamples;
    if (n <= budget) {
      _sentSamples += n;
      return pcm16;
    }

    final data = ByteData.sublistView(pcm16);
    final out = Uint8List(n * 2);
    var outLen = 0;
    var i = 0;
    while (i < n) {
      if (data.getInt16(i * 2, Endian.little) != 0) {
        out[outLen++] = pcm16[i * 2];
        out[outLen++] = pcm16[i * 2 + 1];
        i++;
        continue;
      }
      var j = i;
      while (j < n && data.getInt16(j * 2, Endian.little) == 0) {
        j++;
      }
      if (j - i < minZeroRun) {
        outLen += (j - i) * 2; // out 預設就是 0，短的 0 段原樣保留
      }
      i = j;
    }
    _sentSamples += outLen ~/ 2;
    return Uint8List.sublistView(out, 0, outLen);
  }
}
