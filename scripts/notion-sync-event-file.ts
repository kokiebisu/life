#!/usr/bin/env bun
/**
 * イベントファイル → Notion 同期（4 DB対応）
 *
 * 指定されたイベントファイルをパースし、パスに応じた Notion DB と同期する。
 * TSU-ID（優先）またはタイトル類似度でマッチング。
 *
 * パス → DB ルーティング:
 *   aspects/diet/events/    → meals DB
 *   aspects/guitar/events/  → guitar DB
 *   planning/events/        → events DB
 *   それ以外                → events DB
 *
 * 使い方:
 *   bun run scripts/notion-sync-event-file.ts --file planning/events/2026-02-19.md
 *   bun run scripts/notion-sync-event-file.ts --file aspects/diet/events/2026-02-14.md --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import {
  type ScheduleDbName, type ScheduleDbConfig,
  getScheduleDbConfig, notionFetch, parseArgs, pickTaskIcon, pickCover,
} from "./lib/notion";

const ROOT = join(import.meta.dir, "..");

// --- Types ---

interface ParsedEvent {
  done: boolean;
  startTime: string; // "14:00" or ""
  endTime: string;   // "16:30" or ""
  allDay: boolean;
  title: string;     // "Venture Cafe Global Gathering 2026（虎ノ門ヒルズ/CIC Tokyo）"
  description: string;
  tsuId: string | null; // "TSU-241" or null
}

// --- Path-based DB routing ---

function resolveDbFromPath(filePath: string): ScheduleDbName {
  if (filePath.includes("/diet/")) return "meals";
  if (filePath.includes("/guitar/")) return "guitar";
  return "events";
}

// --- Parsing ---

function parseEventFile(filePath: string): { date: string; events: ParsedEvent[] } {
  const content = readFileSync(filePath, "utf-8");
  const dateMatch = basename(filePath).match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  if (!dateMatch) {
    throw new Error(`Invalid event file name: ${basename(filePath)}`);
  }
  const date = dateMatch[1];

  const events: ParsedEvent[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match: - [ ] 14:00-16:30 Title or - [x] 14:00-16:30 Title or - [ ] 終日 Title
    const eventMatch = line.match(/^- \[([ x])\]\s+(?:(\d{1,2}:\d{2})\s*[-–〜]\s*(\d{1,2}:\d{2})\s+|終日\s+)?(.+)$/);
    if (!eventMatch) continue;

    const done = eventMatch[1] === "x";
    const startTime = eventMatch[2] ? eventMatch[2].padStart(5, "0") : "";
    const endTime = eventMatch[3] ? eventMatch[3].padStart(5, "0") : "";
    const allDay = !eventMatch[2];
    const title = eventMatch[4].trim();

    // Collect description lines (indented with 2+ spaces starting with "- ")
    const descLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && lines[j].match(/^\s{2,}-\s/)) {
      descLines.push(lines[j].replace(/^\s{2,}-\s/, "").trim());
      j++;
    }

    const description = descLines.join("\n");

    // Extract TSU-ID from description
    const tsuMatch = description.match(/\b(TSU-\d+)\b/);
    const tsuId = tsuMatch ? tsuMatch[1] : null;

    events.push({ done, startTime, endTime, allDay, title, description, tsuId });
  }

  return { date, events };
}

// --- Matching ---

function normalizeTitle(title: string): string {
  return title
    .replace(/[（）()]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function titlesMatch(local: string, notion: string): boolean {
  const a = normalizeTitle(local);
  const b = normalizeTitle(notion);
  return a.includes(b) || b.includes(a);
}

function findMatchingPage(
  event: ParsedEvent,
  notionPages: any[],
  config: ScheduleDbConfig,
): { page: any; matchType: "tsu-id" | "title" } | null {
  // Priority 1: TSU-ID match
  if (event.tsuId) {
    for (const page of notionPages) {
      const richText = page.properties?.[config.descProp]?.rich_text || [];
      const desc = richText.map((seg: any) => seg.plain_text || "").join("");
      if (desc.includes(event.tsuId)) {
        return { page, matchType: "tsu-id" };
      }
    }
  }

  // Priority 2: Title similarity
  const notionTitle = (p: any) =>
    (p.properties?.[config.titleProp]?.title || []).map((t: any) => t.plain_text || "").join("");

  for (const page of notionPages) {
    if (titlesMatch(event.title, notionTitle(page))) {
      return { page, matchType: "title" };
    }
  }

  return null;
}

// --- Notion property builders ---

function buildProperties(event: ParsedEvent, date: string, config: ScheduleDbConfig): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [config.titleProp]: { title: [{ text: { content: event.title } }] },
  };

  if (event.allDay) {
    properties[config.dateProp] = { date: { start: date } };
  } else {
    const dateObj: Record<string, string> = {
      start: `${date}T${event.startTime}:00+09:00`,
    };
    if (event.endTime) {
      dateObj.end = `${date}T${event.endTime}:00+09:00`;
    }
    properties[config.dateProp] = { date: dateObj };
  }

  if (event.description) {
    properties[config.descProp] = { rich_text: [{ text: { content: event.description } }] };
  }

  if (event.done) {
    properties[config.statusProp] = { status: { name: "Done" } };
  }

  return properties;
}

function diffProperties(
  event: ParsedEvent,
  date: string,
  existingPage: any,
  config: ScheduleDbConfig,
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};
  let hasChanges = false;

  // Compare title
  const existingTitle = (existingPage.properties?.[config.titleProp]?.title || [])
    .map((t: any) => t.plain_text || "").join("");
  if (existingTitle !== event.title) {
    updates[config.titleProp] = { title: [{ text: { content: event.title } }] };
    hasChanges = true;
  }

  // Compare date (normalize to ignore .000 milliseconds from Notion)
  const normalizeDate = (d: string | undefined) => d?.replace(/\.000\+/, "+");
  const existingDate = existingPage.properties?.[config.dateProp]?.date;
  if (event.allDay) {
    if (existingDate?.start !== date || existingDate?.end) {
      updates[config.dateProp] = { date: { start: date } };
      hasChanges = true;
    }
  } else {
    const expectedStart = `${date}T${event.startTime}:00+09:00`;
    const expectedEnd = event.endTime ? `${date}T${event.endTime}:00+09:00` : undefined;
    if (normalizeDate(existingDate?.start) !== expectedStart || normalizeDate(existingDate?.end) !== expectedEnd) {
      const dateObj: Record<string, string> = { start: expectedStart };
      if (expectedEnd) dateObj.end = expectedEnd;
      updates[config.dateProp] = { date: dateObj };
      hasChanges = true;
    }
  }

  // Compare description
  const existingDesc = (existingPage.properties?.[config.descProp]?.rich_text || [])
    .map((t: any) => t.plain_text || "").join("");
  if (event.description && existingDesc !== event.description) {
    updates[config.descProp] = { rich_text: [{ text: { content: event.description } }] };
    hasChanges = true;
  }

  // Compare status (only set to Done, never revert)
  if (event.done) {
    const existingStatus = existingPage.properties?.[config.statusProp]?.status?.name;
    if (existingStatus !== "Done") {
      updates[config.statusProp] = { status: { name: "Done" } };
      hasChanges = true;
    }
  }

  return hasChanges ? updates : null;
}

// --- Main ---

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const filePath = opts.file;

  if (!filePath) {
    console.error("Usage: bun run scripts/notion-sync-event-file.ts --file <path> [--dry-run]");
    process.exit(1);
  }

  const absPath = filePath.startsWith("/") ? filePath : join(ROOT, filePath);
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("[DRY RUN] Preview mode - no changes will be made\n");
  }

  const { date, events } = parseEventFile(absPath);
  if (events.length === 0) {
    console.log(`No events found in ${filePath}`);
    return;
  }

  const dbName = resolveDbFromPath(filePath);
  console.log(`Syncing ${events.length} event(s) from ${date} → Notion [${dbName}]...`);

  const { apiKey, dbId, config } = getScheduleDbConfig(dbName);

  // Query Notion for events on this date
  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: {
      and: [
        { property: config.dateProp, date: { on_or_after: `${date}T00:00:00+09:00` } },
        { property: config.dateProp, date: { on_or_before: `${date}T23:59:59+09:00` } },
      ],
    },
  });
  const notionPages: any[] = data.results || [];

  let created = 0, updated = 0, skipped = 0;

  for (const event of events) {
    const match = findMatchingPage(event, notionPages, config);

    if (match) {
      // Existing page — check for diff
      const diff = diffProperties(event, date, match.page, config);
      if (diff) {
        console.log(`  UPDATE (${match.matchType}): ${event.title}`);
        if (!dryRun) {
          await notionFetch(apiKey, `/pages/${match.page.id}`, { properties: diff }, "PATCH");
        }
        updated++;
      } else {
        console.log(`  SKIP: ${event.title} (no changes)`);
        skipped++;
      }
    } else {
      // New event — create
      const properties = buildProperties(event, date, config);
      const icon = pickTaskIcon(event.title);
      const cover = pickCover(event.title);
      console.log(`  CREATE: ${event.title}`);
      if (!dryRun) {
        await notionFetch(apiKey, "/pages", { parent: { database_id: dbId }, properties, icon, cover });
      }
      created++;
    }
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
