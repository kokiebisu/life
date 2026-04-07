キャッシュの管理。引数: $ARGUMENTS

引数に応じて以下を実行:

- 引数なし or "status": `bun run scripts/cache-status.ts` でキャッシュステータスを表示
- "clear": `bun run scripts/cache-status.ts --clear` で /tmp のキャッシュをクリア
- "clear all": `bun run scripts/cache-status.ts --clear --all` で永続キャッシュも含めて全クリア
- "analyze": `bun run scripts/cache-status.ts --analyze` でヒット率・節約効果を分析
- "json": `bun run scripts/cache-status.ts --json` でJSON出力
