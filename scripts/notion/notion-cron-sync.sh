#!/bin/bash
# 毎朝 cron で昨日の Notion データを md に同期する
# cron: 0 21 * * * /bin/bash /Users/home/life/scripts/notion-cron-sync.sh >> /Users/home/life/logs/notion-cron.log 2>&1

set -e
export PATH="$HOME/.bun/bin:$PATH"
cd /Users/home/life

# macOS の date コマンドで昨日を計算
YESTERDAY=$(date -v-1d "+%Y-%m-%d")

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Notion sync for $YESTERDAY"

# Notion → md 同期（昨日分、全エントリ、enrich なし）
bun run scripts/notion-pull.ts --date "$YESTERDAY" --all-entries --no-enrich

# 作り置き消費トラッキング（昨日の meals DB から fridge.md を自動更新）
bun run scripts/notion/notion-fridge-consume.ts --from "$YESTERDAY" --to "$YESTERDAY" || true

# fridge.md を Notion ページに同期（consume で更新された場合も含む）
bun run scripts/notion/notion-fridge-sync.ts || true

# 変更があれば commit
if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git add -A
  git commit -m "chore: sync from notion $YESTERDAY"
  echo "Committed."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."
