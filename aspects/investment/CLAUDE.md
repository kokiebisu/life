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

## BUY 推奨を提示するときの厳守ルール

過去のインシデント（2026-05-22）: `/rebalance` が VRT $3,800 BUY を推奨し、私はそれをユーザーに提示するとき 3/6/12m リターンと 12m drawdown は出したが、**1 週間以内の価格変動を確認しなかった。実際は VRT は 1 週間で -14% 急落していて、cash の 40% を一括で投入する危険なタイミングだった。**

再発防止として、BUY / ADD 推奨を私の言葉でユーザーに伝えるときは:

### 1. 必ず 1w / 1m / 3m / 6m / 12m リターンを並べて見せる（厳守）

`/rebalance` の md report と JSON は 1w/1m を含む。**サマリで紹介するときも 5 タイムフレームすべて出す**こと。3/6/12m だけ出して 1w/1m を省略するのは禁止。

例:
```
VRT BUY $3,800 — 1w=-14% / 1m=-12% / 3m=+33% / 6m=+89% / 12m=+196% / drawdown=-14%
```

### 2. 1w が -10% 以下なら必ず警告を立てる（厳守）

短期急落銘柄を BUY 推奨する場合、**ユーザーに伝える前に**:
- 急落理由を news で確認する
- thesis が壊れていないことを確認する
- **tranche entry（分割エントリ）を推奨**するか **size 縮小**を提案する
- 「Wall Street がカバーしてるから大丈夫」と思考停止しない

### 3. 株価を確認するときは WebSearch を使わず yahoo-finance2 を使う（厳守）

**WebSearch の株価は1-2日前のキャッシュデータが混在する。** リアルタイム価格として断定してはいけない。

```bash
# 正しい株価確認コマンド（yahoo-finance2 でリアルタイム取得）
bun -e "
const yf = require('yahoo-finance2');
yf.default.quote(['MOD','ENTG','ACLS']).then(r =>
  r.forEach(q => console.log(q.symbol, '\$' + q.regularMarketPrice?.toFixed(2), '1w%:', ((q.regularMarketChangePercent ?? 0)*100).toFixed(1)+'%'))
).catch(console.error)"
```

**過去のインシデント（2026-05-27）:** ACLS の価格を WebSearch で調べて「$155（pullback中）」と報告したが、実際はユーザーの画面で $167 と表示されていた。WebSearch が1-2日前のデータを返していた。

### 4. アナリスト PT 引上げは大幅下落の直後なら「擁護反応」を疑う（厳守）

PT 引上げが価格モメンタムと逆方向（下落 + PT 上げ）の場合、analyst が holdings を守るための擁護的反応の可能性がある。単独シグナルとして扱わず、**何が起きた直後かを文脈化**する。

「分析家 4 社が同時に PT 引上げ」を見て自動的に good news と評価せず、「下落 → PT 引上げ」のシーケンスかを必ず確認する。

## メタトレンド投資フレーム（厳守）

中島聡氏のメタトレンド投資から着想を得て、`/rebalance` では単なる目標比率への復元ではなく、10 年単位の技術・社会構造変化に乗る銘柄を長期で評価する。

### 基本原則

- まず「どのメタトレンドに乗っているか」を言語化する。例: AI、半導体、電力インフラ、ロボティクス、バイオ、金融インフラ、開発者向けソフトウェア
- winner 候補は、短期的に上がっただけでは売らない。売却・縮小理由は「仮説崩壊」「過集中」「短期急落 + 悪材料」「より強い機会への資金移動」に限定する
- 逆に、テーマ性はあるが実需・収益化・競争優位が弱い銘柄は Edge Lottery として小さく扱う
- 各 thesis には「メタトレンド仮説」「牽引企業としての根拠」「仮説が壊れる条件」を含める
- Core 資産は従来どおり規律を持って管理し、メタトレンド枠は thesis review を優先する

## 3 層 Portfolio フレームワーク（厳守）

ユーザーの edge は **AI / Software / Tech ecosystem** にあり、time arbitrage (30 歳、長期 hold 可能) + 過去 -50% drawdown 耐性 proven。ただし single-theme concentration risk (AI bubble) を避けるため、以下の 3 層構造で運用する。

### 3 層構造

| 層 | 目標 % | 1 銘柄サイズ | 性質 | 銘柄数目安 | 例 |
|---|---|---|---|---|---|
| **1. Edge Core** | 35-40% | 5-10% each | edge 確実、高 conviction、長期 hold | 4-6 銘柄 | NVDA, MSFT, AMZN, GOOG, AAPL, CRWD |
| **2. Edge Lottery** | 10-15% | **max 3%** each | edge 拡張 + 化ける狙い、high variance | 5-7 銘柄 | mid-small cap AI/dev tools, AI infra, AI security pre-breakout |
| **Edge 合計 (1+2)** | **≤ 55-60%** | — | AI/Software ecosystem 全体 | 9-13 | — |
| 3. Diversifier Growth | 15-20% | 3-5% each | 非 AI 成長、AI 崩壊時 hedge、driver 異なる | 3-5 銘柄 | Healthcare growth (LLY, CI), biotech, Industrials |
| 4. Defensive Value | 10-15% | 3-5% each | recession hedge、value bias | 2-4 銘柄 | Banks (WFC), Staples (UL), SGOV |
| 5. Cash | 5-10% | — | dry powder | — | USD / CAD cash |

### 重要原則

- **Edge Core は厚く、Edge Lottery は薄く**。Lottery は失敗前提 (5-7 銘柄中 3-4 銘柄が -50% 想定)、1 銘柄 max 3% 厳守
- **GICS Tech sector cap (旧 40%) は廃止**。代わりに AI/Software ecosystem cap (≤ 55-60%) を使う。GICS だと AMZN (Consumer Cyclical) / META (Comm Services) / GOOG (Comm Services) が Tech 外に分類され、edge と一致しない
- **Edge Lottery 候補は first-hand engineering experience filter を通すこと**: 自分が使ってる product / tech stack で adoption pattern 見える / 面接で見える tech choice
- **化ける確率分布**: 10x = 5-10%、2-5x = 15-20%、横ばい = 20-30%、-50%+ = 40-50%。expected value positive だが high variance なので**小さく多数賭ける**

### 例: $55K portfolio での目安額

- Edge Core 37.5% = $20K (4-6 銘柄, 各 $3-5K)
- Edge Lottery 12.5% = $7K (5-7 銘柄, **各 $1-2K max**)
- Diversifier 17.5% = $10K (3-5 銘柄, 各 $2-3K)
- Defensive 12.5% = $7K (2-4 銘柄, 各 $2-3K)
- Cash 10% = $5K

### Edge 拡張の運用 habits

「edge は固定じゃなく拡張する」前提で、月次:

1. 1 earnings call/週 listen (Edge Lottery 候補)
2. 1 SaaS/AI tool/月 試用
3. 1 S-1 filing/月 読む (recent IPO)
4. 1 podcast/週 (Stratechery / Acquired / Invest Like the Best)
5. 面接先の tech stack を毎回記録

これで edge は 6 ヶ月で確実に拡大、Lottery 候補の質も上がる。

## /rebalance — Portfolio Rebalance（中長期レビュー）

> 仕様: [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../../docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md)

3 ヶ月おきの中長期レビューコマンド。保有銘柄 + cash を踏まえて Hold/Trim/Sell/Add と新規 Buy を提案する。

### 必要ファイル（すべて gitignored）

- `aspects/investment/portfolio.csv` — 保有銘柄（既存 spec）
- `aspects/investment/cash.csv` — 現金残高
  ```
  currency,amount,updated_on
  USD,5000,2026-05-21
  CAD,2000,2026-05-21
  ```
- `aspects/investment/candidates/*.json` — discovery skill 出力（任意、無くても可）

### Investor Profile

スクリプトは **30 歳・中長期・aggressive growth tilt** 前提でチューニング済み:

- Position sizing: 1 銘柄 ≤ 15% / セクター ≤ 40% / cash の 1 銘柄 ≤ 60%
- 直近ニュース最優先（PRIM 反省）
- 配当より成長率重視

### Notion DB（手作成必須）

- DB 名: **Portfolio Rebalance**
- env var: `NOTION_REBALANCE_DB`（`.env.local`）
- プロパティ:
  - 名前 (title)
  - 日付 (date)
  - 保有銘柄数 (number)
  - Cash USD (number)
  - Cash CAD (number)
  - 警告銘柄 (multi_select)
  - ステータス (select: 新規 / 実行済み / スキップ)

### 起動

```bash
bun run scripts/investment/rebalance.ts            # 本番
bun run scripts/investment/rebalance.ts --dry-run  # Notion 登録なし
bun run scripts/investment/rebalance.ts --only-sanity   # 暴落検出のみ
bun run scripts/investment/rebalance.ts --only-holdings # 保有判定のみ
```

Skill 経由: `/rebalance`

## /discover-growth — Growth 候補発掘（pluggable discovery skill）

> 仕様: [scripts/investment/discover-growth.ts](../../scripts/investment/discover-growth.ts) / [skills/discover-growth/SKILL.md](../../skills/discover-growth/SKILL.md)

ニュース起点で新規 growth 銘柄候補を発掘し、`/rebalance` の次回実行で取り込まれる JSON を生成する。

### パイプライン

1. `portfolio.csv` を読んで保有銘柄を除外リストにセット
2. RSS ニュース取得（既存 fetch-news 再利用）
3. **Claude pick**: news から growth 候補を 12 個ピック（保有除外、テーマ性 + カタリスト基準）
4. yahoo-finance2 でファンダ + 価格履歴 + per-ticker ニュース取得
5. sanity-check で暴落銘柄を picked から除外
6. **Claude evaluate**: 5 銘柄に絞り込み、confidence High/Med のみ採用
7. `aspects/investment/candidates/<YYYY-MM-DD>-growth.json` に出力

### 起動

```bash
bun run scripts/investment/discover-growth.ts            # 本番（JSON 出力）
bun run scripts/investment/discover-growth.ts --dry-run  # stdout のみ
bun run scripts/investment/discover-growth.ts --n 8      # 採用数指定（default 5）
```

Skill 経由: `/discover-growth`

### 連携

- 出力 JSON は 14 日以内のものを `/rebalance` の `loadCandidates()` が自動取り込み
- 古い JSON はゴミなので手動削除推奨（または GitHub Actions で定期掃除）

## /discover-value — Value 候補発掘（pluggable discovery skill）

> 仕様: [scripts/investment/discover-value.ts](../../scripts/investment/discover-value.ts) / [skills/discover-value/SKILL.md](../../skills/discover-value/SKILL.md)

discover-growth の value 版。割安かつクオリティのある銘柄を発掘し、`/rebalance` の次回実行で取り込まれる JSON を生成する。

### discover-growth との使い分け

| | discover-growth | discover-value |
|---|---|---|
| 主軸 | カタリスト・モメンタム・売上成長率 | 割安性 (PER/PBR/FCF yield/配当) |
| Tech | 主戦場 | 避けるか少数 |
| セクター傾向 | AI/semis/宇宙等 | 消費財・金融・ヘルスケア・産業財・公益等 |

### 起動

```bash
bun run scripts/investment/discover-value.ts            # 本番（JSON 出力）
bun run scripts/investment/discover-value.ts --dry-run  # stdout のみ
bun run scripts/investment/discover-value.ts --n 8      # 採用数指定（default 5）
```

Skill 経由: `/discover-value`

### バリュートラップ対策

FCF マイナス・売上縮小・D/E 400 超・配当カット・earnings miss・drawdown -25% 超 などを自動除外。

## Phase 2 アイデア（MVP 外）

- GitHub Actions cron 化（毎朝 JST 06:00）
- 過去レポートの当落追跡（1ヶ月後・3ヶ月後・1年後の株価チェック）
- 複数テーマ対応（1日 3 テーマ）
- 仮想通貨評価軸（NVT, 開発活動 等）
- `/investment` スキル（「最近の投資ヒント見せて」）
