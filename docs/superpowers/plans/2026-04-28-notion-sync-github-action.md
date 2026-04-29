# Notion Sync GitHub Action 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion で確定した「昨日以前」の予定/タスク/食事/買い出し/デボーション等を、毎朝 JST 03:00 に GitHub Actions で md にプル → PR 作成 → 自動マージする。今日以降は Notion のみで管理し、終わった日は md に diary として残す運用を実現する。

**Architecture:** 既存の `scripts/notion/notion-pull.ts`（Linux 互換、JST 内部処理）と `scripts/notion/notion-fridge-consume.ts` をそのまま GitHub Actions ワークフローから呼び出す。ローカル macOS 用 `notion-cron-sync.sh` は廃止する。クロスプラットフォーム化のための新規 TypeScript ラッパは不要（pull スクリプトが既に Linux 動作する）。コミット形式は `gym-auto.yml` / `kondate-auto.yml` と同じ「ブランチ → PR → squash auto-merge」パターンに揃える（main 直プッシュ禁止ルールに従う）。

**Tech Stack:** GitHub Actions / Bun / TypeScript (`scripts/notion/notion-pull.ts`) / `gh api` / Notion API

---

## File Structure

| Path | 役割 |
| ---- | ---- |
| `.github/workflows/notion-sync.yml` (新規) | cron + workflow_dispatch トリガー、Notion → md sync の唯一の実行エントリ |
| `scripts/notion/notion-cron-sync.sh` (削除) | macOS 用ローカル cron スクリプト。Action 化により不要 |
| `CLAUDE.md` (修正) | Quick Reference の `notion-cron-sync.sh` の記述を削除（または「Action 化済み」注記に置換） |

> 既存の `scripts/notion/notion-pull.ts` と `scripts/notion/notion-fridge-consume.ts` は **無変更**。両方とも既に Linux/JST で動作する。

## 環境変数（GitHub Secrets）

`gym-auto.yml` で既に登録済みの secret を流用する。新規 secret 登録は不要：

- `NOTION_API_KEY`
- `NOTION_EVENTS_DB`
- `NOTION_TODO_DB`
- `NOTION_MEALS_DB`
- `NOTION_GROCERIES_DB`
- `NOTION_DEVOTION_DB`
- `NOTION_STUDY_DB`
- `NOTION_GYM_DB`
- `NOTION_INTERVIEW_PREP_DB`
- `NOTION_STUDY_TOPIC_DB`
- `NOTION_OTHER_DB`

`gh` 認証用に `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`、タイムゾーン用に `TZ: Asia/Tokyo` をワークフロー env に設定する。

## 設計の決定事項

| 項目 | 決定 | 理由 |
| ---- | ---- | ---- |
| スケジュール | `cron: "0 18 * * *"`（UTC 18:00 = JST 03:00） | gym-auto / kondate-auto と同タイミング。前日の予定が確実に終了している |
| 同期範囲 | デフォルト「昨日のみ」 | 既存 `notion-cron-sync.sh` と同じ動作。複数日バックフィルは `workflow_dispatch` 入力で対応 |
| pull オプション | `--all-entries --no-enrich` | 既存 cron と同じ。done でないエントリも履歴として残す（diary 用途） |
| コミット先 | feature ブランチ → PR → squash 自動マージ | `.ai/rules/git-workflow.md` の「main への直接コミット禁止」厳守 |
| Bot 名 | `notion-sync[bot]` | 既存の `gym-auto[bot]` / `kondate-auto[bot]` と命名規則を揃える |
| Disable 機構 | `.notion-sync.disabled` ファイルの存在チェック | 既存ワークフロー（`.gym-auto.disabled`）と同パターン |
| 変更なしの場合 | PR 作成しない | `git diff --quiet` 判定。空 PR を防ぐ |
| ローカル cron | 廃止 | Action 化により不要。重複コミット防止 |

## 今日以降 md の扱い（本プラン外）

ユーザーの設計「今日以降は Notion のみ」は本プランでは扱わない（sync は md 書き込み方向のみで、削除はしない）。`notion-pull.ts` は過去日の同期で「done でないエントリを残すかどうか」を `--all-entries` で制御するのみで、未来日 md ファイルの掃除は別タスク。必要なら別プランで `cleanup-future-md.ts` を作る。

---

## Task 1: ワークフローファイルの雛形を作成

**Files:**
- Create: `.github/workflows/notion-sync.yml`

- [ ] **Step 1: 雛形をコピー（gym-auto.yml ベース）**

`gym-auto.yml` の構造（cron + workflow_dispatch + checkout + Bun setup + git config + disable flag check + branch prep + run + change check + PR）をベースに新ファイルを作成する。

```yaml
name: notion-sync

on:
  schedule:
    # 毎日 JST 03:00 = UTC 18:00（前日）
    - cron: "0 18 * * *"
  workflow_dispatch:
    inputs:
      date:
        description: "同期する日付（YYYY-MM-DD）。空欄なら昨日"
        type: string
        default: ""
      days:
        description: "何日分同期するか（バックフィル用）"
        type: string
        default: "1"
      dry_run:
        description: "Dry run (no md write, no PR)"
        type: boolean
        default: false

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    env:
      TZ: Asia/Tokyo
      NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
      NOTION_EVENTS_DB: ${{ secrets.NOTION_EVENTS_DB }}
      NOTION_TODO_DB: ${{ secrets.NOTION_TODO_DB }}
      NOTION_MEALS_DB: ${{ secrets.NOTION_MEALS_DB }}
      NOTION_GROCERIES_DB: ${{ secrets.NOTION_GROCERIES_DB }}
      NOTION_DEVOTION_DB: ${{ secrets.NOTION_DEVOTION_DB }}
      NOTION_STUDY_DB: ${{ secrets.NOTION_STUDY_DB }}
      NOTION_GYM_DB: ${{ secrets.NOTION_GYM_DB }}
      NOTION_INTERVIEW_PREP_DB: ${{ secrets.NOTION_INTERVIEW_PREP_DB }}
      NOTION_STUDY_TOPIC_DB: ${{ secrets.NOTION_STUDY_TOPIC_DB }}
      NOTION_OTHER_DB: ${{ secrets.NOTION_OTHER_DB }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Configure git
        run: |
          git config user.name "notion-sync[bot]"
          git config user.email "notion-sync@users.noreply.github.com"

      - name: Check disable flag
        id: check_disable
        run: |
          if [ -f .notion-sync.disabled ]; then
            echo "disabled=true" >> $GITHUB_OUTPUT
          else
            echo "disabled=false" >> $GITHUB_OUTPUT
          fi
```

- [ ] **Step 2: 構文チェック**

ローカルで `actionlint` がなくても、YAML パースだけは確認する：

```bash
bun -e 'import yaml from "yaml"; const fs = require("fs"); yaml.parse(fs.readFileSync(".github/workflows/notion-sync.yml", "utf-8")); console.log("OK");'
```

期待: `OK` と出力される。エラーが出たらインデント・クォートを修正。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/notion-sync.yml
git commit -m "feat(notion-sync): scaffold notion-sync workflow"
```

---

## Task 2: 同期日付を計算するステップを追加

**Files:**
- Modify: `.github/workflows/notion-sync.yml`

- [ ] **Step 1: 日付計算ステップを追加**

`Check disable flag` の直後に以下を追加する。`workflow_dispatch` の `date` 入力があればそれを、なければ JST の昨日を使う。

```yaml
      - name: Compute target date
        if: steps.check_disable.outputs.disabled != 'true'
        id: target
        run: |
          INPUT_DATE="${{ inputs.date }}"
          if [ -n "$INPUT_DATE" ]; then
            DATE="$INPUT_DATE"
          else
            DATE=$(TZ=Asia/Tokyo date -d "yesterday" +%Y-%m-%d)
          fi
          DAYS="${{ inputs.days }}"
          DAYS="${DAYS:-1}"
          echo "date=$DATE" >> $GITHUB_OUTPUT
          echo "days=$DAYS" >> $GITHUB_OUTPUT
          echo "Target: $DATE (days=$DAYS)"
```

- [ ] **Step 2: コミット**

```bash
git add .github/workflows/notion-sync.yml
git commit -m "feat(notion-sync): compute target date for sync"
```

---

## Task 3: ブランチ準備と sync 実行ステップを追加

**Files:**
- Modify: `.github/workflows/notion-sync.yml`

- [ ] **Step 1: ブランチ作成ステップを追加**

```yaml
      - name: Prepare branch
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true
        id: branch
        run: |
          BRANCH="chore/notion-sync-${{ steps.target.outputs.date }}"
          echo "name=$BRANCH" >> $GITHUB_OUTPUT
          git checkout -b "$BRANCH"
```

- [ ] **Step 2: notion-pull の dry-run / 本番ステップを追加**

```yaml
      - name: Run notion-pull (dry-run)
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run == true
        run: |
          bun run scripts/notion/notion-pull.ts \
            --date ${{ steps.target.outputs.date }} \
            --days ${{ steps.target.outputs.days }} \
            --all-entries --no-enrich --dry-run

      - name: Run notion-pull (production)
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true
        run: |
          bun run scripts/notion/notion-pull.ts \
            --date ${{ steps.target.outputs.date }} \
            --days ${{ steps.target.outputs.days }} \
            --all-entries --no-enrich
```

- [ ] **Step 3: fridge consume ステップを追加**

```yaml
      - name: Run fridge consume
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true
        run: |
          DATE="${{ steps.target.outputs.date }}"
          bun run scripts/notion/notion-fridge-consume.ts \
            --from "$DATE" --to "$DATE" || true
```

> `|| true` は既存 `notion-cron-sync.sh` の挙動を踏襲。fridge consume は失敗しても sync 自体を止めない。

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/notion-sync.yml
git commit -m "feat(notion-sync): wire up notion-pull and fridge-consume"
```

---

## Task 4: 変更検知 → PR 作成 → 自動マージのステップを追加

**Files:**
- Modify: `.github/workflows/notion-sync.yml`

- [ ] **Step 1: 変更検知ステップを追加**

```yaml
      - name: Check for changes
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true
        id: changes
        run: |
          if git diff --quiet && git diff --cached --quiet; then
            echo "has_changes=false" >> $GITHUB_OUTPUT
            echo "No changes to sync."
          else
            echo "has_changes=true" >> $GITHUB_OUTPUT
          fi
```

- [ ] **Step 2: コミット → push → PR → squash merge ステップを追加**

```yaml
      - name: Commit, push, create and merge PR
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true && steps.changes.outputs.has_changes == 'true'
        run: |
          BRANCH="${{ steps.branch.outputs.name }}"
          DATE="${{ steps.target.outputs.date }}"

          git add -A
          git commit -m "chore(notion-sync): sync from notion $DATE

          Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
          git push -u origin "$BRANCH"

          PR_URL=$(gh api repos/${{ github.repository }}/pulls \
            --method POST \
            --field title="chore(notion-sync): sync from notion $DATE" \
            --field head="$BRANCH" \
            --field base="main" \
            --field body="Notion から $DATE の予定/タスク/食事/買い出し/デボーション等を md に同期しました。" \
            --jq '.html_url')

          PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
          gh api repos/${{ github.repository }}/pulls/$PR_NUMBER/merge \
            --method PUT --field merge_method=squash
```

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/notion-sync.yml
git commit -m "feat(notion-sync): commit, PR and auto-merge synced changes"
```

---

## Task 5: ワークフロー全体を `workflow_dispatch` でテスト（dry-run）

**Files:**
- なし（GitHub UI 操作のみ）

- [ ] **Step 1: ブランチを push**

PR を立てる前にこのブランチで Action を試走できるよう、push する：

```bash
git push -u origin HEAD
```

- [ ] **Step 2: dry-run 実行**

GitHub UI で `Actions → notion-sync → Run workflow` を選び、ブランチを現在の作業ブランチに切り替えて：
- `date`: 空欄
- `days`: `1`
- `dry_run`: `true`

で実行する。または CLI から：

```bash
gh workflow run notion-sync.yml \
  --ref "$(git branch --show-current)" \
  -f dry_run=true
```

- [ ] **Step 3: 実行ログを確認**

```bash
gh run list --workflow=notion-sync.yml --limit 1
gh run view <RUN_ID> --log
```

期待:
- `Compute target date` で昨日の日付が出ている
- `Run notion-pull (dry-run)` が `[DRY RUN] Preview mode` で完了し、エラーなし
- `Run fridge consume` が成功 or `|| true` で吸収
- `Commit, push, create and merge PR` ステップは `if` でスキップされている

失敗したら：環境変数の不足（`NOTION_*_DB`）か、`notion-pull.ts` の Linux 互換性問題が考えられる。secret 名のタイポを確認 → 直して再 push → 再実行。

---

## Task 6: 本番実行で 1 回マージまで通す

**Files:**
- なし（GitHub UI 操作のみ）

- [ ] **Step 1: 本番 dry_run=false で実行（feature ブランチで）**

```bash
gh workflow run notion-sync.yml \
  --ref "$(git branch --show-current)" \
  -f dry_run=false
```

- [ ] **Step 2: 生成された PR を確認**

```bash
gh pr list --head "chore/notion-sync-$(TZ=Asia/Tokyo date -d 'yesterday' +%Y-%m-%d)"
```

期待: 1件 PR が作成され、`squash merge` で自動マージ済みになっている（または変更がなければ PR 自体が作られない）。

- [ ] **Step 3: マージ後のコミットを確認**

```bash
git fetch origin main
git log origin/main --oneline -5 | grep "notion-sync"
```

期待: `chore(notion-sync): sync from notion YYYY-MM-DD` のコミットが main に存在する。

> 失敗時の切り戻し: マージ後に問題があれば `git revert <SHA>` で戻す。`.notion-sync.disabled` をリポジトリに置いて Action を一時停止できる。

---

## Task 7: ローカル cron スクリプトを削除

**Files:**
- Delete: `scripts/notion/notion-cron-sync.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: macOS の crontab から該当エントリを外す（手動）**

```bash
crontab -l | grep -v notion-cron-sync.sh | crontab -
crontab -l   # 確認
```

> このステップはローカルマシンで手動実行。Action ワーカーでは行わない。

- [ ] **Step 2: スクリプトファイルを削除**

```bash
git rm scripts/notion/notion-cron-sync.sh
```

- [ ] **Step 3: CLAUDE.md の Commands セクションを修正**

`CLAUDE.md` の Quick Reference にある以下の行を削除する：

```
./scripts/notion-cron-sync.sh          # 昨日の Notion データを md に同期（cron 用）
```

実際のパスは [CLAUDE.md](../../../CLAUDE.md) の `## Commands` セクション内 ([CLAUDE.md](../../../CLAUDE.md))。Edit ツールで該当行をピンポイント削除する。

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md scripts/notion/notion-cron-sync.sh
git commit -m "chore(notion-sync): remove local cron script (replaced by GitHub Action)"
```

---

## Task 8: 最終 PR を作成しマージ

**Files:**
- なし（PR 作成のみ）

- [ ] **Step 1: PR 作成**

```bash
git push -u origin HEAD
gh pr create \
  --title "feat(notion-sync): GitHub Action for daily Notion → md sync" \
  --body "$(cat <<'EOF'
## Summary
- 毎朝 JST 03:00 に昨日の Notion 内容を md にプルする GitHub Action を追加
- ローカル macOS cron (`notion-cron-sync.sh`) を廃止
- 「今日以降は Notion のみ／昨日以前は md に diary として残す」運用を実現

## Test plan
- [x] `workflow_dispatch` の `dry_run=true` で実行ログにエラーなし
- [x] `workflow_dispatch` の `dry_run=false` で PR が自動マージされ main に反映
- [ ] 翌朝 JST 03:00 のスケジュール実行で同様に動作することを確認（次回実行後）
EOF
)"
```

- [ ] **Step 2: マージ**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 3: ローカル main を更新 → worktree 片付け**

```bash
cd /workspaces/life
git pull origin main
git worktree list
# 該当 worktree があれば: git worktree remove .worktrees/<branch> --force
```

---

## 後続タスク（本プラン外）

- 未来日 md ファイル（`aspects/diet/events/2026-XX-XX.md` 等の今日以降）を掃除するスクリプト `cleanup-future-md.ts`。「今日以降は Notion only」を物理的に保証する。
- Action 失敗時の通知（Slack / GitHub Discussions）。現状は失敗しても気付きにくい。
- 複数日バックフィルの自動化（最終 sync コミットの日付を git log から拾って差分日数だけ sync）。
