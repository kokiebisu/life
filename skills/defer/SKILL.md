---
name: defer
description: 重そうなタスクをトークンリセット後に回したいとき。「これ defer」「あとで」「これ重そう」などに使う。直前または引数のタスクを beads キュー（label=defer）に保存する。
---

# Defer - タスクを後回しにする

Claude が自動判断する場合は `.ai/rules/defer.md` のヒューリスティックで提案する。本スキルはユーザーが**明示的に**呼ぶケース用。

## 引数

`$ARGUMENTS` — defer したい指示の補足（省略可）

- 省略時: 直前の会話から defer 対象を抽出して提案する
- 指定時: その内容を defer 対象として登録する

## Step 1: 対象の特定

引数なしの場合: 直前のユーザーメッセージ（とそれに対する Claude の見立て）から、何を defer するかを Claude が抽出する。曖昧なら AskUserQuestion で 1 問だけ確認。

引数ありの場合: `$ARGUMENTS` を defer 対象とする。

## Step 2: 実行レシピの作成

`.ai/rules/defer.md` の「bd 操作テンプレ」に従って `RECIPE` を組み立てる。**元プロンプトは要約せず一字一句コピペする。** 次セッションの自分が読むので、現セッション特有の文脈（直前の会話で決まった前提、参照ファイルの絶対パス、関連 PR 等）も含める。

## Step 3: bd 登録

```bash
echo "$RECIPE" | bd create "<短いタイトル>" -t task -p 2 -l defer --description=- --json
```

返却された `id` をユーザーに報告する（例: 「`life-a3f` で defer したよ。`/resume` で再開できる」）。

## Step 4: 現セッションでは実行しない

defer 直後は元のタスクに戻らず、別の話題に進める。「defer したから今はやらない」を明示する。

## 依存関係を指定したい場合

ユーザーが「これは X が終わってから」と言った場合:

1. X に対応する bd issue id を `bd list -l defer --json` で探す
2. `bd dep add <new-id> <X-id>` で依存追加
3. `/resume` 時に X が closed になるまで new-id は ready に出ない

## 関連

- 自動 defer 提案: `.ai/rules/defer.md`
- 再開: `/resume`
