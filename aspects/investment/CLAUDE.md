# Investment — 毎朝レポート型 投資ヒント生成

> 1年スパンのバリュー寄り銘柄を、ニュース起点で連想・抽出するアプリ。

## 概要

毎朝、主要なニュース（株・経済）を取得して、**長期テーマ + バリュー指標** で 3〜5 銘柄をピックアップし、Notion DB「投資ヒント」に登録する。

- 時間軸: **1年スパン**（短期事象ではなく構造的トレンド）
- 評価軸: **バリュー指標**（PER / PBR / ROE / FCF yield / 配当利回り / 負債比率 / 時価総額）
- データ: `yahoo-finance2`（npm）で財務指標を実数取得 → Claude にバリュー評価させる
- **対象市場: 米国株のみ**（NYSE / Nasdaq）。日本株・他国は当面対象外
- 仮想通貨: MVP では対象外（米国上場関連株 COIN / MARA 等は OK）

## 起動

```bash
# レポート生成 + Notion 登録
bun run scripts/investment/daily-report.ts

# Notion 書き込みなし、stdout で内容確認
bun run scripts/investment/daily-report.ts --dry-run

# 任意日付で再生成（debug 用）
bun run scripts/investment/daily-report.ts --date 2026-05-12
```

## フロー

1. **fetch-news** — `aspects/investment/feeds.json` の RSS を並列取得（過去 24h）
2. **select-theme** — Claude が 1 つの長期テーマを選ぶ
3. **pick-candidates** — テーマに沿う銘柄候補 8〜15 個（ticker のみ）
4. **fetch-fundamentals** — yahoo-finance2 で各候補の財務指標
5. **evaluate-value** — Claude が実データを見てバリュー基準で 3〜5 に絞る + 1年 thesis + バリュートラップ警告
6. **sanity-check** — yahoo-finance2 で直近 180 日の価格・出来高を取得し、異常値（drawdown / 急落 / 異常出来高）を検出 → 該当銘柄に警告フラグを付ける
7. **register-notion** — Notion DB「投資ヒント」に 1 ページ作成、本文に分析を書く（警告があればトップとカード両方に 🚨 callout）

## サニティチェック（厳守）

**Claude のナレッジは数日〜数週間の遅延がある。** トレーニングカットオフ後の earnings イベント・ガイダンス下方修正・粉飾発覚等で大暴落した銘柄を、`fetch-fundamentals` のスナップショット指標だけで「割安」と判定するリスクがある。

これを防ぐため、`sanity-check.ts` が以下の **いずれか** に該当する銘柄に警告を付ける:

| 指標 | 閾値 | 意味 |
|---|---|---|
| 180日高値からの drawdown | ≤ -25% | 持続的な悪材料が出ている可能性 |
| 直近 5 営業日の変化率 | ≤ -15% | 直近で重大ニュースが出た |
| 直近 22 営業日（30 日）の変化率 | ≤ -20% | 1 ヶ月単位での失速 |
| 直近 30 日の最大出来高 / 30 日平均 | ≥ 5× | earnings 当日や重大ニュース日が直近にある |

**警告が出た銘柄について Claude / 私が必ずやること:**

1. WebSearch で「`<ticker> stock crash <推定発生月>`」「`<ticker> earnings miss`」を検索し、原因を特定
2. その原因が thesis を壊すか（recovery 可能か）を判断
3. 採用継続なら、thesis に「直近の暴落要因 + なぜそれでもバリューと見るか」を明記。**美しい thesis ほど直近の悪材料を見落としている可能性が高い**ことを忘れない
4. 判断不能なら、その銘柄は除外して別候補に差し替える

**反省（2026-05-12）**: PRIM (Primoris Services) を「bullish バリュー候補」としてピックしたが、6 日前（5/6）に earnings miss + ガイダンス -17% 下方修正で -50% クラッシュしていた。私が出した「forward PER 19 倍は割安」根拠は暴落前のスナップショットで、ガイダンス改定後は実質 forward PER 23 倍。ユーザーに指摘されるまで気づかなかった。サニティチェックはこの再発防止策。

## Notion DB

- DB 名: **投資ヒント**
- env var: `NOTION_INVESTMENT_DB`（`.env.local`）
- スキーマ（手作成）: 名前(title) / 日付(date) / カテゴリ(select: 株 / 仮想通貨セクター / その他) / 銘柄(multi_select) / ソース(url) / ステータス(select: 新規 / 確認済み / ウォッチ中)

## ファイル

```
aspects/investment/
├── CLAUDE.md     # この仕様
└── feeds.json    # RSS フィードソース定義

scripts/investment/
├── daily-report.ts        # オーケストレーター
├── fetch-news.ts          # RSS 取得
├── select-theme.ts        # ニュース → 1テーマ
├── pick-candidates.ts     # テーマ → 銘柄候補
├── fetch-fundamentals.ts  # yahoo-finance2 で財務指標
├── evaluate-value.ts      # バリュー評価 + 3-5 銘柄に絞る
├── sanity-check.ts        # 直近の異常な値動きを検出（drawdown / 急落 / 異常出来高）
├── register-notion.ts     # Notion 登録
└── types.ts               # 型定義
```

## 重要免責

**このアプリは投資助言ではない。** Claude が生成する内容は教育目的の「連想練習」であり、最終的な投資判断はユーザー本人が公式 IR / Yahoo!ファイナンス / 証券会社の分析で確認した上で行う。

- Claude が出すバリュー指標は yahoo-finance2 の遅延データ。リアルタイムではない
- ティッカー・企業名に誤りがある可能性があるので登録後の目視確認推奨
- 「買え」「売れ」のような断定的トーンは出力に含めない方針（プロンプトで禁止）

## Phase 2 アイデア（MVP 外）

- GitHub Actions cron 化（毎朝 JST 06:00）
- 過去レポートの当落追跡（1ヶ月後・3ヶ月後・1年後の株価チェック）
- 複数テーマ対応（1日 3 テーマ）
- 仮想通貨評価軸（NVT, 開発活動 等）
- `/investment` スキル（「最近の投資ヒント見せて」）
