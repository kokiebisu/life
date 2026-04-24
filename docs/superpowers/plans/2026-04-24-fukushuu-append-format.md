# `/fukushuu` 復習詰まり追記方式への切り替え Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/fukushuu` を「独立ファイル/独立 Notion ページ作成」方式から「各ノート末尾の `## 🔁 復習で詰まったところ` セクションに日付付きで追記」方式に切り替える。自己評価も Claude が面接官として判定。

**Architecture:** 影響箇所は (1) `skills/fukushuu/SKILL.md` の判定ロジック・追記ステップの追加、(2) `skills/study/SKILL.md` の `## ❓ 残った疑問・次回へ` 削除、(3) 既存 weakness.md 4ファイルを対応 `note.md` に統合、(4) 既存「勉強（復習）」ページ（`勉強（読書）` DB 内）の削除。

**Tech Stack:** Markdown skill ファイル、Notion MCP（`notion-update-page`、`notion-fetch`、`notion-create-pages`）、`scripts/notion/notion-delete.ts`。

**Spec:** `docs/superpowers/specs/2026-04-24-fukushuu-append-format-design.md`

---

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `skills/fukushuu/SKILL.md` | 修正 | Step 4 判定ロジック、Step 4.5 追記処理、除外リスト更新、注意事項追加 |
| `skills/study/SKILL.md` | 修正 | テンプレートから `## ❓ 残った疑問・次回へ` を削除、Step 7 から「残った疑問」処理を削除 |
| `aspects/study/interview-prep/resilire/notes/2026-04-09/note.md` | 末尾追記 | weakness.md 統合（+ frontmatter に notion_id 追加） |
| `aspects/study/interview-prep/resilire/notes/2026-04-10/note.md` | 末尾追記 | 同上 |
| `aspects/study/interview-prep/resilire/notes/2026-04-11/note.md` | 末尾追記 | 同上（Notion ページ要確認） |
| `aspects/study/interview-prep/resilire/notes/2026-04-13/note.md` | 末尾追記 | 同上 |
| `aspects/study/interview-prep/resilire/notes/2026-04-09/weakness.md` | 削除 | note.md に統合済 |
| `aspects/study/interview-prep/resilire/notes/2026-04-10/weakness.md` | 削除 | 同上 |
| `aspects/study/interview-prep/resilire/notes/2026-04-11/weakness.md` | 削除 | 同上 |
| `aspects/study/interview-prep/resilire/notes/2026-04-13/weakness.md` | 削除 | 同上 |

**Notion 側:**

| 操作 | 対象 |
|---|---|
| 既存 `勉強（復習）` ページ削除 | `34bce17f-7b98-8173-973f-d23c233b9c34`（および同タイトルの他ページがあれば追加） |
| 各 note.md 対応ページ末尾追記 | 勉強（面接対策）DB 内の対応ページ |

---

## Task 0: Worktree 作成

- [ ] **Step 1: worktree を作成**

```bash
cd /workspaces/life
git stash 2>/dev/null || true
BRANCH="feat/fukushuu-append-format"
git worktree add .worktrees/$BRANCH -b $BRANCH
cd .worktrees/$BRANCH
git stash pop 2>/dev/null || true
```

Expected: `.worktrees/feat/fukushuu-append-format/` ディレクトリが作成され、main の最新状態のコピーになる。

- [ ] **Step 2: 作業ディレクトリ確認**

```bash
pwd
git status
```

Expected: `pwd` が `/workspaces/life/.worktrees/feat/fukushuu-append-format`、`git status` で `On branch feat/fukushuu-append-format` と表示される。

---

## Task 1: `skills/fukushuu/SKILL.md` 改修

**Files:**
- Modify: `skills/fukushuu/SKILL.md`

### Step 1-1: 除外リストから `weakness.md` を削除

- [ ] **Edit を実施**

`skills/fukushuu/SKILL.md` 41行目付近の除外リストから以下の行を削除:

```
- `**/weakness.md`（復習で言えなかったこと記録・note.md 本体に統合されるべき補助ノート）
```

### Step 1-2: Step 4 (4) の自己評価を Claude 判定に置き換え

- [ ] **Edit を実施**

現状（103〜106行目付近）:

```markdown
4. 全問終了後、AskUserQuestion で3段階の自己評価を聞く:
   - ⭕ 完璧（全問スラスラ答えられた）
   - 🔺 あいまい（方向性は合ってたが細部が怪しい）
   - ❌ 忘れた（ほぼ思い出せなかった）
```

を以下に置き換え:

```markdown
4. 全質問の回答中、Claude が**面接官として**各質問を ✅ / ⚠ / ❌ の3段階で内部判定する（Step 4.5 で使用）:
   - ✅ 正解 — 主要概念を正確に答えた
   - ⚠ 部分正解 — 主要概念は合っているが細部の値・定義・基準を欠落
   - ❌ 詰まり — 主要概念を取り違えた / 「わからない」「忘れた」と即答

   全問終了後、Claude が判定結果を集約して全体評価を提示する（AskUserQuestion は使わない）:
   - 全質問が ✅ → ⭕ 完璧
   - ❌ なし、⚠ が1問以上 → 🔺 あいまい
   - ❌ が1問以上 → ❌ 忘れた

   提示フォーマット例:
   > 面接官として判定: **❌ 忘れた**
   > 理由: POA/DOA を逆に説明したため

   ユーザーが異議（「いや今のは正解」等）を出したら素直に再判定する。
```

### Step 1-3: Step 4.5（新規）追記処理を追加

- [ ] **Edit を実施**

Step 4 の最後（Step 5 の直前）に以下のセクションを挿入:

```markdown
## Step 4.5: 詰まった内容をノートに追記

ノートごとに、その回で ⚠ または ❌ と判定された質問を集めて、ノート末尾に追記する。

### 追記しないケース

そのノートで全質問が ✅ だった場合、何も追記しない（ノートをクリーンに保つ）。

### MD ノートへの追記

セクション位置: **ファイル末尾**（既存セクションの後）。

セクションが既に存在する場合:
- `## 🔁 復習で詰まったところ` の**直下**に新しい日付ブロックを挿入する（最新が上）

セクションが無い場合:
- ファイル末尾に `## 🔁 復習で詰まったところ` を新規作成し、最初の日付ブロックを追加

フォーマット:

​```markdown
## 🔁 復習で詰まったところ

### YYYY-MM-DD
- **Q: コーネル式キューの原文をそのまま記載**
  - 詰まった内容: ユーザー回答の要約（要点のみ。直接引用しすぎない）
  - 正解ポイント: ノート本文から該当箇所を1〜2行で抽出
```

同一日付内の Q の順は出題順（古い → 新しい）。

### Notion ページへの追記

ノートのフロントマター `notion_id` を確認:

1. **`notion_id` あり:**
   - `notion-fetch` で既存本文を取得
   - 末尾に同じ Markdown ブロック（`## 🔁 復習で詰まったところ` の最新日付ブロック）を追記
   - `notion-update-page` の `replace_content` で全文書き戻す

2. **`notion_id` なし:**
   - `notion-add.ts --db study` 等で新規ページ作成
   - 取得した notion_id を md のフロントマターに書き戻す
   - 上記 1 と同じ手順で本文末尾に追記

   **例外:** interview-prep ノート（`aspects/study/interview-prep/**/note.md`）で notion_id がない場合は、対応するページが「勉強（面接対策）」DB（`33fce17f-7b98-8083-b569-d1e4bc70f867`）にあるか `notion-search` で確認してから判断する。見つかればその ID を frontmatter に書き戻して使う。見つからなければ新規作成。

### 失敗時

Notion 側の更新に失敗した場合、md は更新済みのまま **「Notion 同期失敗、再実行してください」** とユーザーに通知する。
```

### Step 1-4: Step 5 の confidence を Claude 判定に合わせる

- [ ] **Edit を実施**

143行目付近の説明:

```
- `confidence`: 最新の自己評価。`"perfect"` / `"fuzzy"` / `"forgot"` のいずれか。既存エントリに `confidence` がなくても正常動作する（後方互換）
```

を以下に変更:

```
- `confidence`: Claude が面接官として下した最新の判定結果。`"perfect"` / `"fuzzy"` / `"forgot"` のいずれか。既存エントリに `confidence` がなくても正常動作する（後方互換）
```

### Step 1-5: 注意セクションに面接官モードの明示を追加

- [ ] **Edit を実施**

ファイル末尾の `## 注意` セクション（149行目付近）に以下を追記:

```markdown
- **面接官モード:** 自己評価は Claude が面接官として判定する。基準は「面接で口頭説明した時に通用するか」。用語の取り違えは ❌、概念は合っているが細部精度が落ちるなら ⚠、スラスラ正確なら ✅
- ユーザーが判定に異議を出したら素直に再判定する。言い訳ではなく事実確認として扱う
```

### Step 1-6: 動作確認（Read で内容を再確認）

- [ ] **Read を実施**

```bash
# Step 4 / 4.5 / 5 周辺を読んで構造確認
```

Expected: 以下が満たされている:
- `**/weakness.md` の除外行がない
- Step 4 (4) で Claude 判定が説明されている
- Step 4.5 が新規追加されている
- Step 5 で confidence の説明が更新されている
- 注意セクションに面接官モードの記載がある

### Step 1-7: コミット

- [ ] **コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "feat(fukushuu): 面接官判定 + 詰まり追記セクションへ切り替え"
```

---

## Task 2: `skills/study/SKILL.md` 改修

**Files:**
- Modify: `skills/study/SKILL.md`

### Step 2-1: テンプレートから「残った疑問・次回へ」を削除

- [ ] **Edit を実施**

145〜147行目:

```markdown
## ❓ 残った疑問・次回へ

（理解できなかった点、次のセッションで深めたいこと）
```

→ **3行とも削除**（前後の空行も整理）。直前の `## ❓ 自分への質問（コーネル式キュー）` セクション（141〜143行目）はそのまま残す。

### Step 2-2: Step 7 の終了確認文言を変更

- [ ] **Edit を実施**

233行目付近:

```
セッションを終了してよいですか？まとめと残った疑問を一緒に整理してから閉じます。
```

→ 以下に変更:

```
セッションを終了してよいですか？まとめを整理してから閉じます。
```

### Step 2-3: Step 7 (2) の「残った疑問」言及を削除

- [ ] **Edit を実施**

236行目付近:

```
2. ユーザーが確認したら、まとめと残った疑問を一緒に作成する:
```

→ 以下に変更:

```
2. ユーザーが確認したら、まとめを作成する:
```

### Step 2-4: Step 7 (4) の「残った疑問」言及を削除

- [ ] **Edit を実施**

261行目付近:

```
4. **MD を最終内容で更新する** （終了時刻 + まとめ + 残った疑問）
```

→ 以下に変更:

```
4. **MD を最終内容で更新する** （終了時刻 + まとめ）
```

### Step 2-5: 動作確認

- [ ] **Read を実施**

`skills/study/SKILL.md` をざっと読み、`残った疑問` という文字列が残っていないか確認。

```bash
grep -n "残った疑問" skills/study/SKILL.md
```

Expected: 出力なし（0件）。

### Step 2-6: コミット

- [ ] **コミット**

```bash
git add skills/study/SKILL.md
git commit -m "refactor(study): セッションテンプレートから残った疑問セクションを削除"
```

---

## Task 3: 既存 weakness.md 4件の note.md 統合

各 weakness.md を読み、対応する `note.md` の末尾に新フォーマットで統合する。weakness.md 自体は削除する。

### 共通方針

- 各 weakness.md の **`## YYYY-MM-DD` ヘッダー以下のトピック** を `### YYYY-MM-DD` サブセクション化（その日付＝復習を行った日）
- 各トピックを「Q / 詰まった内容 / 正解ポイント」構造に近づける（Q は weakness.md 末尾の `## ❓ 自分への質問（コーネル式キュー）` から流用、なければ「**論点:**」表記）
- weakness.md にある `## ❓ 自分への質問（コーネル式キュー）` は**破棄**（note.md 既存のキューと用途が異なるため、コーネル式キューとしては使わない。Q として上記でのみ使用）
- weakness.md のヘッダー（例: `# Day 1: 復習で言えなかったこと`）は破棄

### Step 3-1: 2026-04-09 の処理

- [ ] **Read で weakness.md を確認**

```bash
# 既に読み込み済み内容（plan 作成時に確認）：
# - ヘッダー: # Day 1: 復習で言えなかったこと
# - 日付ブロック: ## 2026-04-10
# - トピック: 可用性数字 / QPS係数 / 5ステップ4・5番 / sqlc vs GORM / Goマップキー
# - キュー: 5問（可用性 / QPS / 5ステップ / sqlc vs GORM / Go map）
```

- [ ] **note.md の末尾に追記（Edit）**

`aspects/study/interview-prep/resilire/notes/2026-04-09/note.md` の末尾（197行目: `4. N+1問題の定義...` の後）に以下を追加:

```markdown

## 🔁 復習で詰まったところ

### 2026-04-10
- **Q: 99.9%（スリーナイン）と 99.99%（フォーナイン）のダウンタイムを年間・月間で言える？Resilire 文脈ではどちらを目指す？**
  - 詰まった内容: 数字を即答できなかった
  - 正解ポイント: 99.9% は年間約8.7時間・月43分（一般的なSaaS）、99.99% は年間約52分・月4.3分（決済・医療・インフラ系）。Resilire は災害対応システムなので「99.99% を目指す設計」と言うと刺さる
- **Q: QPS 計算で平均 QPS に何倍を掛けてピーク時を見積もる？**
  - 詰まった内容: ピーク係数を即答できなかった
  - 正解ポイント: 平均 QPS に 2〜3倍を掛けてピーク時を見積もる。例: 平均100 QPS → 「ピーク時300 QPSで設計します」と言う
- **Q: システム設計5ステップのうち 4番目と 5番目は？それぞれ何に注意する？**
  - 詰まった内容: 4・5番目を即答できなかった（1〜3 は要件確認 → スケール感 → 全体設計まで言えた）
  - 正解ポイント: 4. 深掘り（自分が一番語れる部分から入る）、5. ボトルネック（弱点と改善案をセットで言う）
- **Q: sqlc と GORM で N+1 問題が起きにくいのはどっち？理由は？**
  - 詰まった内容: 違いを明確に説明できなかった
  - 正解ポイント: sqlc。SQL を先に書いて Go コードを自動生成するため、型安全で N+1 に気づきやすい。GORM は ORM 経由で Go コードからクエリを書くため N+1 が起きやすい。Resilire は sqlc を使用
- **Q: Go で map のキー存在確認の正しい書き方は？`m["key"]` だけではダメな理由を説明できる？**
  - 詰まった内容: 2値形式の知識があやふや。「存在しないキーはコンパイルエラーになる」と誤解
  - 正解ポイント: 2値形式 `v, ok := m["key"]` を使う。`ok` が `true` なら存在、`false` なら存在しない。存在しないキーへのアクセスはコンパイルエラーにも例外にもならず、ランタイムでゼロ値を返す（Python/JS とは異なる）
```

- [ ] **weakness.md を削除**

```bash
git rm aspects/study/interview-prep/resilire/notes/2026-04-09/weakness.md
```

- [ ] **Notion ページに同内容を追記**

ノート対応 Notion ページ ID: `e091be65-e090-4956-acb1-274fab6defc9`（勉強（面接対策）DB）

手順:
1. `notion-fetch` で既存本文を取得（`id: e091be65-e090-4956-acb1-274fab6defc9`）
2. 上記 md で追加した `## 🔁 復習で詰まったところ` ブロックを末尾に追加した本文を組み立てる
3. `notion-update-page` の `replace_content` で全文書き戻す

- [ ] **note.md frontmatter に notion_id を追加**

`aspects/study/interview-prep/resilire/notes/2026-04-09/note.md` の冒頭にフロントマターを追加:

```markdown
---
notion_id: e091be65-e090-4956-acb1-274fab6defc9
date: 2026-04-09
category: interview-prep
---

# Day 1: Go Tour Basics・interface
```

（既存のタイトル `# Day 1: ...` の前に挿入）

### Step 3-2: 2026-04-10 の処理

- [ ] **Read で weakness.md を確認**

`aspects/study/interview-prep/resilire/notes/2026-04-10/weakness.md` を Read（plan 作成時に冒頭は確認済み: `## 2026-04-10` 日付ブロック、PK インデックス / 短縮URL生成 / キャッシュTTL / キャッシュスタンピード / 等のトピック）。

- [ ] **note.md の末尾に追記（Edit）**

`aspects/study/interview-prep/resilire/notes/2026-04-10/note.md` の末尾に以下を追加:

```markdown

## 🔁 復習で詰まったところ

### 2026-04-10
- **Q: PK に追加でインデックスを貼る必要がある？理由は？**
  - 詰まった内容: PK が自動でインデックスを持つことを忘れていた
  - 正解ポイント: 不要。PRIMARY KEY = ユニーク制約 + インデックス自動作成のため、追加でインデックスを貼る必要なし
- **Q: base62 で6文字ランダム生成すると何通り作れる？**
  - 詰まった内容: 計算式と桁感を即答できなかった
  - 正解ポイント: base62（a-z, A-Z, 0-9）で6文字 → 62^6 ≈ 568億通り。衝突時は再生成
- **Q: 短縮URL生成で「ハッシュ生成」と「ランダム生成」の使い分け基準は？（bit.ly はどっち？）**
  - 詰まった内容: 使い分け基準を即答できなかった
  - 正解ポイント: 「同じURLを同じ短縮にしたい」場合 → ハッシュ。一般的（bit.ly 含む）→ ランダム
- **Q: キャッシュTTLの判断基準は？URLショートナーの推奨TTLは？**
  - 詰まった内容: 判断プロセスがあやふや
  - 正解ポイント: データが変わらない → TTLを長くできる（24時間〜7日）。データが頻繁に変わる → TTL短く（数分〜1時間）。URLショートナーは「一度作ったら変わらない」→ 長めでOK
- **Q: キャッシュスタンピードとは？MUST で覚える対策は？**
  - 詰まった内容: 用語と対策を知らなかった
  - 正解ポイント: キャッシュが落ちると全リクエストが DB に流れて DB も落ちる連鎖障害。対策はキャッシュクラスターで冗長化
```

> **注:** 上記は plan 作成時に Read した weakness.md の内容に基づく。実装時に再 Read して内容を最終確認すること。

- [ ] **weakness.md を削除**

```bash
git rm aspects/study/interview-prep/resilire/notes/2026-04-10/weakness.md
```

- [ ] **Notion ページに同内容を追記**

ノート対応 Notion ページ ID:
- 候補1: `9c8f7282-754a-4ff5-9552-3f61387fd926`（タイトル「Day 2: interface設計パターン・struct・システム設計URLショートナー」）
- 候補2: `33ece17f-7b98-818d-bd3a-e419137c348d`（同タイトル、日付 `2026-04-10` JST 16:00）

**実装時の手順:**
1. 両ページを `notion-fetch` で取得し、本文の重複・差分を確認する
2. 内容が完全重複（duplicate）の場合、片方を削除（保持するのは作成日が新しい方）してから残ったページに追記
3. 内容が異なる場合、より note.md と一致する方を本体とする。もう一方も `notion-delete.ts` で削除（重複は混乱の元）
4. 確定した notion_id を note.md frontmatter に追加（次のサブステップ）

- [ ] **note.md frontmatter に notion_id を追加**

```markdown
---
notion_id: <上記で確定した ID>
date: 2026-04-10
category: interview-prep
---

# Day 2: interface設計パターン・struct・システム設計URLショートナー
```

### Step 3-3: 2026-04-11 の処理

- [ ] **Read で weakness.md を確認**

`aspects/study/interview-prep/resilire/notes/2026-04-11/weakness.md` を Read。

- [ ] **note.md の末尾に追記（Edit）**

weakness.md の各トピックを「Q / 詰まった内容 / 正解ポイント」フォーマットに変換し、`aspects/study/interview-prep/resilire/notes/2026-04-11/note.md` の末尾に `## 🔁 復習で詰まったところ` セクションとして追記する。

Q は weakness.md 末尾の `## ❓ 自分への質問` キューがあればそれを使用、なければ各トピックタイトルから `**論点:**` 形式で生成。

- [ ] **weakness.md を削除**

```bash
git rm aspects/study/interview-prep/resilire/notes/2026-04-11/weakness.md
```

- [ ] **Notion ページを特定して追記**

`notion-search` で「Day 3 goroutine channel」「Day 3 Resilire」など複数キーワードで検索し、勉強（面接対策）DB（`collection://33fce17f-7b98-806e-a1dc-000b3cbc277a`）内の対応ページを探す。

**見つかった場合:**
1. ID を確定
2. `notion-fetch` → 末尾に追記 → `notion-update-page` で書き戻す
3. note.md frontmatter に notion_id を追加

**見つからなかった場合:**
1. `notion-add.ts --db study` または `notion-create-pages`（parent: `data_source_id: 33fce17f-7b98-806e-a1dc-000b3cbc277a`）で新規作成
2. note.md の本文＋追記内容を初回ページ本文として書き込む
3. 取得した notion_id を frontmatter に追加

### Step 3-4: 2026-04-13 の処理

- [ ] **Read で weakness.md を確認**

`aspects/study/interview-prep/resilire/notes/2026-04-13/weakness.md` を Read。

- [ ] **note.md の末尾に追記（Edit）**

Step 3-1 / 3-2 と同じ要領で、`aspects/study/interview-prep/resilire/notes/2026-04-13/note.md` の末尾に `## 🔁 復習で詰まったところ` を追加。

- [ ] **weakness.md を削除**

```bash
git rm aspects/study/interview-prep/resilire/notes/2026-04-13/weakness.md
```

- [ ] **Notion ページに同内容を追記**

ノート対応 Notion ページ ID: `ace875e8-7776-4e09-98ab-0695187bdd7e`（タイトル「Day 4: error handling / audit columns / 災害アラート」）

手順:
1. `notion-fetch id=ace875e8-7776-4e09-98ab-0695187bdd7e`
2. 末尾に追記して `notion-update-page` で全文書き戻す

- [ ] **note.md frontmatter に notion_id を追加**

```markdown
---
notion_id: ace875e8-7776-4e09-98ab-0695187bdd7e
date: 2026-04-13
category: interview-prep
---

# Day 4: error handling / audit columns / 災害アラート
```

### Step 3-5: 動作確認

- [ ] **削除と追加の確認**

```bash
ls aspects/study/interview-prep/resilire/notes/2026-04-09/
ls aspects/study/interview-prep/resilire/notes/2026-04-10/
ls aspects/study/interview-prep/resilire/notes/2026-04-11/
ls aspects/study/interview-prep/resilire/notes/2026-04-13/
```

Expected: いずれも `note.md` のみ（`weakness.md` がない）。

```bash
grep -l "## 🔁 復習で詰まったところ" aspects/study/interview-prep/resilire/notes/*/note.md
```

Expected: 4ファイルすべてが一致。

### Step 3-6: コミット

- [ ] **コミット**

```bash
git add aspects/study/interview-prep/resilire/notes/
git commit -m "refactor(study): weakness.md を note.md 末尾の復習詰まりセクションに統合"
```

---

## Task 4: 既存「勉強（復習）」Notion ページの削除

**対象:** `勉強（読書）` DB 内の `勉強（復習）` タイトルのページ。

### Step 4-1: 削除対象ページのリスト化

- [ ] **検索で全件取得**

```bash
# notion-search を data_source_url=collection://d72929e4-8fd8-4fb9-9cb3-e49e96c38841、query="勉強（復習）" で実行し、
# 「勉強（復習）」タイトルのページ ID をすべてリスト化する
```

Plan 作成時点で確認できた ID:
- `34bce17f-7b98-8173-973f-d23c233b9c34`

実装時に他のページが追加で見つかれば全てリストに含める。

### Step 4-2: 各ページを `notion-delete.ts` で削除

- [ ] **削除コマンド実行**

```bash
bun run scripts/notion/notion-delete.ts 34bce17f-7b98-8173-973f-d23c233b9c34
# 他に対象があれば追加
```

Expected: 各ページが完全削除され、`notion-search` で「勉強（復習）」タイトルが0件になる。

### Step 4-3: キャッシュクリア

- [ ] **クリア実行**

```bash
bun run scripts/cache-status.ts --clear
```

### Step 4-4: 削除確認

- [ ] **再検索で確認**

```bash
# notion-search query="勉強（復習）" data_source_url="collection://d72929e4-8fd8-4fb9-9cb3-e49e96c38841"
```

Expected: 結果0件。

> **コミット不要:** Notion 操作のみのため git の変更はない。Task 5 のコミットでまとめてカバーされる。

---

## Task 5: 動作検証 と PR 作成

### Step 5-1: 全体 grep で残骸チェック

- [ ] **`残った疑問` の参照チェック**

```bash
grep -rn "残った疑問" skills/ aspects/study/ 2>/dev/null
```

Expected:
- `skills/study/SKILL.md` には残らない（テンプレート削除済み）
- `aspects/study/` 配下の既存ノート（章ノート・interview-prep ノート）には残っていてOK（ユーザーは既存ノート削除を希望していない）

- [ ] **`weakness.md` の参照チェック**

```bash
grep -rn "weakness.md" skills/ docs/ 2>/dev/null
find aspects/study -name "weakness.md"
```

Expected:
- `skills/fukushuu/SKILL.md` から除外行が消えている
- `aspects/study/` 配下に `weakness.md` ファイルが0件

### Step 5-2: PR 作成

- [ ] **push**

```bash
git push -u origin HEAD
```

- [ ] **PR 作成**

```bash
gh api repos/kokiebisu/life/pulls --method POST \
  --field title="feat: /fukushuu を詰まり追記方式に切り替え + weakness.md 統合" \
  --field head="feat/fukushuu-append-format" \
  --field base="main" \
  --field body="## Summary
- \`/fukushuu\` の自己評価を Claude 面接官モードに変更し、詰まった質問をノート末尾の \`## 🔁 復習で詰まったところ\` に日付付きで追記する方式に切り替え
- \`skills/study/SKILL.md\` のテンプレートから \`## ❓ 残った疑問・次回へ\` を削除（既存ノートには残す）
- 既存 weakness.md 4ファイルを対応する note.md 末尾に統合し削除
- 「勉強（復習）」Notion ページを削除（DB は残す）

Spec: \`docs/superpowers/specs/2026-04-24-fukushuu-append-format-design.md\`

## Test plan
- [ ] 章ノートに対して \`/fukushuu\` を1セッション実行し、詰まり追記が md + Notion に反映されることを確認
- [ ] 全問正解時に何も追記されないことを確認
- [ ] interview-prep ノートに対しても同様に動作することを確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

`gh pr create` が "No commits between..." で失敗する可能性があるため、最初から `gh api` で作成（git-workflow.md の指示通り）。

### Step 5-3: マージ

- [ ] **squash merge + ブランチ削除**

```bash
gh pr merge <PR番号> --repo kokiebisu/life --squash --delete-branch
```

### Step 5-4: worktree 後片付け

- [ ] **メイン側に戻って後片付け**

```bash
cd /workspaces/life
git stash 2>/dev/null || true
git pull origin main
git stash pop 2>/dev/null || true
git worktree remove .worktrees/feat/fukushuu-append-format --force
git branch -D feat/fukushuu-append-format 2>/dev/null || true
```

Expected: worktree が削除され、main が最新になる。

---

## Self-Review チェックリスト

- [x] Spec の各セクションをタスクで網羅:
  - 1. 追記対象とフォーマット → Task 1-3
  - 2. 詰まった判定ロジック → Task 1-2
  - 3. Notion 同期 → Task 1-3, Task 3 各サブタスク
  - 4. 既存 weakness.md 移行 → Task 3
  - 5. スキルファイル更新 → Task 1, Task 2
  - 既存「勉強（復習）」削除 → Task 4
- [x] プレースホルダーなし（具体的な行番号・コード・コマンド付き）
- [x] 型整合性: confidence 値（"perfect" / "fuzzy" / "forgot"）は Step 1-4 と spec で一致
- [x] 各タスクが独立してコミット可能

## Notes

- Day 3 (2026-04-11) の Notion ページ ID は実装時に確定する（plan 作成時の調査では未発見）
- Day 2 (2026-04-10) は Notion 上に重複候補が2件ある可能性があるため、実装時に確認
