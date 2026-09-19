import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

var _started = false;

/// 長輩模式專用：要求通知權限、取得 FCM token 並向後端登記；token 更新時
/// 重新登記。只在 Firebase 已設定時呼叫（見 elder_screen.dart）。
/// 不持久化「已登記成功」狀態——登記失敗就安靜略過，下次開 App 會自然重試。
void ensureDeviceRegistered() {
  if (_started) return;
  _started = true;
  _requestAndRegister();
  FirebaseMessaging.instance.onTokenRefresh.listen(_register);
}

Future<void> _requestAndRegister() async {
  try {
    await FirebaseMessaging.instance.requestPermission();
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) await _register(token);
  } catch (_) {
    // 下次開 App 會再試一次
  }
}

Future<void> _register(String token) async {
  try {
    await http
        .post(AppConfig.httpUri('/devices/register'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'elderId': AppConfig.elderId, 'token': token}))
        .timeout(const Duration(seconds: 15));
  } catch (_) {
    // 下次開 App 會再試一次
  }
}
