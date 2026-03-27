# Life OS Fork Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `kokiebisu/life`（private）を `kokiebisu/life-os`（public template）の正式な fork として管理する。upstream から generic 改善を取り込み、personal-only 変更は `life` にのみ留める双方向ワークフローを確立する。

**Architecture:** 2リポジトリモデル。`life-os` = generic template（setup wizard, diet/gym/study aspect等）。`life` = personal fork（church, people, prayer, guitar 等の private aspect を追加）。`life-os` remote が upstream として機能し、generic 変更は PR で `life-os` に貢献、personal 変更は `life` のみ。

**Tech Stack:** Git, GitHub CLI, Bash, TypeScript/Bun

---

## 現状

- 共通の祖先: `ba1b2be` (chore: /cleanup コマンド削除)
- `life-os/main` が `life` に対して 10 commits ahead（`git merge` は **衝突なし**）
- `life` が `life-os/main` に対して 15 commits ahead（personal data が中心）
- `life-os` remote は既に設定済み

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `docs/life-os-personal-policy.md` | personal-only ファイル/aspect の定義と貢献ポリシー |
| `scripts/life-os-sync.sh` | upstream から pull / life-os へ push のヘルパースクリプト |

### Modified
| File | Change |
|------|--------|
| `CLAUDE.md` | fork 管理ワークフローのセクション追加 |

---

## Task 1: upstream merge — life-os/main を life に取り込む

**Files:**
- Modify: `planning/daily/2026-03-27.md` (新規追加)

> **背景:** `git merge life-os/main` は衝突なし。追加されるのは `planning/daily/2026-03-27.md`（life-os のテンプレートデイリープラン）のみ。

- [ ] **Step 1: main ブランチに切り替え（またはこのブランチでマージ）**

```bash
git checkout main
```

- [ ] **Step 2: merge 実行**

```bash
git merge life-os/main --no-ff -m "chore: merge life-os/main upstream (gym extract, setup wizard, aspect manifests)"
```

Expected output:
```
Merge made by the 'ort' strategy.
 planning/daily/2026-03-27.md | 30 +
 1 file changed, 30 insertions(+)
```

- [ ] **Step 3: 追加された daily plan ファイルを確認**

```bash
cat planning/daily/2026-03-27.md
```

内容がテンプレート（placeholder）になっているため、このファイルは保持するか削除するか判断する。
保持する場合: そのまま。削除する場合:

```bash
git rm planning/daily/2026-03-27.md
git commit -m "chore: remove life-os template daily plan (not needed in personal fork)"
```

- [ ] **Step 4: merge 後の状態確認**

```bash
git log --oneline life-os/main..HEAD | head -5
git log --oneline HEAD..life-os/main | head -5
```

Expected: `HEAD..life-os/main` が 0 件（fully merged）

- [ ] **Step 5: commit**

```bash
git push origin main
```

---

## Task 2: personal-only policy ドキュメントを作成する

**Files:**
- Create: `docs/life-os-personal-policy.md`

> **目的:** どの aspect/ファイルが personal-only で life-os に含めないかを明文化する。これにより、PR 作成時や cherry-pick 時に判断基準が明確になる。

- [ ] **Step 1: policy ドキュメントを作成**

`docs/life-os-personal-policy.md` を以下の内容で作成する:

```markdown
# Life OS Fork Policy

`kokiebisu/life` は `kokiebisu/life-os` の personal fork。

## life-os に含める（generic）

以下は life-os に貢献できる generic な変更:

| 対象 | 説明 |
|------|------|
| `scripts/` | Notion 連携スクリプト（setup wizard 含む）|
| `aspects/diet/` | ダイエット aspect（personal data 除く）|
| `aspects/gym/` | ジム aspect（個人のジム情報 除く）|
| `aspects/study/` | 学習 aspect（personal ノート除く）|
| `.claude/rules/` | 汎用ルール（personal context 除く）|
| `.claude/skills/` | 汎用スキル |
| `CLAUDE.md` | 汎用指示（personal context 除く）|
| `life.config.example.json` | 設定例 |
| `package.json`, `tsconfig.json` | 設定ファイル |

## life のみ（personal-only）

以下は life-os に含めない:

| 対象 | 理由 |
|------|------|
| `aspects/church/` | 教会・個人的信仰 |
| `aspects/people/` | 個人の人間関係 |
| `aspects/devotions/` | 個人デボーション記録 |
| `aspects/guitar/` | 個人的趣味 |
| `aspects/sound/` | 個人的趣味 |
| `aspects/reading/` | 個人的趣味 |
| `aspects/job/` | 個人の就職活動 |
| `aspects/investment/` | 個人の投資情報 |
| `aspects/*/events/` | 個人の予定記録 |
| `aspects/*/daily/` | 個人の日次記録 |
| `planning/events/` | 個人の予定 |
| `planning/daily/` | 個人のデイリープラン |
| `planning/tasks.md` | 個人タスク |
| `profile/` | 個人プロフィール |
| `memory-bank/` | 個人の設計決定メモ |
| `.claude/rules/context.md` | 個人の状況 |
| `projects/` | 個人プロジェクト（サブモジュール）|

## life-os への貢献手順

1. `life` で generic な改善をコミット
2. `scripts/life-os-sync.sh contrib <commit-hash>` で対象コミットを確認
3. `kokiebisu/life-os` リポジトリに cherry-pick する:

```bash
# life-os リポジトリをクローン（または既存のディレクトリで）
cd /tmp/life-os
git cherry-pick <commit-hash>
git push origin main
```

## upstream sync 手順（life-os → life）

```bash
git fetch life-os
git merge life-os/main --no-ff
# 衝突があれば personal data を優先（ours）
git push origin main
```
```

- [ ] **Step 2: commit**

```bash
git add docs/life-os-personal-policy.md
git commit -m "docs: add life-os fork policy (personal vs generic content)"
```

---

## Task 3: sync ヘルパースクリプトを作成する

**Files:**
- Create: `scripts/life-os-sync.sh`

> **目的:** upstream sync と life-os への貢献を簡単にするスクリプト。

- [ ] **Step 1: スクリプトを作成**

`scripts/life-os-sync.sh` を以下の内容で作成する:

```bash
#!/usr/bin/env bash
# life-os-sync.sh — bidirectional sync helper
# Usage:
#   ./scripts/life-os-sync.sh pull          # life-os/main → life (merge)
#   ./scripts/life-os-sync.sh status        # show divergence
#   ./scripts/life-os-sync.sh contrib       # show commits safe to push to life-os

set -e

REMOTE="life-os"
UPSTREAM_BRANCH="life-os/main"

cmd="${1:-status}"

case "$cmd" in
  status)
    echo "=== life-os fork status ==="
    git fetch "$REMOTE" --quiet
    ahead=$(git log --oneline "$UPSTREAM_BRANCH..HEAD" | wc -l | tr -d ' ')
    behind=$(git log --oneline "HEAD..$UPSTREAM_BRANCH" | wc -l | tr -d ' ')
    echo "life is $ahead commits ahead, $behind commits behind life-os"
    echo ""
    if [ "$behind" -gt 0 ]; then
      echo "--- Commits in life-os not yet in life ---"
      git log --oneline "HEAD..$UPSTREAM_BRANCH"
      echo ""
    fi
    if [ "$ahead" -gt 0 ]; then
      echo "--- Commits in life not yet in life-os ---"
      git log --oneline "$UPSTREAM_BRANCH..HEAD"
    fi
    ;;

  pull)
    echo "=== Merging life-os/main into life ==="
    git fetch "$REMOTE"
    git merge "$UPSTREAM_BRANCH" --no-ff
    echo "Done. Review merge result and push with: git push origin main"
    ;;

  contrib)
    # Show commits that touch only generic (non-personal) paths
    echo "=== Commits potentially safe to contribute to life-os ==="
    echo "(touches only scripts/, aspects/diet, aspects/gym, aspects/study, .claude/, CLAUDE.md, etc.)"
    echo ""
    git log --oneline "$UPSTREAM_BRANCH..HEAD" -- \
      scripts/ \
      aspects/diet/CLAUDE.md aspects/diet/aspect.json \
      aspects/gym/CLAUDE.md aspects/gym/aspect.json aspects/gym/profile.md \
      aspects/study/CLAUDE.md aspects/study/aspect.json \
      .claude/rules/ .claude/skills/ \
      CLAUDE.md package.json tsconfig.json life.config.example.json \
      2>/dev/null || true
    ;;

  *)
    echo "Usage: $0 [status|pull|contrib]"
    exit 1
    ;;
esac
```

- [ ] **Step 2: 実行権限を付与**

```bash
chmod +x scripts/life-os-sync.sh
```

- [ ] **Step 3: 動作確認**

```bash
./scripts/life-os-sync.sh status
```

Expected output:
```
=== life-os fork status ===
life is N commits ahead, 0 commits behind life-os
```

- [ ] **Step 4: commit**

```bash
git add scripts/life-os-sync.sh
git commit -m "feat: add life-os-sync.sh for upstream pull and contribution workflow"
```

---

## Task 4: CLAUDE.md に fork 管理セクションを追加する

**Files:**
- Modify: `CLAUDE.md`

> **目的:** fork 管理のワークフローを CLAUDE.md に記載し、将来のセッションでも参照できるようにする。

- [ ] **Step 1: CLAUDE.md の Commands セクションに追加**

現在の `## Commands` セクションの bash ブロックに以下を追加:

```bash
./scripts/life-os-sync.sh status   # life-os との乖離確認
./scripts/life-os-sync.sh pull     # life-os/main を life に取り込む
./scripts/life-os-sync.sh contrib  # life-os に貢献できるコミットを確認
```

- [ ] **Step 2: Git & Security セクションに fork 管理ルールを追加**

```markdown
## Fork 管理（life-os との同期）

- **upstream remote:** `life-os` → `https://github.com/kokiebisu/life-os.git`
- **personal-only の定義:** `docs/life-os-personal-policy.md` 参照
- **upstream sync:** `./scripts/life-os-sync.sh pull`
- **life-os への貢献:** `./scripts/life-os-sync.sh contrib` で対象コミットを確認 → cherry-pick で life-os に PR
```

- [ ] **Step 3: commit**

```bash
git add CLAUDE.md
git commit -m "docs: add life-os fork management workflow to CLAUDE.md"
```

---

## 自己レビュー

### Spec カバレッジ確認

| 要件 | 対応タスク |
|------|-----------|
| life が life-os の fork 状態になる | Task 1（upstream merge） |
| personal-only 変更の定義 | Task 2（policy ドキュメント） |
| life-os に含めたくない変更の管理方法 | Task 2 + 3 |
| 今後の sync ワークフロー | Task 3（sync スクリプト） |
| CLAUDE.md への反映 | Task 4 |

### 注意点

- Task 1 の merge は **main ブランチ** で行うこと（現在 `docs/prayer-request-bible-verses` ブランチ）
- `planning/daily/2026-03-27.md` はテンプレート内容のため、不要なら削除してよい
- `life-os` remote の push 先は現状 `https://` 形式（push には書き込み権限が必要）
