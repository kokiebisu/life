#!/usr/bin/env bash
# SessionStart hook: pending-context があれば systemMessage として注入する
#
# main worktree のセッションが ./dev <branch> で新ウィンドウを開く前に
# .claude/pending-context/<branch>.md にトピック・必要 context を書き出しておく。
# 新ウィンドウのセッションが起動した時、cwd（worktree path）から branch 名を抽出し
# 対応するファイルがあれば内容を systemMessage として返す + 該当ファイルを削除する。
set -euo pipefail

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# cwd が .worktrees/<branch> 配下の場合のみ動作
if [[ "$CWD" =~ \.worktrees/(.+)$ ]]; then
  BRANCH="${BASH_REMATCH[1]}"
  CTX_FILE="/workspaces/life/.claude/pending-context/$BRANCH.md"

  if [ -f "$CTX_FILE" ]; then
    CONTENT=$(cat "$CTX_FILE")
    rm "$CTX_FILE"  # 一回読み（次回起動時に再注入されないように）
    jq -n --arg msg "$CONTENT" '{systemMessage: $msg}'
    exit 0
  fi
fi

exit 0
