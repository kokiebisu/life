# diet

減量・健康管理。献立計画、買い出し、食事ログ、体組成のトラッキングを担う aspect。

## Overview

`fridge.md`（冷蔵庫在庫）と `pantry.md`（常備調味料）を起点に、`/kondate` が在庫ベースで献立を提案する。`/meal` で食事を記録すると Notion meals DB と daily ログが同時に更新され、在庫が自動減算される。買い出しリストは献立から逆算して生成される（`scripts/notion/notion-grocery-gen.ts`）。

## AI ペルソナ

`team/` 配下に 6 人の専門家プロフィール。

- 管理栄養士 — 食事プラン・栄養指導
- パーソナルトレーナー — 運動・フィットネス
- 行動心理学者 — マインドセット・習慣
- アカウンタビリティパートナー — 進捗管理
- 料理コーチ — レシピ・調理法
- 肥満医療専門医 — 健康指標・安全性

## What's here

```
daily/YYYY-MM-DD.md     1 日ごとの献立（Notion meals DB と完全同期）
weekly/YYYY-MM-DD.md    週次の振り返り・在庫メモ
fridge.md               冷蔵庫の在庫（イベント駆動で減算）
pantry.md               常備調味料リスト
expenses.md             月次食費記録
aoba-prices.csv         スーパーの価格データベース
team/                   AI ペルソナ定義
```

## Related

- Notion: 食事 DB / 買い出し DB
- Skills: `/kondate` `/meal` `/fridge-sync` `/ask-diet`
- Top-level: [../../README.md](../../README.md)
