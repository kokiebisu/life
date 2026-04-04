#!/usr/bin/env bun
/**
 * Notion ページ削除（ゴミ箱に移動）
 *
 * 使い方:
 *   bun run scripts/notion-delete.ts <page-id> [<page-id> ...]
 *   bun run scripts/notion-delete.ts 309ce17f-7b98-8194-bc0f-e3a6534cefdf
 */

import { getApiKey, notionFetch, clearNotionCache } from "./lib/notion";

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (ids.length === 0) {
    console.error("Usage: bun run scripts/notion-delete.ts <page-id> [<page-id> ...]");
    process.exit(1);
  }

  const apiKey = getApiKey();
  clearNotionCache();

  for (const id of ids) {
    const data = await notionFetch(apiKey, `/pages/${id}`, { archived: true }, "PATCH");
    const title =
      Object.values(data.properties || {})
        .find((p: any) => p.type === "title")
        ?.title?.map((t: any) => t.plain_text || "")
        .join("") || id;
    console.log(`削除しました: ${title}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
