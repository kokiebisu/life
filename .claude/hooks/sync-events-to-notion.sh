#!/usr/bin/env bash
# PostToolUse hook: イベントファイル編集時に Notion へ自動同期
#
# stdin から JSON を受け取り、file_path が planning/events/YYYY-MM-DD.md に
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

# Match planning/events/YYYY-MM-DD.md or aspects/*/events/YYYY-MM-DD.md
if ! echo "$FILE_PATH" | grep -qE '(planning|aspects/[^/]+)/events/[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$'; then
  exit 0
fi

# Make path relative to project root for the sync script
REL_PATH=$(echo "$FILE_PATH" | grep -oE '(planning|aspects/[^/]+)/events/[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$')

echo "Syncing event file to Notion: $REL_PATH" >&2

# Run sync (don't block Claude on failure)
cd "$PROJECT_DIR"
bun run scripts/notion-sync-event-file.ts --file "$REL_PATH" 2>&1 >&2 || {
  echo "Warning: Notion sync failed (non-blocking)" >&2
  exit 0
}

exit 0
