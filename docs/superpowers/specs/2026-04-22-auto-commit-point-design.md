# 自動コミットポイント設計

## 概要

セッション中に Claude がファイル変更の「切れ目」を判断し、worktree 作成 → コミット → PR → マージ → クリーンアップまで自動実行する。ユーザーへの確認は不要。

## 背景

- ルール上は「worktree 必須・main 直接コミット禁止」だが、セッション中にスキル（`/meal`、`/devotion` 等）が走ると main 上でファイルが変更される
- 変更が untracked/modified のまま溜まり、セッション終盤でまとめて PR になっていた
- ユーザーは Claude に「いいタイミング」で自動的に PR を出してマージしてほしい

## 設計

### コミットポイントの判断基準

Claude は以下の条件に該当したとき、未コミット変更をまとめて PR にする：

1. **スキル完了時** — `/meal`、`/devotion`、`/study`、`/kondate`、`/gym`、`/event` 等のスキルが完了し、ファイル変更が発生したとき
2. **話題の切り替わり時** — ユーザーが別トピックに移る発言をしたとき（「次は〜」「あと〜」等）、それまでの変更を先にコミット
3. **変更蓄積時** — 未コミットの変更ファイルがある状態で新しい作業に入ろうとしたとき

### 自動実行の手順

既存の worktree 手順に従う。違いは「ユーザーに確認せず自動実行する」点のみ：

1. `git stash` で変更を退避
2. worktree を作成（`git worktree add .worktrees/<branch> -b <branch>`）
3. worktree 内で `git stash pop` → `git add` → `git commit`
4. `git push -u origin HEAD`
5. `gh pr create` で PR 作成
6. `gh pr merge --merge --delete-branch` で即マージ
7. main に戻って worktree 削除 → `git pull origin main`

### PR の粒度

- 1コミットポイント = 1PR
- 変更をまとめすぎない（独立した操作は別 PR）

### 既存ルールとの関係

- 「main への直接コミット禁止」「worktree 必須」は維持
- 「コミット後は自動で `/pr` を実行」を拡張: 「切れ目で自動コミット + PR + マージ」に変更

## 実装方法

`git-workflow.md` に「自動コミットポイント」セクションを追加するのみ。コード変更なし。

## 対象外

- hooks や専用スキルによる機械的な自動化は行わない
- 運用してみて判断がブレるようなら、専用スキル化を検討する
