#!/usr/bin/env bun
/**
 * Notion タスク・イベント追加
 *
 * 使い方:
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30 --desc "説明文"
 *   bun run scripts/notion-add.ts --title "買い出し" --date 2026-02-14 --allday
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const ENV_FILE = join(ROOT, ".env.local");

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return env;
  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[trimmed.slice(0, eqIdx).trim()] = val;
  }
  return env;
}

function getConfig() {
  const env = loadEnv();
  const apiKey = env["NOTION_API_KEY"] || process.env.NOTION_API_KEY;
  const dbId = env["NOTION_TASKS_DB"] || process.env.NOTION_TASKS_DB;
  if (!apiKey || !dbId) {
    console.error("Error: NOTION_API_KEY and NOTION_TASKS_DB must be set in .env.local");
    process.exit(1);
  }
  return { apiKey, dbId };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  let allday = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--allday") {
      allday = true;
    } else if (args[i].startsWith("--") && args[i + 1]) {
      opts[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return { ...opts, allday };
}

async function main() {
  const opts = parseArgs();
  if (!opts.title || !opts.date) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --start HH:MM --end HH:MM");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --allday");
    console.error("  Options: --desc <description>");
    process.exit(1);
  }

  const { apiKey, dbId } = getConfig();

  const properties: Record<string, unknown> = {
    "Name": { title: [{ text: { content: opts.title } }] },
  };

  if (opts.allday) {
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

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`Error: ${res.status} ${(err as any).message}`);
    process.exit(1);
  }

  const data = await res.json() as any;
  const title = data.properties.Name.title[0].plain_text;
  const date = data.properties["Due date"].date;
  console.log(`追加しました: ${title}`);
  if (date.end) {
    console.log(`  ${date.start} 〜 ${date.end}`);
  } else {
    console.log(`  ${date.start}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
