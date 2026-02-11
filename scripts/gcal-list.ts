#!/usr/bin/env bun
/**
 * Google Calendar 予定取得（Apps Script 経由）
 *
 * 使い方:
 *   bun run scripts/gcal-list.ts              # 今日の予定
 *   bun run scripts/gcal-list.ts --days 7     # 今後7日間の予定
 *   bun run scripts/gcal-list.ts --date 2026-02-14  # 指定日の予定
 *   bun run scripts/gcal-list.ts --json       # JSON出力
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
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

function getConfig() {
  const env = loadEnv();
  const url = env["GCAL_APPS_SCRIPT_URL"] || process.env.GCAL_APPS_SCRIPT_URL;
  const secret = env["GCAL_SECRET"] || process.env.GCAL_SECRET;

  if (!url || !secret) {
    console.error("Error: GCAL_APPS_SCRIPT_URL and GCAL_SECRET must be set in .env.local");
    console.error("");
    console.error("Setup:");
    console.error("  1. Deploy scripts/gcal-apps-script.js to Google Apps Script");
    console.error("  2. Add to .env.local:");
    console.error("     GCAL_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec");
    console.error("     GCAL_SECRET=your-secret");
    process.exit(1);
  }

  return { url, secret };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let days = 1;
  let date: string | null = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--date" && args[i + 1]) {
      date = args[i + 1];
      i++;
    } else if (args[i] === "--json") {
      json = true;
    }
  }

  return { days, date, json };
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
}

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEvent(event: CalendarEvent): string {
  const location = event.location ? ` @ ${event.location}` : "";
  if (event.allDay) {
    return `  [終日] ${event.title}${location}`;
  }
  const start = formatTime(event.start);
  const end = formatTime(event.end);
  return `  ${start}-${end}  ${event.title}${location}`;
}

async function main() {
  const { days, date, json } = parseArgs();
  const { url, secret } = getConfig();

  const params = new URLSearchParams({ action: "list", secret });
  if (date) {
    params.set("date", date);
  } else {
    params.set("days", String(days));
  }

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    console.error(`Error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json() as { events: CalendarEvent[]; count: number };

  if (json) {
    console.log(JSON.stringify(data.events, null, 2));
    return;
  }

  if (data.count === 0) {
    console.log("予定なし");
    return;
  }

  // Group by date
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of data.events) {
    const d = event.start.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(event);
  }

  for (const [dateKey, dayEvents] of byDate) {
    const dateObj = new Date(dateKey + "T12:00:00+09:00");
    const label = dateObj.toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    console.log(`\n${label}`);
    for (const event of dayEvents) {
      console.log(formatEvent(event));
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
