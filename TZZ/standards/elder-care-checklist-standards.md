# 健康檢核清單的準則依據

> 背景：專案原本的 5 項清單（用藥/睡眠/飲食/疼痛/心情）是團隊自訂，沒有對應任何協會/機構標準。這份文件記錄查證過、可以實際引用的依據。

## 對照表

| 層 | 協會／機構 | 準則名稱 | 年份 | 涵蓋項目 |
|---|---|---|---|---|
| 偵測／篩檢層 | WHO | ICOPE（Integrated Care for Older People） | 2019 初版／2025 第2版 | 認知衰退、行動能力／跌倒風險、營養不良、視力、聽力、憂鬱症狀 |
| 提醒／陪伴層（主結構） | NIA 美國國家老化研究院（NIH） | Healthy Aging Tips for the Older Adults in Your Life | 2022 首發／2026 更新 | 防孤立孤獨、促進身體活動、鼓勵健康飲食、定期回診（含用藥清單子項） |
| 提醒／陪伴層（補項目） | AGS Health in Aging Foundation | Ten Top Tips for Aging Well | 2019 | 飲食、防跌運動、節制飲酒、睡眠7-8hr、社交/心智活躍、用藥檢查、憂鬱/焦慮觀察、疫苗、老年醫學醫師 |
| ⚠️ 自訂、非協會標準 | — | 喝水、曬太陽 | — | 查無任何協會單獨列名，屬產品端自行加碼，文件裡要誠實標注 |

## 來源

- WHO ICOPE 官方頁：https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/ageing-and-health/integrated-care-for-older-people-icope
- WHO ICOPE Handbook 第2版 (2025)：https://www.who.int/publications/i/item/9789240103726
- NIA：https://www.nia.nih.gov/health/caregiving/healthy-aging-tips-older-adults-your-life
- AGS Health in Aging Foundation, "Ten Top Tips for Aging Well" (healthinaging.org, 2019)

## 現有 5 項清單對照 ICOPE 六項

| 現有項目 | ICOPE 對應 | 備註 |
|---|---|---|
| 心情 | ✅ 憂鬱症狀 | 直接對上 |
| 飲食 | 部分對上 → 營養不良 | ICOPE 更精準：非刻意掉體重≥3kg/3個月＋食慾差，不是泛用飲食品質 |
| 用藥 | ❌ 不是 ICOPE 核心六項 | 屬於 Step2 完整評估(CGA)才會碰，不是初篩項目 |
| 睡眠 | ❌ ICOPE 沒有獨立列名 | — |
| 疼痛 | ❌ 不是 ICOPE 核心六項 | 2023 WHO 追加模組才有，非六項篩檢本體 |

**現有清單完全缺、ICOPE 有的**：認知功能、行動能力／跌倒風險、視力、聽力——四個核心域現有清單完全沒碰。

## 對照 v2_mvp.md

現有 `v2_mvp.md §2 F2` 的五項（medication/sleep/diet/pain/mood）建議標注清楚：哪些有協會依據（心情、飲食部分）、哪些是產品端自訂（用藥/睡眠/疼痛，雖合理但非協會列名）、哪些完全沒做到（認知/跌倒/視力/聽力）。
