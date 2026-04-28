# fukushuu pending_questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `aspects/study/review-log.json` に `pending_questions: string[]` フィールドを追加し、復習で詰まった質問だけを次回再出題するロジックを `skills/fukushuu/SKILL.md` に組み込む。

**Architecture:** SKILL.md の Step 2 / 4 / 5 / 6 を改訂する。コードファイルへの変更は無い（Claude が SKILL.md の指示に従って動作する仕様変更）。マイグレーションは Step 2 内で初回起動時に冪等実行される。

**Tech Stack:** Markdown (skill instructions), JSON (review-log schema). 実装はすべて SKILL.md の編集による。

**Spec:** [docs/superpowers/specs/2026-04-28-fukushuu-pending-questions-design.md](../specs/2026-04-28-fukushuu-pending-questions-design.md)

---

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `skills/fukushuu/SKILL.md` | Modify | Step 2 (マイグレーション追加) / Step 4 (pending 出題分岐 + 判定後の pending 更新) / Step 5 (スキーマ更新) / Step 6 (サマリーに pending 表示) |
| `aspects/study/review-log.json` | Auto-migrated | 初回起動時に各エントリへ `pending_questions: []` が追加される（手動編集不要） |

---

## Worktree Setup

CLAUDE.md ルールに従い、すべての編集は worktree で行う。

- [ ] **Step 0-1: 既存 worktree の状態確認**

```bash
git -C /workspaces/life worktree list
git -C /workspaces/life status --porcelain
```

Expected: `main` worktree のみ、または既存 worktree がある場合はその状態を確認

- [ ] **Step 0-2: feature worktree を作成**

```bash
cd /workspaces/life
git worktree add .worktrees/feat/fukushuu-pending -b feat/fukushuu-pending main
cd .worktrees/feat/fukushuu-pending
```

Expected: ブランチ `feat/fukushuu-pending` が作成され、worktree に main の最新が checkout される

---

## Task 1: Step 2 にマイグレーション処理を追加

**Files:**
- Modify: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (Step 2 セクション、行 33-35)

- [ ] **Step 1-1: 現状の Step 2 を Read で確認**

```bash
grep -n "Step 2:" /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: `33:## Step 2: 復習ログを読む` が見つかる

- [ ] **Step 1-2: Step 2 セクションを置き換える**

`Edit` ツールで以下を置換:

`old_string`:
```
## Step 2: 復習ログを読む

`aspects/study/review-log.json` を Read する。ファイルがなければ空の `{}` として扱う。
```

`new_string`:
````
## Step 2: 復習ログを読む + マイグレーション

`aspects/study/review-log.json` を Read する。ファイルがなければ空の `{}` として扱う。

### マイグレーション（厳守・冪等）

各エントリに `pending_questions` フィールドが無ければ `[]` を追加して書き戻す。これは冪等処理なので毎回実行してよい。

```typescript
for (const [path, entry] of Object.entries(log)) {
  if (!('pending_questions' in entry)) {
    entry.pending_questions = [];
  }
}
// 変更があった場合のみ Write で書き戻す
```

書き戻した後、後続の Step に進む。
````

- [ ] **Step 1-3: 編集後の確認**

```bash
sed -n '33,55p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: マイグレーションのコードブロックが含まれていること

- [ ] **Step 1-4: コミット**

```bash
cd /workspaces/life/.worktrees/feat/fukushuu-pending
git add skills/fukushuu/SKILL.md
git commit -m "$(cat <<'EOF'
feat(fukushuu): Step 2 に pending_questions マイグレーションを追加

review-log.json の各エントリに pending_questions フィールドが無ければ
空配列を追加する冪等処理を Step 2 に追記。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Step 4「各ノートの処理」に pending_questions 出題分岐を追加

**Files:**
- Modify: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (Step 4「各ノートの処理」セクション、行 135-162)

- [ ] **Step 2-1: 現状の手順 1〜3 を確認**

```bash
sed -n '135,145p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: 「1. ノートを Read する」から「3. 上記の出題形式ルールに従い...」までが見える

- [ ] **Step 2-2: 出題分岐ステップを手順 3 の前に挿入**

`Edit` ツールで以下を置換:

`old_string`:
```
1. ノートを Read する
2. タイトルのみを表示する。**`🧒 一言で言うと` は表示しない**（後続の質問の答えのキーワードを漏洩する可能性が高いため）
3. 上記の出題形式ルールに従い、**1問ずつ** 出題する。既存キューがある場合はベースにしつつ、カテゴリに合った実装/クエリ系に翻訳して出題してよい
   - ユーザーが答えるのを待つ
   - 答えが返ってきたら、ノートの該当箇所を引用して解説・補足する
   - 次の質問がある場合は続ける
```

`new_string`:
```
1. ノートを Read する
2. タイトルのみを表示する。**`🧒 一言で言うと` は表示しない**（後続の質問の答えのキーワードを漏洩する可能性が高いため）
3. **pending_questions の確認（厳守）**: review-log.json の該当ノートエントリから `pending_questions` を取得する
   - **`pending_questions` が空でない場合**: そのリストの質問だけを 1 問ずつ出題する。ノートの `❓ 自分への質問` セクションは**参照しない**（前回詰まった部分だけに集中再出題する仕組み）
   - **`pending_questions` が空の場合**: 通常通り `❓ 自分への質問` を出題する（カテゴリに応じた角度切り替えも従来通り適用）
4. 上記の出題形式ルールに従い、**1問ずつ** 出題する。既存キューがある場合はベースにしつつ、カテゴリに合った実装/クエリ系に翻訳して出題してよい
   - ユーザーが答えるのを待つ
   - 答えが返ってきたら、ノートの該当箇所を引用して解説・補足する
   - 次の質問がある場合は続ける
```

- [ ] **Step 2-3: 既存の手順番号がずれていないか確認**

```bash
sed -n '135,170p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: 手順 4 (「上記の出題形式ルールに従い...」)、手順 5 (「全質問の回答中、Claude が面接官として...」 ← 旧手順4)、手順 6 (「回答に応じて次回スケジュールを伝える」 ← 旧手順5) と番号が増える

- [ ] **Step 2-4: 旧手順 4 の冒頭参照を更新**

`Edit` ツールで「全質問の回答中、Claude が**面接官として**各質問を」の手順番号 `4` → `5` に変更。

`old_string`:
```
4. 全質問の回答中、Claude が**面接官として**各質問を ✅ / ⚠ / ❌ の3段階で内部判定する（Step 4.5 で使用）:
```

`new_string`:
```
5. 全質問の回答中、Claude が**面接官として**各質問を ✅ / ⚠ / ❌ の3段階で内部判定する（Step 4.5 で使用）:
```

- [ ] **Step 2-5: 旧手順 5 の冒頭参照を更新**

`Edit` ツールで「回答に応じて次回スケジュールを伝える」の手順番号 `5` → `6` に変更。

`old_string`:
```
5. 回答に応じて次回スケジュールを伝える:
```

`new_string`:
```
6. 回答に応じて次回スケジュールを伝える + pending_questions を更新する:
```

- [ ] **Step 2-6: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "$(cat <<'EOF'
feat(fukushuu): Step 4 各ノート処理に pending_questions 出題分岐を追加

pending_questions が空でない場合は前回詰まった質問だけを再出題する。
空の場合は従来通り ❓ 自分への質問 から出題。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Step 4 判定後の pending_questions 更新ルールを追加

**Files:**
- Modify: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (Step 4 の旧手順 5 = 新手順 6、行付近 158-162)

- [ ] **Step 3-1: 現状の更新ルールを確認**

```bash
grep -n "回答に応じて次回スケジュールを伝える" /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: 1箇所がヒットする

- [ ] **Step 3-2: 更新ルールに pending_questions を追記**

`Edit` ツールで以下を置換:

`old_string`:
```
6. 回答に応じて次回スケジュールを伝える + pending_questions を更新する:
   - ⭕ 完璧 → review_count +1、通常間隔テーブル通り。「次回は〇〇日です」
   - 🔺 あいまい → review_count 変更なし、interval_days は `max(interval_days, 1)`（未復習状態の 0 は 1 に底上げ、それ以外は据え置き）、last_reviewed を今日に更新。「同じ間隔でもう1回復習します。次回は〇〇日です」
   - ❌ 忘れた → review_count を 0 にリセット、interval_days を 1 に。「もう一度、明日復習しましょう」
```

`new_string`:
```
6. 回答に応じて次回スケジュールを伝える + pending_questions を更新する:
   - ⭕ 完璧（全問 ✅） → review_count +1、通常間隔テーブル通り。**`pending_questions = []` にクリア**。「次回は〇〇日です」
   - 🔺 あいまい（⚠ あり、❌ なし） → review_count 変更なし、interval_days は `max(interval_days, 1)`（未復習状態の 0 は 1 に底上げ、それ以外は据え置き）、last_reviewed を今日に更新。**`pending_questions = ⚠ と判定された質問のテキストだけ`を保存**。「詰まった N 問を次回もう一度確認します。次回は〇〇日です」
   - ❌ 忘れた（❌ が1問以上） → review_count を 0 にリセット、interval_days を 1 に。**`pending_questions = ⚠ + ❌ と判定された質問のテキスト`を保存**。「もう一度、明日復習しましょう」

   **pending_questions 保存時の注意:**
   - 質問テキストは出題したそのままの文字列を保存する（要約・短縮しない）
   - 動的生成キュー（`❓ 自分への質問` セクションが無くて生成した質問）も同じく保存対象
   - 保存後、次回そのノートを復習するときは Step 4 の手順 3 の分岐で pending_questions が優先される
```

- [ ] **Step 3-3: 編集後の確認**

```bash
sed -n '160,180p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: pending_questions の更新ルールが3段階すべてに記載されている

- [ ] **Step 3-4: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "$(cat <<'EOF'
feat(fukushuu): Step 4 判定後の pending_questions 更新ルールを追加

⭕ → クリア、🔺 → ⚠ の質問だけ保存、❌ → ⚠+❌ の質問を保存。
質問テキストは出題そのままを保持し、動的生成キューも保存対象。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Step 5 review-log.json スキーマと更新ルールに pending_questions を追加

**Files:**
- Modify: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (Step 5 セクション、行 239-257)

- [ ] **Step 4-1: 現状の Step 5 を確認**

```bash
sed -n '239,260p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: review-log.json の JSON サンプルと、`last_reviewed` / `review_count` / `interval_days` / `confidence` の更新ルール箇条書きが見える

- [ ] **Step 4-2: JSON サンプルに pending_questions を追加**

`Edit` ツールで以下を置換:

`old_string`:
```
```json
{
  "aspects/study/system-design/fundamentals/scale-from-zero.md": {
    "last_reviewed": "YYYY-MM-DD",
    "interval_days": 3,
    "review_count": 2,
    "confidence": "perfect"
  }
}
```
```

`new_string`:
```
```json
{
  "aspects/study/system-design/fundamentals/scale-from-zero.md": {
    "last_reviewed": "YYYY-MM-DD",
    "interval_days": 3,
    "review_count": 2,
    "confidence": "perfect",
    "pending_questions": []
  }
}
```
```

- [ ] **Step 4-3: 更新ルール箇条書きに pending_questions の行を追加**

`Edit` ツールで以下を置換:

`old_string`:
```
- `confidence`: Claude が面接官として下した最新の判定結果。`"perfect"` / `"fuzzy"` / `"forgot"` のいずれか。既存エントリに `confidence` がなくても正常動作する（後方互換）
```

`new_string`:
```
- `confidence`: Claude が面接官として下した最新の判定結果。`"perfect"` / `"fuzzy"` / `"forgot"` のいずれか。既存エントリに `confidence` がなくても正常動作する（後方互換）
- `pending_questions`: 前回詰まった質問テキストの配列。⭕ 完璧 → `[]` にクリア、🔺 あいまい → ⚠ 質問のみ、❌ 忘れた → ⚠ + ❌ 質問。Step 2 マイグレーションで全エントリに最低限 `[]` が入る
```

- [ ] **Step 4-4: 編集後の確認**

```bash
sed -n '239,265p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: JSON サンプルに `"pending_questions": []` が含まれ、箇条書きに pending_questions の行が追加されている

- [ ] **Step 4-5: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "$(cat <<'EOF'
feat(fukushuu): Step 5 review-log.json スキーマに pending_questions を追加

JSON サンプルと更新ルール箇条書きに pending_questions フィールドを追記。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Step 6 サマリーへの pending 件数表示（任意）

**Files:**
- Modify: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (Step 6-2 のテンプレート、行付近 282-348)

- [ ] **Step 5-1: 現状の Step 6-2 テンプレートを確認**

```bash
sed -n '296,305p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: `### 復習対象（{N}件・{備考}）` のテーブル定義が見える

- [ ] **Step 5-2: テーブルに「次回 pending」列を追加**

`Edit` ツールで以下を置換:

`old_string`:
```
| # | ノート | 判定 |
|---|---|---|
| 1 | {ノート短縮タイトル} | {⭕ 完璧 / 🔺 あいまい / ❌ 忘れた} |
| 2 | ... | ... |
```

`new_string`:
```
| # | ノート | 判定 | 次回 pending |
|---|---|---|---|
| 1 | {ノート短縮タイトル} | {⭕ 完璧 / 🔺 あいまい / ❌ 忘れた} | {0 / N 問} |
| 2 | ... | ... | ... |
```

- [ ] **Step 5-3: 編集後の確認**

```bash
sed -n '296,310p' /workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md
```

Expected: テーブルに「次回 pending」列が追加されている

- [ ] **Step 5-4: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "$(cat <<'EOF'
feat(fukushuu): Step 6 サマリーテーブルに次回 pending 列を追加

セッションサマリーの復習対象テーブルに、ノートごとの次回持ち越し
pending 件数を表示する列を追加。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 整合性検証（実際に SKILL.md を読み直してロジックの矛盾がないか確認）

**Files:**
- Read: `.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` (全体)

- [ ] **Step 6-1: SKILL.md の全文を Read で読む**

`Read` ツールで `/workspaces/life/.worktrees/feat/fukushuu-pending/skills/fukushuu/SKILL.md` の全行を読む。

- [ ] **Step 6-2: 以下のチェックリストで矛盾を確認**

| チェック項目 | 確認方法 |
|---|---|
| Step 2 にマイグレーションコードが含まれている | `grep "pending_questions" SKILL.md` で 6 箇所以上ヒット |
| Step 4 の手順 3 に出題分岐がある | `grep "pending_questions の確認" SKILL.md` で 1 箇所ヒット |
| Step 4 の手順番号が 1-6 で連続している | `grep -E "^[0-9]\." SKILL.md` で順序確認 |
| Step 4 の判定ルールに3段階すべての pending 更新が書かれている | `grep -A2 "⭕ 完璧（全問" SKILL.md` で確認 |
| Step 5 の JSON サンプルに pending_questions がある | `grep "\"pending_questions\":" SKILL.md` で 1 箇所ヒット |
| Step 5 の箇条書きに pending_questions の行がある | `grep "前回詰まった質問テキストの配列" SKILL.md` で 1 箇所ヒット |
| Step 6 のサマリーテーブルに「次回 pending」列がある | `grep "次回 pending" SKILL.md` で 2 箇所ヒット |

- [ ] **Step 6-3: 矛盾があれば該当 Task に戻って修正**

矛盾なしなら次へ。あれば修正コミットを追加する。

---

## Task 7: PR 作成 + マージ + worktree クリーンアップ

- [ ] **Step 7-1: ブランチを push**

```bash
cd /workspaces/life/.worktrees/feat/fukushuu-pending
git push -u origin HEAD
```

Expected: `feat/fukushuu-pending` がリモートに push される

- [ ] **Step 7-2: PR 作成**

```bash
gh pr create --title "feat(fukushuu): pending_questions による詰まり集中再出題" --body "$(cat <<'EOF'
## Summary

- review-log.json に \`pending_questions: string[]\` フィールドを追加
- 復習で詰まった質問だけを次回再出題する仕組みを SKILL.md に組み込み
- 全部 ⭕ になればノート全体として進行（fuzzy ループから抜ける構造）

Spec: \`docs/superpowers/specs/2026-04-28-fukushuu-pending-questions-design.md\`

## Test plan

- [ ] 次回の \`/fukushuu\` 起動時、Step 2 マイグレーションで全 20 エントリに \`pending_questions: []\` が追加されることを確認
- [ ] 1 件のノートで 🔺 判定 → review-log.json に詰まった質問が保存されることを確認
- [ ] 翌日の \`/fukushuu\` でそのノートを復習 → pending_questions だけが出題されることを確認
- [ ] pending を全部 ⭕ で消化 → \`pending_questions = []\` + review_count +1 になることを確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL が出力される

- [ ] **Step 7-3: PR をマージ（squash）**

```bash
PR_NUM=$(gh pr view --json number --jq .number)
gh pr merge $PR_NUM --squash --delete-branch
```

Expected: PR がマージされる。"Merge commits are not allowed" エラーが出たら `--squash` で再試行（既に指定済み）

- [ ] **Step 7-4: worktree のクリーンアップ前に uncommitted changes 確認**

```bash
git -C /workspaces/life/.worktrees/feat/fukushuu-pending status --porcelain
```

Expected: 空（コミット済み）

- [ ] **Step 7-5: main を pull + worktree 削除**

```bash
cd /workspaces/life
git pull origin main
git worktree remove .worktrees/feat/fukushuu-pending --force
git branch -D feat/fukushuu-pending 2>/dev/null || true
```

Expected: `feat/fukushuu-pending` のコミットが main に取り込まれ、worktree が削除される

---

## Self-Review Checklist (実装者向け)

実装完了後、以下を確認すること:

- [ ] Spec の各セクション（スキーマ変更 / 出題ロジック / 判定後更新 / マイグレーション / Step 6 影響 / エッジケース）すべてが Task 1-6 のいずれかでカバーされている
- [ ] SKILL.md の Step 4 内の手順番号が 1, 2, 3, 4, 5, 6 と連続している（飛びや重複がない）
- [ ] `pending_questions` という識別子のスペルが SKILL.md 全体で統一されている（`pending_question` 等の typo がない）
- [ ] マイグレーションが冪等（複数回実行しても問題ない）
- [ ] commit メッセージが `feat(fukushuu):` プレフィックスで統一されている
