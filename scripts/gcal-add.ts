#!/usr/bin/env bun
/**
 * Google Calendar 予定追加（Apps Script 経由）
 *
 * 使い方:
 *   bun run scripts/gcal-add.ts --title "ジム見学" --date 2026-02-14 --start 12:00 --end 13:00
 *   bun run scripts/gcal-add.ts --title "読書" --date 2026-02-14 --allday
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
    console.error("Run the Apps Script setup first. See scripts/gcal-apps-script.js");
    process.exit(1);
  }

  return { url, secret };
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
    console.error("  bun run scripts/gcal-add.ts --title <title> --date YYYY-MM-DD --start HH:MM --end HH:MM");
    console.error("  bun run scripts/gcal-add.ts --title <title> --date YYYY-MM-DD --allday");
    process.exit(1);
  }

  const { url, secret } = getConfig();

  const body: Record<string, unknown> = {
    title: opts.title,
  };

  if (opts.allday) {
    body.allDay = true;
    body.date = opts.date;
  } else {
    if (!opts.start || !opts.end) {
      console.error("Error: --start and --end required (or use --allday)");
      process.exit(1);
    }
    body.start = `${opts.date}T${opts.start}:00+09:00`;
    body.end = `${opts.date}T${opts.end}:00+09:00`;
  }

  if (opts.description) body.description = opts.description;
  if (opts.location) body.location = opts.location;

  const res = await fetch(`${url}?action=add&secret=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json() as Record<string, unknown>;
  console.log(`予定を追加しました: ${data.title}`);
  if (data.start) {
    const start = new Date(data.start as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const end = new Date(data.end as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    console.log(`  ${start} - ${end}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
