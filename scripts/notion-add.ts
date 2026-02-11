#!/usr/bin/env bun
/**
 * Notion タスク・イベント追加
 *
 * 使い方:
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30 --desc "説明文"
 *   bun run scripts/notion-add.ts --title "買い出し" --date 2026-02-14 --allday
 */

import { getTasksConfig, notionFetch, parseArgs } from "./lib/notion";

function main() {
  const { flags, opts } = parseArgs();
  if (!opts.title || !opts.date) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --start HH:MM --end HH:MM");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --allday");
    console.error("  Options: --desc <description>");
    process.exit(1);
  }

  const { apiKey, dbId } = getTasksConfig();

  const properties: Record<string, unknown> = {
    "Name": { title: [{ text: { content: opts.title } }] },
  };

  if (flags.has("allday")) {
    properties["Due date"] = { date: { start: opts.date } };
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
    properties["Due date"] = { date: dateObj };
  }

  if (opts.desc) {
    properties["Description"] = { rich_text: [{ text: { content: opts.desc } }] };
  }

  return notionFetch(apiKey, "/pages", { parent: { database_id: dbId }, properties })
    .then((data: any) => {
      const title = data.properties.Name.title[0].plain_text;
      const date = data.properties["Due date"].date;
      console.log(`追加しました: ${title}`);
      if (date.end) {
        console.log(`  ${date.start} 〜 ${date.end}`);
      } else {
        console.log(`  ${date.start}`);
      }
    });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
