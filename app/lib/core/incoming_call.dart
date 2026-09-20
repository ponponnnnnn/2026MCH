import 'package:firebase_messaging/firebase_messaging.dart';

import 'config.dart';

/// FCM data 訊息是外部輸入，type/elderId/attemptId 都要驗證過才能信任
final _idPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

class IncomingCallPayload {
  const IncomingCallPayload(this.attemptId, this.callerName);
  final String attemptId;
  final String callerName;
}

IncomingCallPayload? _validate(Map<String, dynamic> data) {
  if (data['type'] != 'incoming_call') return null;
  final elderId = data['elderId'];
  final attemptId = data['attemptId'];
  if (elderId is! String || !_idPattern.hasMatch(elderId)) return null;
  if (attemptId is! String || !_idPattern.hasMatch(attemptId)) return null;
  if (elderId != AppConfig.elderId) return null; // 不是打給這台裝置，忽略
  final callerName = data['callerName'];
  return IncomingCallPayload(attemptId, callerName is String && callerName.isNotEmpty ? callerName : '小幫手');
}

var _listening = false;

/// 長輩模式專用：監聽來電推播，驗證過的來電一律交給 [onIncoming]，畫面（響鈴中／
/// 接聽／拒接）完全由呼叫端（elder_screen.dart）在 App 裡面自己畫，這裡不碰 UI，
/// 也不開任何系統層的來電畫面——App 在背景或被關掉時交給 FCM 訊息裡的
/// notification 欄位跳一般系統通知，點了才把 App 帶到前景，一樣走
/// onMessageOpenedApp／getInitialMessage 這條路徑進來，行為跟前景收到時一致，
/// 全程只有一份 Flutter 畫面，不會有殘留的舊畫面擋住觸控。
/// 只在 Firebase 已設定時呼叫（見 elder_screen.dart）。
void startIncomingCallListening({required void Function(IncomingCallPayload payload) onIncoming}) {
  if (_listening) return;
  _listening = true;

  void handle(RemoteMessage message) {
    final payload = _validate(message.data);
    if (payload != null) onIncoming(payload);
  }

  FirebaseMessaging.onMessage.listen(handle);
  FirebaseMessaging.onMessageOpenedApp.listen(handle);
  FirebaseMessaging.instance.getInitialMessage().then((m) {
    if (m != null) handle(m);
  });
}
