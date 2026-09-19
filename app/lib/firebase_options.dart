import 'package:firebase_core/firebase_core.dart';

/// Firebase 專案 mch-e65ce 的 Android 設定。
///
/// 值來自 Firebase 註冊的 Android App（com.meichu.care_helper），與
/// android/app/google-services.json 一致。這些是用戶端識別碼，不是機密。
class DefaultFirebaseOptions {
  DefaultFirebaseOptions._();

  static const android = FirebaseOptions(
    apiKey: 'AIzaSyAIwY_k-Gm8MKPs7F9XKOs5Or5CvPlNlb0',
    appId: '1:761010872013:android:624915f6609ede21c91384',
    messagingSenderId: '761010872013',
    projectId: 'mch-e65ce',
  );

  /// 四個欄位都填了才算設定完成；App 只在這裡回傳 true 時才會呼叫
  /// Firebase.initializeApp() 與任何 Firebase API。
  static bool get isConfigured =>
      android.apiKey.isNotEmpty &&
      android.appId.isNotEmpty &&
      android.messagingSenderId.isNotEmpty &&
      android.projectId.isNotEmpty;
}
