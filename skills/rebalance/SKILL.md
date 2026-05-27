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

## メタトレンド判断軸

`/rebalance` は単なる目標比率への復元ではなく、メタトレンド仮説のレビューとして扱う。

- 各保有銘柄について「どの 10 年級メタトレンドに乗るか」を確認する
- winner 候補は、含み益が大きいだけでは売らない
- 売却・縮小理由は、仮説崩壊、過集中、短期急落 + 悪材料、より強い機会への資金移動に限定する
- 新規 BUY / ADD は、メタトレンド仮説、牽引企業としての根拠、仮説が壊れる条件を明記する
- テーマ性だけで実需・収益化が弱い候補は、見送りまたは Edge Lottery の小サイズに制限する

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
3. **各 BUY/ADD に「未来予想図」を必ず添える（厳守）**
   - 「なぜこれから上がるか」を 2-3 文で語る（シナリオ・トリガーを明示）
   - 数字の羅列だけで終わらない。「いつ・何が起きたとき・どう再評価されるか」まで語る
   - 例: 「2027年にTSMCのN2量産が本格化した瞬間、工程数増加 → RF電源需要増 → AEISへの連想が広がる」
4. Cash Allocation の最終形（金額を明記）
5. 「実際に発注しますか？」とは聞かない（ユーザーが Wealthsimple で手動発注する）

### ⚠️ BUY/ADD をユーザーに提示する前に必ず通すフィルタ（厳守）

**① バケット充足チェック（最優先）**

現在の保有をざっくり分類して不足バケットを特定する：

| バケット | 目標 | 不足なら優先度 |
|---------|------|--------------|
| Edge Core（NVDA/MSFT/AMZN/GOOG 等 mega-cap） | 35-40% | 中（ADD で対応） |
| Edge Lottery（mid/small-cap pre-breakout） | 10-15% | 中 |
| **Diversifier Growth**（非 AI 成長株） | **15-20%** | **高（Cash を優先投下）** |
| **Defensive Value**（配当・バリュー） | **10-15%** | **高（Cash を優先投下）** |
| Cash | 5-10% | — |

Diversifier/Defensive が不足しているのに Edge をさらに積むのは誤り。

**② マクロ文脈（Cash 保持水準）**

Cash を「多すぎ＝悪」と自動判定しない。以下が重なる場合は Cash 20-30% 維持を推奨する：
- 主要保有銘柄の 3m リターンが複数 +80% 超（市場過熱）
- BUY 候補の大半が 1m+50% 超（モメンタム追い）
- Fed/マクロ不確実性が高い

**③ BUY 品質フィルタ**

1. **新規 BUY は最大 3 件**。超える場合は confidence 高い順に絞り、残りは「次回候補」と明記
2. **テーマ重複禁止**：同一メタトレンドに複数の新規 BUY は 1 銘柄に絞る
3. **ポジション総数**：現保有 + 新規 BUY が 20 超なら絞る
4. **Thesis 品質**：「なぜこの会社が勝つか（競合でなくこの会社の理由）」と「仮説崩壊条件」が明示されているか確認
5. **データ品質**：ニュースリンクの企業名が ticker と一致しているか確認（ミスマッチは除外）

## 新規候補の取り込み

`aspects/investment/candidates/` に discovery skill の出力（`YYYY-MM-DD-<strategy>.json`）があれば自動で取り込まれる。14 日以上前のファイルは無視される。

discovery skill は別途実装予定（`/discover-growth` 等）。MVP 時点では存在しない。

## 関連 spec

- 設計: [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../../docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md)
- 実装プラン: [docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md](../../docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md)
