# 家屬儀表板（F6）

Vite + React + Firebase Client SDK + Recharts。即時監聽 Firestore，
長輩用手機聊完天，這裡幾秒內就會看到警報、健康紀錄、每日摘要、7 天趨勢。

## 這跟 backend/ 的差異

`backend/` 用的是 **Firebase Admin SDK**（服務帳戶 JSON，有完整讀寫權限，只能在伺服器跑）。
這個前端用的是 **Firebase Web SDK**（給瀏覽器用，權限受 Firestore 安全規則限制）。
兩者設定方式不同，不能共用 `backend/.env` 裡的東西。

## 安裝步驟

### 1. 取得 Firebase Web 設定

Firebase Console → 齒輪圖示「專案設定」→ 拉到「你的應用程式」→
如果還沒有 Web 應用程式，點「新增應用程式」選網頁（`</>`圖示）。
建立後會看到一段 `firebaseConfig`，把裡面的值填進 `.env`（複製 `.env.example`）。

```powershell
Copy-Item .env.example .env
```

### 2. 確認 Firestore 安全規則允許讀取

黑客松「測試模式」建立的 Firestore，30 天內預設允許任何人讀寫，開發階段不用額外設定。
如果 Console 顯示規則已經鎖起來（無法讀取），去「Firestore Database」→「規則」，
暫時改成：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if false;  // 前端只讀，寫入交給後端
    }
  }
}
```

### 3. 安裝套件並啟動

```powershell
npm install
npm run dev
```

打開 `http://localhost:5173`，應該會看到長輩姓名、警報區、今日健康卡片、
今日摘要、7 天趨勢圖。

## 資料哪裡來

都是即時監聽（`onSnapshot`），後端 `log_health`／`raise_alert`／`report.ts`
寫入 Firestore 的瞬間，這裡就會自動更新，不用重新整理頁面。

| 區塊 | 讀取的 Firestore 路徑 |
|---|---|
| 警報 | `elders/{elderId}/alerts`，依時間新到舊 |
| 今日健康狀況 | `elders/{elderId}/healthLogs`，過濾今天（台北時區） |
| 今日摘要 | `elders/{elderId}/dailyReports/{今天日期}` |
| 長期趨勢 | `elders/{elderId}/dailyReports` 近 7 天 |

## 還沒做的部分（先求能看，之後再補）

- 只支援單一長輩（讀 `.env` 裡的 `VITE_DEFAULT_ELDER_ID`），多長輩切換之後再加
- 沒有登入驗證，任何知道網址的人都能看到資料，Demo 階段先這樣，正式上線前要補
- 對話逐字稿（`sessions` collection）還沒有畫面呈現，目前只用 Gemini 生成的摘要文字
