import 'package:firebase_core/firebase_core.dart';

/// Firebase 專案 mch-e65ce 的 Android 設定。
///
/// 這個專案的 Android App 尚未在 Firebase 註冊，四個欄位先留空字串。
/// 使用者拿到 Firebase 設定後，把 google-services.json（或 Firebase Console
/// 裡 Android App 的設定值）填進下面四個欄位即可，不需要再動其他程式碼。
class DefaultFirebaseOptions {
  DefaultFirebaseOptions._();

  static const android = FirebaseOptions(
    apiKey: '',
    appId: '',
    messagingSenderId: '',
    projectId: '',
  );

  /// 四個欄位都填了才算設定完成；App 只在這裡回傳 true 時才會呼叫
  /// Firebase.initializeApp() 與任何 Firebase API。
  static bool get isConfigured =>
      android.apiKey.isNotEmpty &&
      android.appId.isNotEmpty &&
      android.messagingSenderId.isNotEmpty &&
      android.projectId.isNotEmpty;
}
