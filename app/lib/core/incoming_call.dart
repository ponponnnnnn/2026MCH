import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';

import '../firebase_options.dart';
import 'config.dart';

/// FCM data 訊息是外部輸入，type/elderId/attemptId 都要驗證過才能信任
final _idPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

class _CallPayload {
  const _CallPayload(this.attemptId, this.callerName);
  final String attemptId;
  final String callerName;
}

_CallPayload? _validate(Map<String, dynamic> data) {
  if (data['type'] != 'incoming_call') return null;
  final elderId = data['elderId'];
  final attemptId = data['attemptId'];
  if (elderId is! String || !_idPattern.hasMatch(elderId)) return null;
  if (attemptId is! String || !_idPattern.hasMatch(attemptId)) return null;
  if (elderId != AppConfig.elderId) return null; // 不是打給這台裝置，忽略
  final callerName = data['callerName'];
  return _CallPayload(attemptId, callerName is String && callerName.isNotEmpty ? callerName : '小幫手');
}

const _ringSeconds = 45;

Future<void> _showIncomingCall(_CallPayload payload) async {
  try {
    await FlutterCallkitIncoming.showCallkitIncoming(CallKitParams(
      id: payload.attemptId,
      nameCaller: payload.callerName,
      appName: '長照小幫手',
      duration: _ringSeconds * 1000,
      android: const AndroidParams(
        isShowLogo: false,
        isShowCallID: false,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#2E7D6B',
        actionColor: '#E07A2F',
        textColor: '#FFFFFF',
        incomingCallNotificationChannelName: '小幫手來電',
        missedCallNotificationChannelName: '未接來電',
        isShowFullLockedScreen: true,
        isFullScreen: true,
        textAccept: '接聽',
        textDecline: '拒接',
      ),
    ));
  } catch (e) {
    // 顯示來電畫面失敗（例如權限被拒）不能讓 App 當掉，但要留紀錄才查得到
    debugPrint('[incoming_call] 顯示來電畫面失敗：$e');
  }
}

/// FCM 背景／App 被關閉時的訊息處理。必須是頂層函式，且背景 isolate 沒有
/// 現成的 Firebase 狀態，要自己重新 initializeApp()。
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (!DefaultFirebaseOptions.isConfigured) return;
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.android);
  }
  final payload = _validate(message.data);
  if (payload == null) return;
  await _showIncomingCall(payload);
}

/// 註冊 FCM 背景 handler。main() 與 [startIncomingCallListening] 都會呼叫，
/// 重複呼叫是安全的（只是重新登記同一個 callback handle）。
void registerBackgroundHandler() {
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
}

var _listening = false;

/// 長輩模式專用：監聽前景推播、監聽接聽/拒接/逾時事件，並檢查 App 是否因為
/// 使用者在「小幫手來電」畫面按下接聽而剛被喚醒（App 被關掉時也走這條路：
/// flutter_callkit_incoming 會把接聽狀態存在原生層，用 activeCalls() 讀回）。
/// 通知權限交給 push_registration.dart 的 FirebaseMessaging.requestPermission()；
/// 這裡只補請求 Android 14+ 專屬的全螢幕來電權限。
/// 只在 Firebase 已設定時呼叫（見 elder_screen.dart）。
void startIncomingCallListening({required void Function(String attemptId) onAccept}) {
  registerBackgroundHandler();
  unawaited(FlutterCallkitIncoming.requestFullIntentPermission());

  if (_listening) return;
  _listening = true;

  FirebaseMessaging.onMessage.listen((message) {
    final payload = _validate(message.data);
    if (payload != null) unawaited(_showIncomingCall(payload));
  });

  FlutterCallkitIncoming.onEvent.listen((event) {
    if (event is CallEventActionCallAccept) {
      _accept(event.callKitParams.id, onAccept);
    }
    // 拒接／逾時：後端自行判定未接，App 端不用回報，什麼都不做
  });

  unawaited(_checkAlreadyAccepted(onAccept));
}

Future<void> _checkAlreadyAccepted(void Function(String attemptId) onAccept) async {
  try {
    final calls = await FlutterCallkitIncoming.activeCalls();
    for (final call in calls) {
      if (call.isAccepted) _accept(call.id, onAccept);
    }
  } catch (_) {}
}

void _accept(String attemptId, void Function(String attemptId) onAccept) {
  if (!_idPattern.hasMatch(attemptId)) return;
  onAccept(attemptId);
  unawaited(FlutterCallkitIncoming.endCall(attemptId).catchError((_) {}));
}
