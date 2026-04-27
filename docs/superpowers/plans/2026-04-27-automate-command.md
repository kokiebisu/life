# /automate Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Claude Code skill `/automate` that detects systematization opportunities from session content and produces an actionable plan, then implements approved candidates.

**Architecture:** Markdown-based Claude Code skill (no code, no tests). Lives at `skills/automate/SKILL.md` with the same 4-step pattern as `/learn`. Generated plans are written to `docs/automate/YYYY-MM-DD-<topic>.md` (gitignored). CLAUDE.md is updated to register the command.

**Tech Stack:** Markdown only. No build, no tests. Validation is by file content and `git check-ignore`.

**Spec:** [docs/superpowers/specs/2026-04-27-automate-command-design.md](../specs/2026-04-27-automate-command-design.md)

---

## Task 1: Set up worktree

**Files:**
- Create: `.worktrees/feat/automate-command/` (worktree dir)

This project requires worktrees for all PR work — direct commits to `main` are forbidden.

- [ ] **Step 1: Check for unstaged changes and stash if any**

Run from `/workspaces/life`:
```bash
git status --short
```

If anything besides `playground.go` / `playground1.go` (the IDE scratch files) appears, stash:
```bash
git stash push -u -m "pre-automate-worktree"
```

If only the playground files appear, no stash needed.

- [ ] **Step 2: Create worktree from main**

```bash
cd /workspaces/life
git worktree add .worktrees/feat/automate-command -b feat/automate-command
```

Expected: "Preparing worktree (new branch 'feat/automate-command')"

- [ ] **Step 3: Move into worktree**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
```

If Step 1 stashed, run `git stash pop` here.

All subsequent tasks operate inside this worktree path. Use absolute paths under `.worktrees/feat/automate-command/` going forward.

---

## Task 2: Create skills/automate/SKILL.md

**Files:**
- Create: `.worktrees/feat/automate-command/skills/automate/SKILL.md`

The skill follows the same shape as `skills/learn/SKILL.md` (Step 1〜4 frontmatter + headings, Japanese instructions).

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p /workspaces/life/.worktrees/feat/automate-command/skills/automate
```

- [ ] **Step 2: Write SKILL.md with full content**

Create `/workspaces/life/.worktrees/feat/automate-command/skills/automate/SKILL.md` with this exact content:

````markdown
---
name: automate
description: 成功した手順やセッションの作業内容を仕組み化（skill / script / rule / hook）したいとき。「これ仕組み化したい」「自動化したい」「次回も再現できるようにしたい」などに使う。
---

# Automate - セッション内容の仕組み化

セッション内の手作業・繰り返し判断・成功した手順を抽出し、再現可能な仕組み（skill / script / rule / hook）に落とす plan を作って実装まで進める。

## `/learn` との棲み分け

| トリガー                                     | コマンド    |
| -------------------------------------------- | ----------- |
| ミスを起点に再発防止したい（1 件）           | `/learn`    |
| 成功した手順を再現可能にしたい               | `/automate` |
| セッション全体を俯瞰して仕組み化したい       | `/automate` |

## 引数

`$ARGUMENTS` — 仕組み化したい対象のヒント（省略可）

- 省略時: セッション全体を振り返って自動抽出
- 指定時: そのヒントを軸にセッションを掘る

## Step 1: 候補抽出

セッションを振り返り、以下のパターンを検出してユーザーに列挙する:

- **手作業の繰り返し** — 同じ Bash / Read / Edit の連続、同じ判断ループ
- **明文化されていない判断基準** — Claude が文脈から推測した判断（次回も同じ判断ができる保証なし）
- **未自動化の成功手順** — 複数ステップの操作が成功したが skill 化されていない

ヒントが指定された場合は、そのヒントに該当する候補だけ抽出する。

**出力フォーマット:**

```
### 仕組み化候補

1. **xxx 手順** — Bash 5 回 + Edit 3 回の流れ。skill 化候補
2. **yyy 判断基準** — 「A の場合は B」と判断したが rules になし。rule 追加候補
3. **zzz 同期処理** — 毎回手動で実行。hook 化候補
```

## Step 2: 候補の分類と提案

各候補を以下のいずれかに分類し、具体的な実装案を出す:

| 種別   | 出力先                       | 適用例                            |
| ------ | ---------------------------- | --------------------------------- |
| skill  | `skills/<name>/SKILL.md`     | 対話を伴う手順                    |
| script | `scripts/<name>.ts`          | 機械的な処理                      |
| rule   | `.ai/rules/<name>.md`        | 判断基準・厳守事項                |
| hook   | `.claude/settings.json`      | 前後で必ず実行する処理            |

**事前確認（必須）:**

```bash
ls skills/    # 既存 skill と重複しないか
ls scripts/   # 既存 script と重複しないか
ls .ai/rules/ # rule は既存ファイルに統合できないか
```

## Step 3: plan 出力 + 承認

`docs/automate/YYYY-MM-DD-<topic>.md` に plan を書き出す。日付は `TZ=Asia/Tokyo date +%Y-%m-%d` で取得する。

**plan フォーマット:**

```markdown
# Automate Plan - YYYY-MM-DD - <topic>

## セッション要約
- 対象: <ヒント or "セッション全体">
- 検出パターン数: N

## 仕組み化候補

### 1. <候補名>
- **種別**: skill / script / rule / hook
- **検出根拠**: セッション内で〜が N 回繰り返された / 〜の判断が rules になかった等
- **提案実装**:
  - ファイル: `skills/<name>/SKILL.md`
  - 概要: <1〜2 行>
  - 主要ステップ: <箇条書き>
- **想定効果**: 次回以降 X 分節約 / 判断のブレを防ぐ等
- **依存・前提**: <既存スクリプト・skill との関係>

### 2. <候補名>
（同形式）

## 実装順序
1. <候補1> — 独立、すぐ実装可
2. <候補2> — <候補1> に依存
3. ...

## スキップ候補
- <候補名> — 理由（既に存在 / 1 回限り / 過剰設計等）
```

書き出したら、`AskUserQuestion` で以下を選ばせる:

- **全候補を実装**
- **個別選択**（カンマ区切り番号入力、例: `1,3,5`）
- **キャンセル**

## Step 4: 実装 + PR

承認分を実装し、`/pr` で PR を作成する。

- skill / script / rule の新規作成は通常通りファイル編集
- **hook 追加は `update-config` skill に委譲する** — `.claude/settings.json` の編集は専用 skill 経由

## ルール

- **過剰仕組み化を避ける** — 1 セッションで 1 回しか発生しなかった作業は仕組み化しない（「今後も繰り返す」確証があるものだけ）
- **既存 skill / script と重複しない** — Step 2 の前に必ず `ls` で確認
- **rule 追加は `.ai/rules/` の既存ファイルに統合できないか先に検討** — 新ファイルを乱立させない
- **hook 追加は `update-config` skill に委譲**
- **plan 承認時は `AskUserQuestion` を使う**
- **個別選択時はカンマ区切り番号入力** — `/analyze` と同じ UX
- **スキップ候補も plan に明記** — なぜ仕組み化しないかを残す
- **日付は JST で取得** — `TZ=Asia/Tokyo date +%Y-%m-%d`
````

- [ ] **Step 3: Verify file content**

```bash
head -5 /workspaces/life/.worktrees/feat/automate-command/skills/automate/SKILL.md
wc -l /workspaces/life/.worktrees/feat/automate-command/skills/automate/SKILL.md
```

Expected: First line is `---`, second is `name: automate`. Total around 100 lines.

- [ ] **Step 4: Commit**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
git add skills/automate/SKILL.md
git commit -m "feat(automate): セッション内容を仕組み化する /automate スキルを追加"
```

---

## Task 3: Add docs/automate/ to .gitignore

**Files:**
- Modify: `.worktrees/feat/automate-command/.gitignore` (append section)

- [ ] **Step 1: Append gitignore entry**

Use Edit tool to add the following block at the end of `/workspaces/life/.worktrees/feat/automate-command/.gitignore` (after the existing `aspects/study/interview-prep/...playground.go` block):

```
# /automate generated plans (per-session, not committed)
docs/automate/
```

The final file should end with a single trailing blank line (preserving existing style).

- [ ] **Step 2: Verify gitignore works**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
mkdir -p docs/automate
touch docs/automate/test-ignore.md
git status --short docs/automate/
```

Expected: empty output (file is ignored).

If output is non-empty, the gitignore entry is wrong — fix and retry.

- [ ] **Step 3: Clean up test artifact**

```bash
rm /workspaces/life/.worktrees/feat/automate-command/docs/automate/test-ignore.md
rmdir /workspaces/life/.worktrees/feat/automate-command/docs/automate
```

- [ ] **Step 4: Commit**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
git add .gitignore
git commit -m "chore: docs/automate/ を gitignore に追加"
```

---

## Task 4: Register /automate in CLAUDE.md

**Files:**
- Modify: `.worktrees/feat/automate-command/CLAUDE.md` (around line 58-59, "その他" section)

- [ ] **Step 1: Edit CLAUDE.md**

Use Edit tool on `/workspaces/life/.worktrees/feat/automate-command/CLAUDE.md`:

**old_string:**
```
/learn                   # ミスからの学習・再発防止
/analyze                 # ルール→コード リファクタリング分析
```

**new_string:**
```
/learn                   # ミスからの学習・再発防止
/automate                # セッション内容を仕組み化（skill/script/rule/hook 化を計画→実装）
/analyze                 # ルール→コード リファクタリング分析
```

- [ ] **Step 2: Verify edit**

```bash
grep -n "/automate" /workspaces/life/.worktrees/feat/automate-command/CLAUDE.md
```

Expected: One line in the "その他" command list section showing `/automate                # セッション内容を仕組み化（skill/script/rule/hook 化を計画→実装）`.

- [ ] **Step 3: Commit**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
git add CLAUDE.md
git commit -m "docs(claude): コマンド一覧に /automate を追加"
```

---

## Task 5: Commit the spec doc

**Files:**
- Already exists in main: `docs/superpowers/specs/2026-04-27-automate-command-design.md`

The spec was written in main worktree before the worktree was created, so it isn't tracked in the feature branch yet. Bring it in.

- [ ] **Step 1: Copy spec from main worktree**

```bash
cp /workspaces/life/docs/superpowers/specs/2026-04-27-automate-command-design.md \
   /workspaces/life/.worktrees/feat/automate-command/docs/superpowers/specs/2026-04-27-automate-command-design.md
```

- [ ] **Step 2: Copy this plan from main worktree**

```bash
cp /workspaces/life/docs/superpowers/plans/2026-04-27-automate-command.md \
   /workspaces/life/.worktrees/feat/automate-command/docs/superpowers/plans/2026-04-27-automate-command.md
```

- [ ] **Step 3: Commit both**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
git add docs/superpowers/specs/2026-04-27-automate-command-design.md \
        docs/superpowers/plans/2026-04-27-automate-command.md
git commit -m "docs(automate): /automate コマンドの設計書と実装プランを追加"
```

---

## Task 6: Push and create PR

**Files:** none (git operations only)

- [ ] **Step 1: Push branch**

```bash
cd /workspaces/life/.worktrees/feat/automate-command
git push -u origin feat/automate-command
```

Expected: New branch pushed.

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat(automate): /automate コマンドを追加（セッション内容を仕組み化）" --body "$(cat <<'EOF'
## Summary
- セッション内の手作業・成功手順・暗黙の判断基準を skill / script / rule / hook に落とす `/automate` スキルを追加
- `/learn`（失敗起点）と棲み分け: `/automate` は成功起点 or セッション俯瞰
- plan は `docs/automate/YYYY-MM-DD-<topic>.md` に出力（gitignore 済、コミットしない）

## 設計・プラン
- 設計書: docs/superpowers/specs/2026-04-27-automate-command-design.md
- 実装プラン: docs/superpowers/plans/2026-04-27-automate-command.md

## Test plan
- [ ] `/automate` 起動時、ヒントなしでセッション全体を振り返り候補が出る
- [ ] `/automate <hint>` でヒント中心の候補が出る
- [ ] 承認後、選択した候補が実装される
- [ ] `docs/automate/` 以下のファイルは git untracked にならない（gitignore 効く）
- [ ] CLAUDE.md コマンド一覧に `/automate` が表示される

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If `gh pr create` fails with "No commits between main and ...", fall back to `gh api` per `.ai/rules/git-workflow.md`:

```bash
gh api repos/kokiebisu/life/pulls --method POST \
  --field title="feat(automate): /automate コマンドを追加（セッション内容を仕組み化）" \
  --field head="feat/automate-command" \
  --field base="main" \
  --field body="<same body as above>"
```

- [ ] **Step 3: Report PR URL to user**

The PR URL is printed by `gh pr create`. Surface it to the user.

---

## Task 7: Cleanup after merge

> Run this only after the PR has been merged.

- [ ] **Step 1: Verify worktree has no uncommitted changes**

```bash
git -C /workspaces/life/.worktrees/feat/automate-command status --porcelain
```

Expected: empty.

If non-empty, investigate before proceeding (per `.ai/rules/git-workflow.md` worktree cleanup rule).

- [ ] **Step 2: Remove worktree and pull main**

```bash
cd /workspaces/life
git worktree remove .worktrees/feat/automate-command --force
git branch -D feat/automate-command 2>/dev/null || true
git pull origin main
```

Expected: worktree removed, branch deleted, main updated with merged commits.
