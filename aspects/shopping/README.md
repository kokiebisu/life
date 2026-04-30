# shopping

買いたいものリストと食材買い出し記録。衣類・雑貨・日用品は `stores/` で店舗別に管理し、食材は `groceries/` で日付別に管理する。

## Overview

「ユニクロでヒートテック買いたい」のような発言を検知すると、Web 検索で価格と商品ページを調べ、対応する `stores/<店舗>.md` と Notion ショッピング DB に追加される（カバー画像も自動セット）。食材買い出しは `/kondate` の不足食材検出から自動で `groceries/` に反映される。

## Examples

> 「無印で詰め替え用のシャンプー買いたい」

`stores/muji.md` に追記 → Notion ショッピング DB にレコード作成（商品画像をカバーに設定）。

> 「買い出し行く」

`/kondate` か `/calendar` 経由で 2〜3 日分の献立を組み、買い出しリストを Notion groceries DB に生成。

## What's here

```
stores/<店舗名>.md         衣類・雑貨・日用品のウィッシュリスト
groceries/YYYY-MM-DD.md    食材買い出し実績（Notion groceries DB と同期）
```

## Related

- Notion: ショッピング DB / 買い出し DB
- Skills: `/kondate` `/fridge-sync`
- Top-level: [../../README.md](../../README.md)
