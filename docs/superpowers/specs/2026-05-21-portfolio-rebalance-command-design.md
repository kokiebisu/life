# Portfolio Rebalance Command — Design

> 保有 portfolio + 現金残高をインプットに、Hold / Trim / Sell / Add の判定と新規 Buy 候補の取り込み・cash 配分まで一気通貫で出す中長期レビューコマンド。

## Context

- 2026-05-21 に `aspects/investment/portfolio.csv`（Wealthsimple スナップショット型）の設計が確定（[2026-05-21-investment-portfolio-csv-design.md](./2026-05-21-investment-portfolio-csv-design.md)）。これで保有銘柄を CSV に持てるようになった。
- 既存の `scripts/investment/daily-report.ts` は **ニュース起点で新規バリュー候補を 3〜5 個 Notion に投げる** MVP。portfolio を見ない。
- 求めているのは「中長期（3 ヶ月に 1 度くらい確認するペース）で、自分の portfolio と現金を見て、何を売って何を買うか」を一気通貫で出すコマンド。これが daily-report と役割が違うので別コマンドとして新設する。
- スタンスは中長期。日次トレードのためではなく、ポートフォリオ全体の健全性チェックと cash の置き場決め。
- 新規銘柄の発掘は将来的に複数戦略（grow / value / momentum 等）を持ちたいので、`/rebalance` 本体には組み込まず、別 skill として拡張可能にしておく。

## Goal

`/rebalance` 1 発で:

1. portfolio.csv の全保有銘柄に対して **Hold / Trim / Sell / Add** の action label と thesis + confidence + 出典ソースを出す
2. **直近のニュース・sentiment を最優先軸** に評価する。ファンダメンタル / テクニカルはサポート
3. 直近の暴落・earnings miss 等の sanity-check を全保有銘柄に当てる
4. 別 skill が事前に生成した「新規候補ファイル」があれば取り込んで Buy 候補としてマージ
5. cash.csv の現金残高を **積極投資向け position sizing ルール**（後述）に従って Buy / Add に割り振り、銘柄ごとに推奨 `$ amount` を提示
6. `aspects/investment/reports/YYYY-MM-DD-rebalance.md` に保存 + Notion DB に登録

## Investor Profile（スタンス明示）

このコマンドは **30 歳・長期投資・積極的なグロース志向** のユーザー向けにチューニングする。

- リスク許容度: **高**（横ばい配当株より成長株を優先）
- 時間軸: **中長期**（3 ヶ月〜数年）
- バイアス: **growth tilt**（売上成長率・カタリスト・テーマ性を重視。バリュー指標は下値リスクのスクリーニング用）
- 集中度: **やや集中許容**（1 銘柄 max 15%、確信のある銘柄には大きく賭けてよい）
- 配当志向: 弱い（再投資のための成長 > 配当インカム）

Claude の `evaluate-holdings` / `allocate-cash` プロンプトでこの profile を明示し、保守的な分散重視の提案を避けさせる。

## Non-Goals

- 自動実行（cron / GitHub Actions）はやらない。on-demand 専用
- 新規銘柄の **発掘ロジック自体** は `/rebalance` に含めない（別 skill）
- 約定処理（Wealthsimple API 連携）はやらない。提案を出すだけ、発注は人間
- 取引履歴（transactions ログ）の保持
- リアルタイム価格。yahoo-finance2 の遅延データで十分
- 税最適化（capital gains harvesting 等）— Phase 2 以降

## Inputs

| 入力 | ソース | 必須 |
|---|---|---|
| 保有銘柄 | `aspects/investment/portfolio.csv` | ✅ |
| 現金残高 | `aspects/investment/cash.csv`（schema: `currency,amount,updated_on`、複数通貨可） | ✅ |
| 新規候補 | `aspects/investment/candidates/*.json`（別 skill が事前生成。無くても OK） | ❌ |
| financial data | yahoo-finance2 経由で各 ticker の財務 + 180 日価格を fetch | ✅ |
| news / sentiment | `aspects/investment/feeds.json` の RSS + WebSearch で `<ticker> news` | ✅ |

### cash.csv schema

```
currency,amount,updated_on
USD,5000,2026-05-21
CAD,2000,2026-05-21
```

- `aspects/investment/cash.csv` に置く（**gitignored**）
- Wealthsimple を見て手で書き換える運用。`--cash` 引数は廃止
- `updated_on` が **30 日以上前** なら warning を出す（古い残高で配分しないため）

## Pipeline（Approach B: 7 段）

```
1. load-context         (deterministic)  portfolio.csv + cash.csv + candidates/*.json を読み込む
2. fetch-news           (deterministic)  全 ticker について直近 30 日のニュースを RSS + WebSearch で取得
3. fetch-data           (deterministic)  全 ticker（保有 + 候補）について fundamentals + 180 日価格 を並列取得
4. sanity-check         (deterministic)  全 ticker に drawdown / 急落 / 異常出来高チェックを当てる（既存ロジック流用）
5. evaluate-holdings    (Claude)         ニュース最優先で各保有銘柄を Hold / Trim / Sell / Add 判定 + thesis + ソース URL + confidence
6. allocate-cash        (Claude)         cash を Add + Buy 候補に position sizing ルールで配分、$ amount + confidence + thesis + ソース URL を付与
7. write-report         (deterministic)  md 生成 + Notion 登録
```

### 分析軸の優先順位

`evaluate-holdings` / `allocate-cash` プロンプトで Claude に明示する評価順序:

1. **直近のニュース・sentiment（最優先）** — 過去 30 日の earnings、ガイダンス、重大な発表、規制、訴訟、insider 取引、アナリスト評価変更。**カタリストの有無が判定の主軸**
2. **テクニカル / 価格モメンタム** — 3/6/12 ヶ月リターン、SMA との位置関係、drawdown。「カタリストはあるか、価格が確認しているか」
3. **ファンダメンタル** — 売上成長率を最重視（PER は **下値リスクのスクリーニング** に使う、低 PER ≠ 買いではない）
4. **portfolio 全体の健全性** — セクター偏り、currency 分散。aggressive profile 前提で多少の偏りは許容

ニュースで強い悪材料（earnings miss + ガイダンス下方修正 / 訴訟 / 規制ショック）が出ている銘柄は、ファンダが割安でも **SELL / TRIM を優先**する（PRIM 反省）。逆に強いカタリストが直近で出た銘柄は、高 PER でも **BUY / ADD** を許容する。

各段は独立スクリプトで `daily-report.ts` 同様にオーケストレーターから呼ぶ。`--only-<stage>` で個別実行可能（debug 用）。

### なぜパイプライン分割

- 既存 `scripts/investment/` の資産（`fetch-fundamentals.ts` / `sanity-check.ts` / `fetch-news.ts` / `util-json.ts`）をそのまま再利用できる
- 保有評価と新規候補評価で Claude の判断軸が違うので、混ぜると質が落ちる（PRIM 反省）
- 各段で fail しても再実行可能（fundamentals の取得は重いので cache する）

## Position Sizing ルール（積極投資向け）

`allocate-cash` 段で Claude に守らせる制約（プロンプトに明記）。Investor Profile に合わせて aggressive 寄りに設定:

| ルール | 値 | 理由 |
|---|---|---|
| 1 銘柄あたりの portfolio 占有率 | ≤ **15%** | 集中許容するが破滅回避 |
| 1 セクターあたりの占有率 | ≤ **40%** | growth 投資はテック偏重になりがちなので緩和 |
| 現金残高に対する 1 銘柄の配分 | ≤ **60%** | 確信の高い 1 銘柄に厚く張れる |
| confidence Low の銘柄 | 配分しない | 確信が弱いものに大きく賭けない |
| currency マッチ | portfolio.csv の `currency` 列で判定。USD cash は `currency=USD` 銘柄に、CAD cash は `currency=CAD` 銘柄に配分 | FX コストの考慮なし（簡略化） |
| cash の残し率 | 0% でも OK | 「現金温存」は積極スタンスと矛盾するので強制しない。ただし confidence High の候補が無ければ残してよい |

ルールに違反する候補が出てきたら Claude は **配分せず thesis に「制約違反のため見送り」と書く**。

## 出力フォーマット（md report）

各 thesis には **必ず根拠の中身とソース URL** を併記する。ソース無しの thesis は不可（プロンプトで強制）。

```markdown
# Portfolio Rebalance — 2026-05-21

> ⚠️ これは投資助言ではありません。最終的な投資判断はユーザー本人が公式 IR / 証券会社の分析で確認した上で行ってください。
> Investor Profile: 30 歳 / 中長期 / aggressive growth

## Summary
- 保有銘柄: 12（うち sanity-check 警告: 2）
- Cash: $5,000 USD / $2,000 CAD（cash.csv: 2026-05-19 更新）
- 推奨 actions: BUY 2 / ADD 3 / HOLD 5 / TRIM 1 / SELL 1

## Portfolio Health
- セクター偏り: Tech 42%（aggressive profile では許容範囲）
- Currency: USD 78% / CAD 22%
- 口座分散: TFSA 60% / Non-Reg 30% / RRSP 10%

## Holdings Review

### NVDA — TRIM（Confidence: Med）
- **Qty:** 5 / **Avg Cost:** $480 / **Account:** TFSA
- **直近ニュース（30日）:**
  - 2026-05-15: Q1 earnings beat、ガイダンス上方修正（[source](https://...)）
  - 2026-05-10: データセンター需要鈍化観測（[source](https://...)）
- **テクニカル:** 6ヶ月リターン +85%、SMA200 から +60% 乘り（過熱気味）
- **ファンダ:** 売上成長率 YoY +45%、forward PER 38（成長率は裏付けるが高評価）
- **Thesis:** ガイダンスは強いが、株価が急騰し過ぎ。利確して cash 化、押し目で再エントリ候補。Hold ではなく Trim 推奨理由は「セクター集中度を一時的に下げる」
- **Sources:** [Q1 earnings](https://...), [analyst notes](https://...)

### PRIM — SELL（Confidence: High）
- **Qty:** 10 / **Avg Cost:** $32 / **Account:** Non-Reg
- **🚨 sanity-check:** 180日 -50% drawdown / 直近5日 -22%
- **直近ニュース:** 2026-05-06 earnings miss + ガイダンス -17%（[source](https://...)）
- **Thesis:** 構造的な需要鈍化、recovery 不透明。loss harvesting で売却（Non-Reg なので tax loss 利用可）
- **Sources:** [earnings release](https://...), [news article](https://...)

（以下、全保有銘柄について同形式で）

## New Buy Candidates（candidates/*.json から）

### TSM — BUY $1,200（Confidence: High）
- **Source skill:** discover-growth (2026-05-20 生成)
- **直近ニュース:** AI 半導体需要の継続、3nm 生産量増加、Apple/NVIDIA 受注拡大（[source](https://...)）
- **テクニカル:** 12ヶ月リターン +45%、SMA50 上抜け中
- **ファンダ:** 売上成長率 YoY +28%、ファウンドリ寡占
- **Thesis:** AI 半導体テーマの中核。NVDA を Trim して資金を回す対象として最適
- **Sources:** [Q1 報告](https://...), [WSJ article](https://...)

## Cash Allocation
- USD $5,000 → BUY TSM $1,200 / ADD AAPL $800 / ADD MSFT $1,500 / 残 $1,500（次回機会用）
- CAD $2,000 → 配分なし（候補なし、次回まで保持）
```

### 出力に必須の要素

| 要素 | 必須 |
|---|---|
| Action label（BUY/ADD/HOLD/TRIM/SELL） | ✅ |
| Confidence（High/Med/Low） | ✅ |
| 直近ニュース 1〜3 件（日付付き） | ✅ |
| テクニカル指標（モメンタム + drawdown） | ✅ |
| ファンダ指標（成長率 + PER 等） | ✅ |
| Thesis（なぜその action か、根拠の中身） | ✅ |
| Sources（少なくとも 1 件の URL） | ✅ |
| 🚨 sanity-check 警告（該当時） | ✅ |

## Notion 連携

- 既存 DB「投資ヒント」とは **別 DB** を新設する: **`Portfolio Rebalance`**
- env var: `NOTION_REBALANCE_DB`（`.env.local`）
- スキーマ（手作成）:
  - 名前 (title) — `Rebalance YYYY-MM-DD`
  - 日付 (date)
  - 保有銘柄数 (number)
  - Cash USD (number) / Cash CAD (number)
  - 警告銘柄 (multi_select)
  - ステータス (select: 新規 / 実行済み / スキップ)
- ページ本文に上記 md report をそのまま貼る

## 新規候補の Pluggable Interface（別 skill 用）

`/rebalance` が読む候補ファイルの仕様:

- **Path:** `aspects/investment/candidates/YYYY-MM-DD-<strategy>.json`
- **TTL:** 14 日以内のファイルのみ読む（古い候補は無視）
- **Schema:**
  ```json
  {
    "generated_at": "2026-05-21T09:00:00+09:00",
    "strategy": "growth",
    "candidates": [
      {
        "ticker": "TSM",
        "thesis": "AI 半導体需要の中長期トレンド、ファウンドリ寡占、3nm 量産が NVIDIA / Apple 受注拡大に直結",
        "confidence": "High",
        "recent_news": [
          {"date": "2026-05-18", "headline": "TSMC raises 2026 capex guidance", "url": "https://..."}
        ],
        "sources": ["https://wsj.com/...", "https://yahoo.com/finance/TSM"]
      }
    ]
  }
  ```

`recent_news` と `sources` はそのまま rebalance report に転載される。discovery skill 側でしっかり調べておくこと。

将来の skill（例: `/discover-growth`, `/discover-value`, `/discover-momentum`）はこの形式で出力すれば `/rebalance` に自動で取り込まれる。

**MVP では discovery skill は作らない。** `/rebalance` は候補ファイルが無くても動く（holdings review + 既存銘柄への buy 増しのみ）。

## ファイル構造

```
scripts/investment/
├── daily-report.ts             # 既存（触らない）
├── rebalance.ts                # ★ 新規: オーケストレーター
├── load-context.ts             # ★ 新規: portfolio.csv + cash + candidates 読み込み
├── evaluate-holdings.ts        # ★ 新規: 保有銘柄を Claude で判定
├── allocate-cash.ts            # ★ 新規: cash 配分を Claude で決定
├── write-rebalance-report.ts   # ★ 新規: md 生成
├── register-rebalance-notion.ts # ★ 新規: Notion 登録
├── fetch-news.ts               # 既存（再利用）
├── fetch-fundamentals.ts       # 既存（再利用）
├── sanity-check.ts             # 既存（再利用、保有銘柄にも当てる）
├── pick-candidates.ts          # 既存（discovery skill 用、/rebalance では使わない）
├── evaluate-value.ts           # 既存（discovery skill 用）
├── select-theme.ts             # 既存（discovery skill 用）
├── register-notion.ts          # 既存（daily-report 用）
├── types.ts                    # 既存（型追加で対応）
└── util-json.ts                # 既存

aspects/investment/
├── CLAUDE.md                   # 既存（rebalance 仕様を追記）
├── feeds.json                  # 既存
├── portfolio.csv               # 既存（gitignored）
├── cash.csv                    # ★ 新規（gitignored）
├── candidates/                 # ★ 新規（gitignored）
│   └── .gitkeep
└── reports/
    ├── 2026-05-12.md           # 既存（daily-report 出力）
    └── 2026-05-21-rebalance.md # ★ 新規（rebalance 出力、gitignored）

skills/rebalance/
└── SKILL.md                    # ★ 新規: `/rebalance` skill 定義（CLAUDE.md からスクリプト呼び出し）
```

**gitignore 追加が必要:**
```
aspects/investment/cash.csv
aspects/investment/candidates/
aspects/investment/reports/*-rebalance.md
```
保有銘柄 + cash + 判断が見える情報のため未コミット（portfolio.csv と同じ扱い）。

## CLI 仕様

```bash
# 基本（portfolio.csv + cash.csv + candidates/*.json を読む）
bun run scripts/investment/rebalance.ts

# dry-run（Notion 書き込みなし、stdout 表示）
bun run scripts/investment/rebalance.ts --dry-run

# 個別段（debug）
bun run scripts/investment/rebalance.ts --only-sanity
bun run scripts/investment/rebalance.ts --only-holdings

# 候補を明示指定（既定の candidates/*.json をスキップして単一ファイルを使う）
bun run scripts/investment/rebalance.ts --candidates aspects/investment/candidates/2026-05-21-growth.json

# cash.csv を一時的に上書き（テスト用）
bun run scripts/investment/rebalance.ts --cash-file /tmp/test-cash.csv
```

Skill `/rebalance` は `skills/rebalance/SKILL.md` で定義し、上記スクリプトを呼ぶ（既存 `/meal` / `/kondate` 等と同じパターン）。skill 側で「cash.csv の `updated_on` が 30 日以上前なら、実行前にユーザーに更新を促す」フローを書く。

## エラー処理

| エラー | 対応 |
|---|---|
| `portfolio.csv` が存在しない | エラー終了、ユーザーに portfolio CSV 設計を指示 |
| `cash.csv` が存在しない | エラー終了、サンプル schema を stdout に出してユーザーに作成を促す |
| `cash.csv` の `updated_on` が 30 日以上前 | warning 出して続行（古い残高で配分するリスクをユーザーに通知） |
| yahoo-finance2 で ticker fetch 失敗 | その ticker を **`Action: SKIP`** で報告（除外しない、ユーザーに気づかせる） |
| ニュース取得失敗（RSS / WebSearch 両方失敗） | 該当 ticker の thesis に「ニュース取得失敗、判定保留」と明記、Action は HOLD |
| sanity-check で警告銘柄あり | 該当銘柄に 🚨 マーク、md トップに警告サマリ |
| Notion 登録失敗 | md は保存済み、Notion 登録の retry 指示を stdout に出す |
| `candidates/*.json` が古い（>14 日） | warning 出して無視 |

## Verification

実装後の確認手順:

1. **portfolio.csv にテストデータを入れる**（AAPL + AMZN + 暴落歴のある銘柄 1 つ）
2. **cash.csv にテストデータを入れる**（USD 5000 / CAD 2000、`updated_on` を today）
3. `bun run scripts/investment/rebalance.ts --dry-run` で stdout に Holdings Review + Cash Allocation が出ることを確認
4. 各 thesis に **ソース URL が必ず含まれている**ことを確認（無いものは Claude 側のプロンプト不備）
5. 直近ニュースが thesis の最上位根拠として引用されていることを確認
6. sanity-check が暴落銘柄を捕捉していることを目視確認
7. `cash.csv` の `updated_on` を 35 日前に書き換えて warning が出ることを確認
8. `--candidates` を空ファイル / 古いファイル / 有効ファイル の 3 パターンで試す
9. dry-run なしで実行 → `aspects/investment/reports/<today>-rebalance.md` 生成確認 + Notion DB ページ生成確認
10. `--only-sanity` 単独実行が動くことを確認
11. Position sizing が aggressive 設定（max 15% / sector max 40%）で動いていることを確認

## Phase 2 アイデア（MVP 外）

- `/discover-growth` skill — momentum + news 起点でグロース候補ファイルを生成
- `/discover-value` skill — バリュー指標起点で候補ファイルを生成（既存 daily-report の進化版）
- `/discover-contrarian` skill — sanity-check で警告が出ている銘柄を逆張り視点で再評価
- 過去 rebalance レポートとの差分表示（「3 ヶ月前と比較して何が変わった」）
- 税最適化（Non-Registered 口座での capital gains harvesting 提案）
- `/rebalance` 完了時に tasks.md に「次回 rebalance 推奨日: 2026-08-21」を自動追記

## Rationale

**なぜ別コマンドにする？**
daily-report は「ニュース起点の連想練習」、rebalance は「自分の portfolio を踏まえた配分判断」。判断軸が違うので Claude プロンプトを分離した方が質が上がる。

**なぜ on-demand のみ？**
中長期（3 ヶ月スパン）の判断なので cron で回す必要がない。`.ai/rules/automation.md` の「Claude 依存の自動化を避ける」原則にも沿う。

**なぜ cash を別 CSV にする？**
portfolio.csv に CASH 行を混ぜる案もあったが、`quantity` / `avg_cost` の意味が CASH には無いのでスキーマが汚れる。cash.csv に分離すれば 2〜3 行の超軽量ファイルで済み、Wealthsimple を見て手で書き換えるだけで済む。引数で毎回入力するのは現実的に面倒なので廃止。

**なぜ Investor Profile を明示する？**
Claude のデフォルトは保守的（分散重視、配当株推奨、現金温存）に寄りがち。30 歳・aggressive growth のスタンスを明示しないと「Tech 偏重なので分散を」「配当株への分散を検討」のような的外れ提案が出る。プロンプトで profile を冒頭に置き、position sizing の数値もそれに合わせて緩めに設定する。

**なぜ直近ニュースを最優先軸に？**
PRIM 反省で学んだ通り、ファンダメンタルのスナップショット（forward PER 等）はガイダンス改定後の earnings 直撃を反映しない。直近 30 日のニュース・カタリストを先に見て、それで thesis が成立するかを判断、ファンダはサポートに回すのが現実的に有効。

**なぜ discovery を別 skill にする？**
- グロース / バリュー / モメンタム / コントラリアンなど発掘戦略は今後増やしたい
- `/rebalance` 本体に組み込むと、戦略追加のたびに本体を改修することになる
- ファイルベースのインターフェース（`candidates/*.json`）で疎結合にすれば、skill が無い状態でも `/rebalance` は holdings review として機能する

**なぜ Notion DB を別にする？**
既存「投資ヒント」DB は 1 ページ = 1 つのテーマ + 3-5 銘柄。Portfolio Rebalance は 1 ページ = 全保有銘柄 + cash 配分。データ構造が違うので混ぜると検索性が悪化する。
