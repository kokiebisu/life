---
name: rebalance
description: 保有 portfolio + cash を踏まえて Hold/Trim/Sell/Add と新規 Buy を提案するとき。3 ヶ月おきの中長期レビューに使う。「rebalance したい」「ポートフォリオ見直したい」「cash どう使う」などに使う。
---

# rebalance — Portfolio Rebalance

## いつ使う

- 3 ヶ月おきの中長期 portfolio レビュー
- 「rebalance したい」「ポートフォリオ見直したい」
- 「cash どう使う」「何を売って何を買う」

## 事前確認（必須）

1. `aspects/investment/portfolio.csv` が存在するか確認
   - 無ければ `docs/superpowers/specs/2026-05-21-investment-portfolio-csv-design.md` を見せて作成を促す
2. `aspects/investment/cash.csv` が存在するか確認
   - 無ければサンプル schema を出して作成を促す
3. `cash.csv` の `updated_on` を確認
   - 30 日以上前なら「Wealthsimple を見て cash 残高を更新しますか？」と聞く

## 実行

```bash
# dry-run でまず確認
bun run scripts/investment/rebalance.ts --dry-run

# 問題なければ本番（md 保存 + Notion 登録）
bun run scripts/investment/rebalance.ts
```

## 出力

- `aspects/investment/reports/YYYY-MM-DD-rebalance.md`（gitignored）
- Notion DB「Portfolio Rebalance」に 1 ページ

## 結果のレビュー

実行後、以下をユーザーに確認:

1. sanity-check 警告銘柄があれば、最初に伝える（🚨 ticker）
2. 推奨 actions の Summary（BUY n / ADD n / HOLD n / TRIM n / SELL n）
3. Cash Allocation の最終形
4. 「実際に発注しますか？」とは聞かない（ユーザーが Wealthsimple で手動発注する）

## 新規候補の取り込み

`aspects/investment/candidates/` に discovery skill の出力（`YYYY-MM-DD-<strategy>.json`）があれば自動で取り込まれる。14 日以上前のファイルは無視される。

discovery skill は別途実装予定（`/discover-growth` 等）。MVP 時点では存在しない。

## 関連 spec

- 設計: [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../../docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md)
- 実装プラン: [docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md](../../docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md)
