# Defer ルール（厳守）

トークン消費が大きそうなタスクが投げられたら、**着手前に**ユーザーに defer 提案する。承諺を得たら beads キューに保存して現セッションでは実行しない。次セッション以降に `/resume` で再開する。

## 重さ判断ヒューリスティック（着手前に見積もる）

以下のいずれかに該当したら「重い」と判断する:

- **読むファイル 30 件以上** が必要（grep / find で範囲を見るのは別、実際に Read するのが多い場合）
- **Subagent 並列 3 個以上**（Explore / general-purpose / Plan agent を複数同時起動）
- **大規模生成**: スキル丸ごと、長尺の Plan、ファイル多数の refactor、md 全面書き換え
- **ループ系**: `/loop` で 10 反復以上、全件処理（Notion DB 全件読込、ログ全量解析等）
- **大量データ整形・抽出**: ログ全量、Notion DB 全件、リポジトリ全 md など
- **ユーザー発言の量化表現**: 「全部」「一括」「100 件」「全件」「片っ端から」「全数」

軽いタスク（3〜5 ファイル編集、1 つの skill 呼び出し、特定ファイルの review 等）は defer しない。

## 該当時の手順

1. **着手前に**ユーザーに defer 提案（AskUserQuestion 1 問、推奨 = defer）
2. 承諺 → 下記「bd 操作テンプレ」で登録、現セッションでは実行しない
3. 拒否（「いや、やって」等）→ そのまま実行

## bd 操作テンプレ（defer / resume スキル両方が参照する）

### defer 登録

```bash
RECIPE=$(cat <<'EOF'
## 元プロンプト

> ユーザーの元発言（一字一句コピペ）

## 想定出力

- 何を作る/返すのか（コード変更、レポート、PR 等）

## 実行レシピ

### 読むべきファイル

- /workspaces/life/path/to/file.ts
- ...

### 手順

1. ...
2. ...

### 注意点・落とし穴

- ...

## 関連コンテキスト

- 直前の会話で出た判断・前提（次セッションでは会話履歴は失われている）
- 関連 commit / PR / Notion ページ
EOF
)

echo "$RECIPE" | bd create "<10 字程度の短いタイトル>" \
  -t task \
  -p 2 \
  -l defer \
  --description=- \
  --json
```

返却される `id`（例: `life-a3f`）を後続オペレーションで使う。

### チェックポイント（実行中に進捗を残す）

```bash
bd update <id> --append-notes "checkpoint: read 5/10 files, drafted function A" --json
```

`/resume` を中断する場合、必ずこれを書いてから手放す。次回再開時に notes を読んで続きから着手できる。

### 依存関係（B は A 完了後）

```bash
bd dep add <B-id> <A-id>
```

`bd ready -l defer` は A 完了まで B を返さなくなる。

### 再開フロー（/resume が呼ぶ）

```bash
bd ready -l defer --json                          # ready なものを抽出（priority 順）
bd update <id> --claim --json                     # claim（in_progress + assignee）
bd show <id> --json                               # description + notes 取得
# ... 実行 ...
bd close <id> --reason "<完了メッセージ>" --json  # 完了
```

## bd 関連の注意

- **`-C` フラグはない** — bd には git のような `-C <dir>` 形式がない。`.beads/` は cwd 自動検出される（/workspaces/life で実行する）
- **stealth モード** — `.beads/` は gitignored、ローカル Dolt DB のみ。複数デバイス sync は v1 では非対応
- **既存 git hooks** — `.git/hooks/pre-commit` と `post-merge` に bd 関連処理があるが、Dolt backend 検出時は no-op するので干渉しない

## やらないこと

- defer 提案を**勝手にスキップ**しない（軽そうに見えても、量化表現があれば必ず提案する）
- defer 提案後に**勝手に実行を始め**ない（ユーザー承諺なしに動かない）
- 提案を**選択肢として並べ**ない（推奨 = defer を明示する）
- 元プロンプトを**要約**しない（将来の自分が読むので一字一句コピペ）
