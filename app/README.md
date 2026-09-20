# care_helper

長照小幫手的 Flutter App，一支 App 兩種身分：長輩模式（打電話跟小幫手聊天、接收主動來電）、家屬模式（Firestore 即時儀表板、FCM 來電通知）。身分存在本機（`shared_preferences`），開啟後可以隨時用右上角切換身分圖示切換。

後端（Express + WebSocket + Gemini Live）在 `../backend`，介面與分層說明見 [`../backend/README.md`](../backend/README.md)。

## 開發環境

- Flutter SDK 在 `C:\flutter\bin`，**沒有加進 PATH**，指令都要打完整路徑，例如 `C:\flutter\bin\flutter run`（或自己把 `C:\flutter\bin` 加進 PATH 之後就能省略）。
- `adb`、`emulator` 已經在 PATH 裡（Android SDK 的 `platform-tools`、`emulator` 資料夾），可以直接打 `adb ...`、`emulator ...`。
- Firebase 設定（`lib/firebase_options.dart`、`android/app/google-services.json`）已經填好、進版本控制，不用另外設定就能連正式的 `mch-e65ce` 專案。

## 啟動 Pixel 模擬器

已建好的 AVD 叫 `Pixel_9`（Pixel 9、1080x2424、WHPX 加速）。開機：

```bash
emulator -avd Pixel_9 -allow-host-audio
```

`-allow-host-audio` 是讓模擬器的麥克風真的讀電腦麥克風輸入（不是靜音），語音通話要測試真的講話一定要加這個參數。開機到看得到桌面大概 30~60 秒，可以用 `adb devices` 確認裝置上線。

## 執行 App

**直接跑（開發用，有 hot reload）**：

```bash
cd app
C:\flutter\bin\flutter run \
  --dart-define=BACKEND_WS=ws://10.0.2.2:8080/ws \
  --dart-define=ELDER_ID=test-local \
  --dart-define=ELDER_NAME=測試長輩
```

`10.0.2.2` 是模擬器裡代表「電腦本機」的位址，不是打錯。`ELDER_ID` 決定這台裝置對應 Firestore 裡 `elders/{ELDER_ID}` 哪一份長輩資料；不帶這三個 `--dart-define` 會用 `lib/core/config.dart` 裡的預設值（`ELDER_ID=demo`），`demo` 是隊友在用的正式展示資料，**本機測試不要用這個 id**，用下面「Demo 情境」建的 `test-local`。

**Build 成 APK 再裝（比較穩定，適合長時間測試或正式 Demo）**：

```bash
cd app
C:\flutter\bin\flutter build apk --debug \
  --dart-define=BACKEND_WS=ws://10.0.2.2:8080/ws \
  --dart-define=ELDER_ID=test-local \
  --dart-define=ELDER_NAME=測試長輩
adb install -r build\app\outputs\flutter-apk\app-debug.apk
```

## 看 log：確認真的有在對話、工具有沒有被呼叫

**重點都在後端 log，不是手機端的 log。** 語音逐字稿、Gemini 有沒有呼叫工具，這些都是後端在跟 Gemini Live 對接時印出來的，手機端的 `adb logcat` 只看得到 App 自己的技術性訊息（FCM 收到訊息、Flutter 錯誤），看不到對話內容。

後端要用真的 Firestore（不是 `DEV_NO_DB` 假資料）才會有完整紀錄，見下面「Demo 情境」怎麼設定 `.env`。啟動後端：

```bash
cd backend
npx tsx --env-file=.env src/server.ts
```

啟動之後這個視窗會即時印出：

```
[live] 長輩：「叫我陳貝貝就好了。」          ← 長輩說的話（逐字稿）
[live] 小幫手：「陳貝貝好，很高興認識您。」   ← 小幫手說的話（逐字稿）
[live] turnComplete                          ← 這一輪對話結束
[tool:remember_fact] {"field":"preferredName","value":"陳貝貝"}   ← 工具被呼叫，帶的參數
[live] Gemini 連線關閉 code=1000 reason=(無)  ← 這通電話結束
```

只想看對話跟工具呼叫、濾掉麥克風音量診斷雜訊（`[mic] ...`），用 `grep`（Git Bash / WSL）：

```bash
npx tsx --env-file=.env src/server.ts 2>&1 | grep -v '^\[mic\]'
```

想在跑的同時留一份紀錄檔，之後回頭查：

```bash
npx tsx --env-file=.env src/server.ts 2>&1 | tee backend.log
```

## Demo 情境：清空重測、通話結束 20 秒後自動回撥

適合正式排練或每次想從乾淨狀態重來一遍時用。固定用同一個測試長輩 `test-local`（跟隊友在用的 `demo` 資料是分開的兩份 Firestore 資料，不會互相干擾）。

**1. `.env` 設定**（`backend/.env`，本機自己的檔案，不會進版本控制）：

```
DEV_NO_DB=0
GOOGLE_CLOUD_PROJECT=mch-e65ce
DEFAULT_ELDER_ID=test-local
DEMO_MODE=1
GEMINI_API_KEY=<你的 key>
```

`DEMO_MODE=1` 才會開啟「通話結束 20 秒後自動回撥」跟 App 家屬畫面上的「Demo：立即產生晚報」「Demo：請小幫手打給長輩」兩個按鈕。

**2. 清空 `test-local` 底下所有資料**（healthLogs、sessions、facts、topicHooks、callAttempts、dailyReports 全部清掉，回到全空）：

```bash
cd backend
npm run reset-elder -- test-local
```

這個腳本會拒絕清 `demo`（隊友的正式展示資料），只認 `test-local` 這種自訂 id，清之前先確認參數沒打錯。

**3. 啟動後端**（同上，記得用 `.env` 這個檔）：

```bash
npx tsx --env-file=.env src/server.ts
```

**4. 裝 App，開模擬器、長輩身分、按「跟小幫手聊聊」撥出第一通**，跟小幫手講幾句話（隨便聊，講到吃飯、睡眠或興趣都可以，講夠內容才有東西可以在第二通接續話題），按「結束通話」掛斷。

**5. 等 20 秒**——不用做任何事，後端會自動偵測「這是第一次真的講到話的通話」，20 秒後主動推播來電，App 會跳出 App 內的來電畫面（不是系統電話，是小幫手自己畫的畫面），接聽後小幫手會接續上一通聊到的話題開新話題。後端 log 會印：

```
[call-schedule] (demo) 20 秒後自動回撥 elderId=test-local
```

**只回撥這一次**：第二通結束後不會再自動打第三通，要再測一輪從步驟 2 重新清空。

**模擬器收不到推播的已知問題**：Android 模擬器的 Google 帳號推播連線偶爾會斷線，`pushed:1`（後端顯示已送出）但手機端完全沒反應。遇到這種情況切一次飛航模式強制重連：

```bash
adb shell cmd connectivity airplane-mode enable
adb shell cmd connectivity airplane-mode disable
```

等 10~15 秒讓連線重建，再重新觸發（或等下一次自動回撥的排程）。真機上目前還沒驗證過是否有一樣的問題，正式 Demo 建議優先用真機。

**想手動立刻觸發一次響鈴**（不用等 20 秒、不用先講完一通）：

```bash
curl -X POST http://localhost:8080/demo/ring -H "Content-Type: application/json" -d '{"elderId":"test-local"}'
```

## 其他資源

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)
