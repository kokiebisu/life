# Investment Portfolio CSV — Design

> Wealthsimple の保有銘柄スナップショットを手元の CSV で管理する。

## Goal

Wealthsimple（TFSA / RRSP / Non-Registered / FHSA）で保有している米国株・カナダ株のポートフォリオを、手元の CSV ファイルでスナップショット管理する。Claude が会話ベースで読み書きできるよう構造化する。

## Non-Goals

- 取引履歴の追跡（買い増し・売却の都度の transactions ログ）は持たない
- 現在価格・評価損益の自動計算（必要なときに別途 yahoo-finance2 で叩く）
- Wealthsimple Cash / Crypto の追跡（株式のみ）
- 加重平均取得単価の Claude 側での再計算（Wealthsimple UI の Average Price をそのまま転記）

## File

- **Path:** `aspects/investment/portfolio.csv`
- **Git:** `.gitignore` に追加（資産情報のため未コミット）
- **Format:** ヘッダ行ありの標準 CSV（カンマ区切り、UTF-8）

## Schema

```
ticker,quantity,avg_cost,currency,account,acquired_on,note
```

| 列            | 型     | 例                | 説明                                                       |
| ------------- | ------ | ----------------- | ---------------------------------------------------------- |
| `ticker`      | string | `AAPL`            | NYSE / Nasdaq / TSX の銘柄コード                           |
| `quantity`    | number | `7.0031`          | 保有株数（小数 OK、Wealthsimple は端株可）                 |
| `avg_cost`    | number | `271.07`          | Wealthsimple 表示の Average Price をそのまま               |
| `currency`    | string | `USD`             | `USD` / `CAD`                                              |
| `account`     | string | `TFSA`            | `TFSA` / `RRSP` / `Non-Registered` / `FHSA`                |
| `acquired_on` | date   | `2026-05-21`      | この行を最後に更新した日（YYYY-MM-DD）                     |
| `note`        | string | `dividend stock`  | 任意メモ                                                   |

### 行のルール

- **1 行 = 1 銘柄 × 1 口座**。同じ AAPL でも TFSA と Non-Registered で持っていれば 2 行
- 完全売却したら行ごと削除
- 一部売却・買い増しは Wealthsimple の新しい Average Price で `avg_cost` を上書き

## Update Workflow

ユーザーが Claude に話して CSV を編集する。専用スクリプトは作らない。

| ユーザー発言例                                      | Claude の動作                                          |
| ---------------------------------------------------- | ------------------------------------------------------ |
| 「AAPL 7.0031株 @ $271.07 TFSA に追加」              | 1 行 append                                            |
| 「AMZN 売却した」                                    | 該当行を削除                                           |
| 「AAPL の Average Price が $280 になった」           | 該当行の `avg_cost` と `acquired_on` を更新            |
| 「ポートフォリオ見せて」                             | CSV を読んで markdown テーブルで表示                   |
| 「TFSA の合計 book cost いくら？」                   | CSV 読んで `quantity * avg_cost` を口座別に集計        |

## Initial Data（screenshot より）

| ticker | quantity | avg_cost | currency | account | acquired_on |
| ------ | -------- | -------- | -------- | ------- | ----------- |
| AAPL   | 7.0031   | 271.07   | USD      | TFSA    | 2026-05-21  |
| AMZN   | 19       | 234.16   | USD      | TFSA    | 2026-05-21  |

## Out of Scope（将来の検討）

- **Daily-report 連携:** `aspects/investment/` の毎朝レポートが保有銘柄を avoid / overlap 判定に使う
- **評価損益サマリ:** yahoo-finance2 で現在価格を取って `--summary` で P&L 表示するスクリプト
- **配当履歴:** 別 CSV（`dividends.csv`）で分配金記録
- **税年度集計:** TFSA は非課税だが Non-Registered は capital gains 計算が必要

## Rationale

**なぜスナップショット型？** トランザクションログ式は記録漏れすると整合性が壊れる。Wealthsimple 自体が source of truth なので、Wealthsimple の Average Price を「写すだけ」のほうが堅牢。

**なぜ gitignore？** 保有銘柄・金額は財務情報。リポジトリは個人用だが life-os への漏洩リスクも考えて未コミット。`.ai/rules/profile.md` で財務詳細は `memory/career-private.md` に置く方針があり、それに準じる。

**なぜ CSV？** 1 行 1 銘柄の表形式。Claude が grep / awk / python で集計しやすく、tabular editor / spreadsheet でも開ける。md table だと行追加の差分が見づらい。
