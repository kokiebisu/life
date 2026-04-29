---
name: resume
description: defer したタスクを再開するとき。「resume」「さっきの続き」「defer した何かやろう」などに使う。bd ready -l defer から選んで実行する。
---

# Resume - defer したタスクを再開する

`bd ready -l defer --json` で依存解消済み・未着手の defer タスクを抽出し、ユーザーに選ばせて実行する。

## Step 1: ready リスト取得

```bash
bd ready -l defer --json
```

結果が空なら「defer キューに ready なタスクがないよ」と報告して終了。in_progress のものは `bd list -l defer --status in_progress --json` で別途確認できる旨を補足。

## Step 2: ユーザーに選ばせる

AskUserQuestion で最大 4 件提示。優先度順 → 作成日新しい順。各オプションに `id` / `title` / `priority` / `created_at` を含める。

5 件以上ある場合は「他にも N 件 ready がある。これでいい？」と一言添える（古いものを忘れさせないため）。

## Step 3: claim

```bash
bd update <id> --claim --json
```

status が `in_progress` になり assignee がセットされる。

## Step 4: 内容を読む

```bash
bd show <id> --json
```

返却される `description`（実行レシピ）と `notes`（過去のチェックポイント、あれば）を読む。**notes に checkpoint が残っている場合、その続きから着手する。** 最初からやり直さない。

## Step 5: 実行

レシピに従って実行する。実行中、進捗の節目で必ず checkpoint を残す:

```bash
bd update <id> --append-notes "checkpoint: <進捗>" --json
```

特に以下のタイミング:

- 大きなフェーズ完了時（読み込み完了、設計完了、実装完了 等）
- 中断する場合（手放す前に必ず）

## Step 6: 完了 or 中断

### 完了

```bash
bd close <id> --reason "<完了メッセージ>" --json
```

その後、変更ファイルがあれば自動コミットフロー（`.ai/rules/git-workflow.md`）に従って worktree 経由で commit / PR を作る。defer タスク 1 件 = 1 PR が基本。

### 中断（部分的に進んだが今セッションでは終わらない）

```bash
bd update <id> --append-notes "checkpoint: <最後にどこまで進んだか>" --json
```

status は `in_progress` のままで OK。次回 `/resume` で `bd list -l defer --status in_progress --json` から拾える。

## 依存解消後の確認

A タスクを close した後、それに依存していた B が ready になったかもしれない。close 直後に `bd ready -l defer --json` をもう一度叩いて、新しく ready になったものをユーザーに報告する（「A 完了したから B が ready になったよ。続けてやる？」）。

## 関連

- defer 登録: `/defer` または `.ai/rules/defer.md` 経由の自動提案
- 一覧確認: `bd list -l defer --json`（status=open のもの全部）