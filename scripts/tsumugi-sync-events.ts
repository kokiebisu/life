#!/usr/bin/env bun
/**
 * Tsumugi イベント同期
 *
 * beads の event ラベル付きタスクを planning/events/ と Notion イベントDB に登録する。
 * TSU-ID をキーに冪等性を保証。
 *
 * 使い方:
 *   bun run scripts/tsumugi-sync-events.ts            # 実行
 *   bun run scripts/tsumugi-sync-events.ts --dry-run   # プレビュー
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getDbConfig, notionFetch, parseArgs } from "./lib/notion";

const ROOT = join(import.meta.dir, "..");
const BEADS_FILE = join(ROOT, "projects/tsumugi/.beads/issues.jsonl");
const EVENTS_DIR = join(ROOT, "planning/events");

interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  due_at?: string;
  external_ref?: string;
  labels?: string[];
}

interface EventInfo {
  tsuId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  summary: string;
}

function extractTsuId(issue: BeadsIssue): string | null {
  const ref = issue.external_ref || "";
  const match = ref.match(/(TSU-\d+)/);
  return match ? match[1] : null;
}

function extractTime(description: string): { start: string; end: string; allDay: boolean } {
  const timeMatch = description.match(/(\d{1,2}:\d{2})\s*[-–〜]\s*(\d{1,2}:\d{2})/);
  if (timeMatch) {
    const start = timeMatch[1].padStart(5, "0");
    const end = timeMatch[2].padStart(5, "0");
    return { start, end, allDay: false };
  }
  if (description.includes("終日")) {
    return { start: "", end: "", allDay: true };
  }
  return { start: "", end: "", allDay: true };
}

function extractLocation(description: string): string {
  const match = description.match(/場所[:：]\s*(.+)/);
  if (match) {
    // Take first segment before newline, trim whitespace
    return match[1].trim().split("\n")[0].trim();
  }
  return "";
}

function buildSummary(description: string): string {
  const lines = description.split("\n");
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^[-*]\s*/, "").trim();
    if (trimmed.match(/^参加費[:：]/)) {
      parts.push(trimmed.replace(/^参加費[:：]\s*/, ""));
    }
    if (trimmed.match(/^規模[:：]/)) {
      parts.push(trimmed.replace(/^規模[:：]\s*/, ""));
    }
  }

  return parts.join("・");
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*に参加する/, "")
    .replace(/\s*を?する\s*$/, "")
    .replace(/\s*\(\d+\/\d+\s+.*?\)\s*$/, "")
    .replace(/\s*（\d+\/\d+\s+.*?）\s*$/, "")
    .trim();
}

function parseEvents(): EventInfo[] {
  if (!existsSync(BEADS_FILE)) {
    console.error(`Error: Beads file not found at ${BEADS_FILE}`);
    process.exit(1);
  }

  const content = readFileSync(BEADS_FILE, "utf-8");
  const events: EventInfo[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const issue: BeadsIssue = JSON.parse(line);

    if (issue.status !== "open") continue;
    if (!issue.due_at) continue;
    if (!(issue.labels || []).includes("event")) continue;

    const tsuId = extractTsuId(issue);
    if (!tsuId) continue;

    const date = issue.due_at.slice(0, 10);
    const { start, end, allDay } = extractTime(issue.description || "");
    const location = extractLocation(issue.description || "");
    const summary = buildSummary(issue.description || "");
    const title = cleanTitle(issue.title);

    events.push({ tsuId, date, title, startTime: start, endTime: end, allDay, location, summary });
  }

  return events;
}

function syncLocal(event: EventInfo, dryRun: boolean): "created" | "skipped" {
  const filePath = join(EVENTS_DIR, `${event.date}.md`);

  // Check if TSU-ID already exists
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    if (content.includes(event.tsuId)) {
      return "skipped";
    }
  }

  // Build event entry
  const timeStr = event.allDay ? "終日" : `${event.startTime}-${event.endTime}`;
  const locationStr = event.location ? `（${event.location}）` : "";
  const eventLine = `- [ ] ${timeStr} ${event.title}${locationStr}`;
  const detailParts = [event.summary, event.tsuId].filter(Boolean).join("。");
  const detailLine = `  - ${detailParts}`;

  if (dryRun) return "created";

  if (!existsSync(EVENTS_DIR)) {
    mkdirSync(EVENTS_DIR, { recursive: true });
  }

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf-8");
    writeFileSync(filePath, content.trimEnd() + "\n" + eventLine + "\n" + detailLine + "\n");
  } else {
    writeFileSync(filePath, `# ${event.date}\n\n${eventLine}\n${detailLine}\n`);
  }

  return "created";
}

async function syncNotion(
  event: EventInfo,
  apiKey: string,
  dbId: string,
  config: { titleProp: string; dateProp: string; descProp: string },
  dryRun: boolean,
): Promise<"created" | "skipped"> {
  // Query Notion for events on this date
  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: {
      and: [
        { property: config.dateProp, date: { on_or_after: event.date + "T00:00:00+09:00" } },
        { property: config.dateProp, date: { on_or_before: event.date + "T23:59:59+09:00" } },
      ],
    },
  });

  // Check if TSU-ID already exists in any event's description
  for (const page of data.results) {
    const richText = page.properties?.[config.descProp]?.rich_text || [];
    const desc = richText.map((seg: any) => seg.plain_text || "").join("");
    if (desc.includes(event.tsuId)) {
      return "skipped";
    }
  }

  if (dryRun) return "created";

  // Create in Notion
  const properties: Record<string, unknown> = {
    [config.titleProp]: { title: [{ text: { content: event.title } }] },
  };

  if (event.allDay) {
    properties[config.dateProp] = { date: { start: event.date } };
  } else {
    const dateObj: Record<string, string> = {
      start: `${event.date}T${event.startTime}:00+09:00`,
    };
    if (event.endTime) {
      dateObj.end = `${event.date}T${event.endTime}:00+09:00`;
    }
    properties[config.dateProp] = { date: dateObj };
  }

  const descParts = [event.location, event.tsuId].filter(Boolean).join("。");
  properties[config.descProp] = { rich_text: [{ text: { content: descParts } }] };

  await notionFetch(apiKey, "/pages", { parent: { database_id: dbId }, properties });

  return "created";
}

async function main() {
  const { flags } = parseArgs();
  const dryRun = flags.has("dry-run");

  if (dryRun) {
    console.log("[DRY RUN] Preview mode - no changes will be made");
    console.log("");
  }

  console.log("Syncing tsumugi events → Local + Notion...");
  console.log("");

  const events = parseEvents();

  if (events.length === 0) {
    console.log("No open event tasks found.");
    return;
  }

  console.log(`Found ${events.length} event task(s)`);

  const { apiKey, dbId, config } = getDbConfig("events");

  let localCreated = 0, localSkipped = 0;
  let notionCreated = 0, notionSkipped = 0;

  for (const event of events) {
    const localResult = syncLocal(event, dryRun);
    if (localResult === "created") {
      localCreated++;
      console.log(`  ${dryRun ? "[DRY RUN] Would create" : "Created"} local: ${event.date} ${event.title} (${event.tsuId})`);
    } else {
      localSkipped++;
      console.log(`  Skip local: ${event.date} ${event.tsuId} already exists`);
    }

    const notionResult = await syncNotion(event, apiKey, dbId, config, dryRun);
    if (notionResult === "created") {
      notionCreated++;
      console.log(`  ${dryRun ? "[DRY RUN] Would create" : "Created"} Notion: ${event.date} ${event.title} (${event.tsuId})`);
    } else {
      notionSkipped++;
      console.log(`  Skip Notion: ${event.date} ${event.tsuId} already exists`);
    }
  }

  console.log("");
  console.log(`Done! Local: ${localCreated} created, ${localSkipped} skipped | Notion: ${notionCreated} created, ${notionSkipped} skipped`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
