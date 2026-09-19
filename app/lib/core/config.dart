/// 後端位址。模擬器連本機後端用 10.0.2.2；正式／Demo 請以
/// `--dart-define=BACKEND_WS=wss://xxx/ws` 覆寫。
class AppConfig {
  static const backendWs =
      String.fromEnvironment('BACKEND_WS', defaultValue: 'ws://10.0.2.2:8080/ws');
  static const elderId = String.fromEnvironment('ELDER_ID', defaultValue: 'demo');
  static const elderName = String.fromEnvironment('ELDER_NAME', defaultValue: '王奶奶');

  /// Demo 模式：顯示「立即產生晚報」等工具
  static const demoMode = bool.fromEnvironment('DEMO_MODE', defaultValue: true);

  /// backendWs（ws://或wss://…/ws）轉換成後端 HTTP 位址上的某條路徑
  static Uri httpUri(String path) {
    final ws = Uri.parse(backendWs);
    return Uri(
      scheme: ws.scheme == 'wss' ? 'https' : 'http',
      host: ws.host,
      port: ws.hasPort ? ws.port : null,
      path: path,
    );
  }
}
