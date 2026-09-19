import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 這裡讀的是「Web 應用程式」的 Firebase 設定（apiKey、appId 等），
// 跟後端 backend/ 用的服務帳戶 JSON（Admin SDK）是兩回事，不能共用。
// 去 Firebase Console →專案設定 →一般 →你的應用程式（沒有就新增一個「Web」應用程式），
// 把那邊顯示的設定值填進 .env（見 .env.example）。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.warn("[firebase] VITE_FIREBASE_PROJECT_ID 未設定，請檢查 .env");
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/** Demo 用預設長輩 id，對應後端 config.ts 的 DEFAULT_ELDER_ID */
export const DEFAULT_ELDER_ID = import.meta.env.VITE_DEFAULT_ELDER_ID || "demo";
