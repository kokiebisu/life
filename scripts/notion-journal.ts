#!/usr/bin/env bun
/**
 * Notion ジャーナル操作
 *
 * 使い方:
 *   bun run scripts/notion-journal.ts add --date 2026-02-14 --mood good --body "今日は..."
 *   bun run scripts/notion-journal.ts list --days 7
 *   bun run scripts/notion-journal.ts list --date 2026-02-14
 *   bun run scripts/notion-journal.ts today
 */

import { getApiKey, getDbIdOptional, notionFetch, parseArgs, todayJST, pickJournalIcon, pickCover } from "./lib/notion";

const MOOD_MAP: Record<string, string> = {
  good: "😊 良い",
  ok: "😐 普通",
  bad: "😞 イマイチ",
};

function getJournalConfig() {
  const dbId = getDbIdOptional("NOTION_JOURNAL_DB");
  if (!dbId) {
    console.error("NOTION_JOURNAL_DB が未設定です。.env.local に設定してください。");
    process.exit(1);
  }
  return { apiKey: getApiKey(), dbId };
}

async function addEntry(opts: Record<string, string>) {
  const date = opts.date || todayJST();
  const moodKey = opts.mood || "ok";
  const mood = MOOD_MAP[moodKey];
  if (!mood) {
    console.error(`Error: --mood must be one of: ${Object.keys(MOOD_MAP).join(", ")}`);
    process.exit(1);
  }
  const body = opts.body;
  if (!body) {
    console.error("Error: --body is required");
    process.exit(1);
  }

  const { apiKey, dbId } = getJournalConfig();

  const properties: Record<string, unknown> = {
    "Name": { title: [{ text: { content: date } }] },
    "Date": { date: { start: date } },
    "Mood": { select: { name: mood } },
    "Body": { rich_text: [{ text: { content: body } }] },
  };

  const icon = pickJournalIcon(mood);
  const cover = pickCover("journal");

  const data = await notionFetch(apiKey, "/pages", {
    parent: { database_id: dbId },
    properties,
    icon,
    cover,
  });

  const title = data.properties.Name.title[0].plain_text;
  const moodVal = data.properties.Mood.select.name;
  console.log(`日記を追加しました: ${title} ${moodVal}`);
}

async function listEntries(opts: Record<string, string>) {
  const { apiKey, dbId } = getJournalConfig();

  let startDate: string, endDate: string;
  if (opts.date) {
    startDate = opts.date;
    endDate = opts.date;
  } else {
    const days = opts.days ? parseInt(opts.days, 10) : 7;
    const now = new Date();
    const end = todayJST();
    const start = new Date(now.getTime() - (days - 1) * 86400000);
    startDate = start.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    endDate = end;
  }

  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: {
      and: [
        { property: "Date", date: { on_or_after: startDate } },
        { property: "Date", date: { on_or_before: endDate } },
      ],
    },
    sorts: [{ property: "Date", direction: "descending" }],
  });

  if (data.results.length === 0) {
    console.log("日記なし");
    return;
  }

  for (const page of data.results) {
    const props = page.properties;
    const date = props.Date?.date?.start || "";
    const mood = props.Mood?.select?.name || "";
    const body = props.Body?.rich_text?.[0]?.plain_text || "";
    console.log(`\n${date} ${mood}`);
    if (body) console.log(`  ${body}`);
  }
  console.log("");
}

async function showToday() {
  const today = todayJST();
  const { apiKey, dbId } = getJournalConfig();

  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: { property: "Date", date: { equals: today } },
  });

  if (data.results.length === 0) {
    console.log(`${today} の日記はまだありません`);
    return;
  }

  for (const page of data.results) {
    const props = page.properties;
    const mood = props.Mood?.select?.name || "";
    const body = props.Body?.rich_text?.[0]?.plain_text || "";
    console.log(`${today} ${mood}`);
    if (body) console.log(`  ${body}`);
  }
}

async function main() {
  const { opts, positional } = parseArgs();
  const command = positional[0];

  if (!command) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-journal.ts add --date YYYY-MM-DD --mood good|ok|bad --body \"...\"");
    console.error("  bun run scripts/notion-journal.ts list [--days 7] [--date YYYY-MM-DD]");
    console.error("  bun run scripts/notion-journal.ts today");
    process.exit(1);
  }

  switch (command) {
    case "add":
      await addEntry(opts);
      break;
    case "list":
      await listEntries(opts);
      break;
    case "today":
      await showToday();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
