# Git Workflow

## Commit Message Format
```
<type>: <description>
```
Types: feat, fix, refactor, docs, chore

## main への直接コミット禁止 / worktree 必須（厳守）

**PR を出すときは必ず git worktree を使う。** main への直接コミット・プッシュ禁止。

```bash
# 1. unstaged changes があれば stash
git stash

# 2. worktree を作成（main から feature ブランチ）
BRANCH="<type>/<short-description>"
git worktree add .worktrees/$BRANCH -b $BRANCH

# 3. worktree 内で作業
cd .worktrees/$BRANCH
git stash pop   # stash した場合のみ
git add <files>
git commit -m "..."
git push -u origin HEAD
gh pr create ...

# 4. マージ後に worktree を削除
cd /workspaces/life
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH 2>/dev/null || true
git pull origin main
```

セッションごとに worktree を作成して影響範囲を分離すること。

## セッション開始時の worktree チェック（厳守）

セッション開始時に `git worktree list` で残存 worktree を確認する。main 以外の worktree があれば:

1. 各ブランチの PR 状態を `gh pr list --head <branch> --state all` で確認
2. **マージ済み PR あり** → worktree を削除（`git worktree remove --force` + `git branch -D`）
3. **PR なし・未マージ** → ユーザーに報告し、削除 or 継続を確認
4. 確認後 `git pull origin main` で main を最新にする

放置 worktree は main と乖離してマージ不能になるため、早めに処理する。

## コミット後の PR 作成（厳守）
- コミット後は自動で `/pr` を実行する（ユーザーに確認不要）
- PR にはそのセッションで変更されたコミットのみ含める（他の未プッシュコミットは含めない）

## `gh pr create` 失敗時のフォールバック（厳守）

`gh pr create` が "No commits between main and ..." エラーで失敗した場合、**即座に `gh api` で直接 PR を作成する。** リトライしない。

```bash
gh api repos/kokiebisu/life/pulls --method POST \
  --field title="<title>" \
  --field head="<branch>" \
  --field base="main" \
  --field body="<body>"
```

## unstaged changes がある状態での操作（厳守）

`git pull` / `git checkout` がエラーになっても `git reset --hard` で解決しない。

1. `git stash` で変更を退避する
2. 操作を実行する（pull / checkout 等）
3. `git stash pop` で変更を戻す

`git reset --hard` を実行する前は必ず `git status` で unstaged changes がないことを確認すること。

## Submodule（sumitsugi）
- `projects/sumitsugi` のサブモジュールポインタ変更は PR に含めない
- サブモジュールの更新は sumitsugi リポジトリ側で管理する
- `git status` に出ても基本スキップする
