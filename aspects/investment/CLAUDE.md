# Investment — 毎朝レポート型 投資ヒント生成

> 1年スパンのバリュー寄り銘柄を、ニュース起点で連想・抽出するアプリ。

## 概要

毎朝、主要なニュース（株・経済）を取得して、**長期テーマ + バリュー指標** で 3〜5 銘柄をピックアップし、Notion DB「投資ヒント」に登録する。

- 時間軸: **1年スパン**（短期事象ではなく構造的トレンド）
- 評価軸: **バリュー指標**（PER / PBR / ROE / FCF yield / 配当利回り / 負債比率 / 時価総額）
- データ: `yahoo-finance2`（npm）で財務指標を実数取得 → Claude にバリュー評価させる
- 仮想通貨: MVP では対象外（関連株は OK）

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
6. **register-notion** — Notion DB「投資ヒント」に 1 ページ作成、本文に分析を書く

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
