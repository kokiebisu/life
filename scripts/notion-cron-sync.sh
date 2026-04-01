#!/bin/bash
# 毎朝 cron で昨日の Notion データを md に同期する

set -e
cd ~/life

# macOS の date コマンドで昨日を計算
YESTERDAY=$(date -v-1d "+%Y-%m-%d")

echo "[$(date "+%Y-%m-%d %H:%M:%S")] Starting Notion sync for $YESTERDAY"

# Notion → md 同期（昨日分、全エントリ、enrich なし）
bun run scripts/notion-pull.ts --date "$YESTERDAY" --all-entries --no-enrich

# 変更があれば commit
if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git add -A
  git commit -m "chore: sync from notion $YESTERDAY"
  echo "Committed."
fi

echo "[$(date "+%Y-%m-%d %H:%M:%S")] Done."
