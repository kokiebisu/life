#!/usr/bin/env bun
/**
 * Notion タスク・イベント追加（4 DB対応）
 *
 * 使い方:
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30 --desc "説明文"
 *   bun run scripts/notion-add.ts --title "買い出し" --date 2026-02-14 --start 10:00 --end 11:00
 *   bun run scripts/notion-add.ts --title "イベント" --date 2026-02-14 --start 14:00 --end 16:00 --db events
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:00 --end 18:00 --db guitar
 */

import { type DbName, getDbConfig, notionFetch, parseArgs, pickTaskIcon, pickCover } from "./lib/notion";

function main() {
  const { flags, opts } = parseArgs();
  if (!opts.title || !opts.date) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --start HH:MM --end HH:MM");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --allday");
    console.error("  Options: --desc <description> --db <routine|events|guitar|meals>");
    process.exit(1);
  }

  const dbName = (opts.db || "routine") as DbName;
  const { apiKey, dbId, config } = getDbConfig(dbName);

  const properties: Record<string, unknown> = {
    [config.titleProp]: { title: [{ text: { content: opts.title } }] },
  };

  if (flags.has("allday")) {
    properties[config.dateProp] = { date: { start: opts.date } };
  } else {
    if (!opts.start) {
      console.error("Error: --start required (or use --allday)");
      process.exit(1);
    }
    const dateObj: Record<string, string> = {
      start: `${opts.date}T${opts.start}:00+09:00`,
    };
    if (opts.end) {
      dateObj.end = `${opts.date}T${opts.end}:00+09:00`;
    }
    properties[config.dateProp] = { date: dateObj };
  }

  if (opts.desc) {
    properties[config.descProp] = { rich_text: [{ text: { content: opts.desc } }] };
  }

  const icon = pickTaskIcon(opts.title);
  const cover = pickCover(opts.title);

  return notionFetch(apiKey, "/pages", { parent: { database_id: dbId }, properties, icon, cover })
    .then((data: any) => {
      const title = (data.properties[config.titleProp]?.title || [])
        .map((t: any) => t.plain_text || "").join("");
      const date = data.properties[config.dateProp]?.date;
      console.log(`追加しました: ${title} [${dbName}]`);
      if (date?.end) {
        console.log(`  ${date.start} 〜 ${date.end}`);
      } else if (date?.start) {
        console.log(`  ${date.start}`);
      }
    });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
