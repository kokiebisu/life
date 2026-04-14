#!/usr/bin/env bash
# PostToolUse hook: fridge.md 書き込み時に Notion へ自動同期
#
# stdin から JSON を受け取り、file_path が fridge.md に
# マッチする場合のみ同期スクリプトを実行する。
# 同期失敗時は exit 0 で Claude のワークフローをブロックしない。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read stdin JSON
INPUT=$(cat)

# Extract file_path from tool input
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Match fridge.md (anywhere in the path)
if ! echo "$FILE_PATH" | grep -q 'fridge\.md$'; then
  exit 0
fi

echo "fridge.md updated — syncing to Notion..." >&2

# Run sync (don't block Claude on failure)
cd "$PROJECT_DIR"
bun run scripts/notion/notion-fridge-sync.ts 2>&1 >&2 || {
  echo "Warning: fridge Notion sync failed (non-blocking)" >&2
  exit 0
}

exit 0
