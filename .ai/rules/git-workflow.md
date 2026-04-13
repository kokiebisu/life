# Git Workflow

## Commit Message Format
```
<type>: <description>
```
Types: feat, fix, refactor, docs, chore

## コミット後の PR 作成（厳守）
- コミット後は自動で `/pr` を実行する（ユーザーに確認不要）
- PR にはそのセッションで変更されたコミットのみ含める（他の未プッシュコミットは含めない）

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
