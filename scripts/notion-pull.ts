#!/usr/bin/env bun
/**
 * Notion → repo 逆同期
 *
 * Notion 上の変更（時間変更・完了マーク・フィードバック）をリポジトリのイベントファイルに反映する。
 *
 * 対象 DB:
 *   events  → planning/events/YYYY-MM-DD.md
 *   guitar  → aspects/guitar/events/YYYY-MM-DD.md
 *   meals   → aspects/diet/events/YYYY-MM-DD.md
 *   todo    → planning/tasks.md (Inbox/Archive)
 *
 * 使い方:
 *   bun run scripts/notion-pull.ts                     # 今日
 *   bun run scripts/notion-pull.ts --date 2026-02-16   # 指定日
 *   bun run scripts/notion-pull.ts --days 7            # 複数日
 *   bun run scripts/notion-pull.ts --db events         # DB 指定
 *   bun run scripts/notion-pull.ts --dry-run           # プレビュー
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import {
  type ScheduleDbName, type NormalizedEntry,
  getScheduleDbConfigOptional, queryDbByDate, normalizePages,
  notionFetch, getApiKey,
  parseArgs, todayJST,
} from "./lib/notion";

const ROOT = join(import.meta.dir, "..");

// --- DB → file path mapping ---

const EVENT_DBS: ScheduleDbName[] = ["events", "guitar", "meals"];
const TASKS_FILE = join(ROOT, "planning/tasks.md");

function dbToDir(db: ScheduleDbName): string {
  switch (db) {
    case "events": return "planning/events";
    case "guitar": return "aspects/guitar/events";
    case "meals": return "aspects/diet/events";
    default: throw new Error(`Unsupported DB for pull: ${db}`);
  }
}

function eventFilePath(db: ScheduleDbName, date: string): string {
  return join(ROOT, dbToDir(db), `${date}.md`);
}

// --- Parsing (same regex as notion-sync-event-file.ts) ---

interface FileEntry {
  done: boolean;
  startTime: string;
  endTime: string;
  allDay: boolean;
  title: string;
  tags: string;       // e.g. " #todo #groceries"
  descLines: string[];
  feedbackLine: string;
}

function parseEventFile(filePath: string): FileEntry[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const entries: FileEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^- \[([ x])\]\s+(?:(\d{1,2}:\d{2})\s*[-–〜]\s*(\d{1,2}:\d{2})\s+|終日\s+)?(.+)$/);
    if (!m) continue;

    const done = m[1] === "x";
    const startTime = m[2] ? m[2].padStart(5, "0") : "";
    const endTime = m[3] ? m[3].padStart(5, "0") : "";
    const allDay = !m[2];
    const rawTitle = m[4].trim();

    // Extract tags (#todo, #groceries, etc.)
    const tagMatch = rawTitle.match(/(\s+#\w+(?:\s+#\w+)*)$/);
    const tags = tagMatch ? tagMatch[1] : "";
    const title = tagMatch ? rawTitle.slice(0, -tags.length) : rawTitle;

    // Collect sub-bullet lines
    const descLines: string[] = [];
    let feedbackLine = "";
    let j = i + 1;
    while (j < lines.length && lines[j].match(/^\s{2,}-\s/)) {
      const sub = lines[j].replace(/^\s{2,}-\s/, "").trim();
      if (sub.startsWith("💬")) {
        feedbackLine = sub.replace(/^💬\s*/, "");
      } else {
        descLines.push(sub);
      }
      j++;
    }

    entries.push({ done, startTime, endTime, allDay, title, tags, descLines, feedbackLine });
  }

  return entries;
}

// --- Title matching (same logic as notion-sync-event-file.ts) ---

function normalizeTitle(title: string): string {
  return title.replace(/[（）()]/g, "").replace(/\s+/g, "").toLowerCase();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return na.includes(nb) || nb.includes(na);
}

// --- Time extraction from ISO string ---

function extractTime(iso: string): string {
  if (!iso || !iso.includes("T")) return "";
  const d = new Date(iso);
  const h = d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  return h;
}

// --- Merge ---

interface MergedEntry {
  done: boolean;
  startTime: string;
  endTime: string;
  allDay: boolean;
  title: string;
  tags: string;
  descLines: string[];
  feedbackLine: string;
  source: "both" | "notion" | "file";
}

function mergeEntries(notionEntries: NormalizedEntry[], fileEntries: FileEntry[]): { merged: MergedEntry[]; added: number; updated: number; kept: number } {
  const used = new Set<number>();
  const merged: MergedEntry[] = [];
  let added = 0, updated = 0, kept = 0;

  // Match Notion entries to file entries
  for (const ne of notionEntries) {
    let matchIdx = -1;
    for (let i = 0; i < fileEntries.length; i++) {
      if (used.has(i)) continue;
      if (titlesMatch(ne.title, fileEntries[i].title)) {
        matchIdx = i;
        break;
      }
    }

    const notionStart = extractTime(ne.start);
    const notionEnd = ne.end ? extractTime(ne.end) : "";
    const isAllDay = !ne.start.includes("T");
    const isDone = ne.status === "Done" || ne.status === "完了";

    if (matchIdx >= 0) {
      // Matched — Notion values win for time/status, keep file tags
      used.add(matchIdx);
      const fe = fileEntries[matchIdx];
      const changed = fe.startTime !== notionStart || fe.endTime !== notionEnd || fe.done !== isDone || (ne.feedback && fe.feedbackLine !== ne.feedback);
      if (changed) updated++;
      else kept++;

      merged.push({
        done: isDone,
        startTime: notionStart || fe.startTime,
        endTime: notionEnd || fe.endTime,
        allDay: isAllDay && fe.allDay,
        title: ne.title,
        tags: fe.tags,
        descLines: fe.descLines,
        feedbackLine: ne.feedback || fe.feedbackLine,
        source: "both",
      });
    } else {
      // Notion only — new entry
      added++;
      merged.push({
        done: isDone,
        startTime: notionStart,
        endTime: notionEnd,
        allDay: isAllDay,
        title: ne.title,
        tags: "",
        descLines: ne.description ? [ne.description] : [],
        feedbackLine: ne.feedback || "",
        source: "notion",
      });
    }
  }

  // File-only entries (not matched to Notion) — keep as-is
  for (let i = 0; i < fileEntries.length; i++) {
    if (used.has(i)) continue;
    kept++;
    const fe = fileEntries[i];
    merged.push({
      done: fe.done,
      startTime: fe.startTime,
      endTime: fe.endTime,
      allDay: fe.allDay,
      title: fe.title,
      tags: fe.tags,
      descLines: fe.descLines,
      feedbackLine: fe.feedbackLine,
      source: "file",
    });
  }

  return { merged, added, updated, kept };
}

// --- Render ---

function renderFile(date: string, entries: MergedEntry[]): string {
  // Sort: timed entries by startTime, then all-day at end
  entries.sort((a, b) => {
    if (a.allDay && !b.allDay) return 1;
    if (!a.allDay && b.allDay) return -1;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });

  const lines: string[] = [`# ${date}`, ""];
  for (const e of entries) {
    const check = e.done ? "[x]" : "[ ]";
    let timePart: string;
    if (e.allDay) {
      timePart = "終日";
    } else {
      timePart = `${e.startTime}-${e.endTime}`;
    }
    const tagPart = e.tags || "";
    lines.push(`- ${check} ${timePart} ${e.title}${tagPart}`);
    for (const desc of e.descLines) {
      lines.push(`  - ${desc}`);
    }
    if (e.feedbackLine) {
      lines.push(`  - 💬 ${e.feedbackLine}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// --- Tasks.md parsing & merge (todo DB) ---

interface TaskEntry {
  done: boolean;
  title: string;
  rawLine: string; // original line for preservation
}

function parseTasksFile(): { header: string; inbox: TaskEntry[]; footer: string } {
  if (!existsSync(TASKS_FILE)) return { header: "", inbox: [], footer: "" };
  const content = readFileSync(TASKS_FILE, "utf-8");
  const lines = content.split("\n");

  let inboxStart = -1;
  let archiveStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^## Inbox/)) inboxStart = i;
    if (lines[i].match(/^## Archive/)) archiveStart = i;
  }
  if (inboxStart === -1) return { header: content, inbox: [], footer: "" };

  const headerEnd = inboxStart + 1; // line after "## Inbox"
  const inboxEnd = archiveStart !== -1 ? archiveStart : lines.length;
  const header = lines.slice(0, headerEnd).join("\n");
  const footer = archiveStart !== -1 ? lines.slice(archiveStart).join("\n") : "## Archive\n\n<!-- 完了タスクが月別に整理される -->";

  const inbox: TaskEntry[] = [];
  for (let i = headerEnd; i < inboxEnd; i++) {
    const m = lines[i].match(/^- \[([ x])\]\s+(.+)$/);
    if (!m) continue;
    // Extract title (strip date/tag/deadline suffixes for matching)
    const rawTitle = m[2];
    const cleanTitle = rawTitle
      .replace(/\s*\(\d{4}-\d{2}-\d{2}\)/, "")  // (2026-02-13)
      .replace(/\s*📅\s*\d{4}-\d{2}-\d{2}/, "")  // 📅 2026-02-13
      .replace(/\s*#\w+/g, "")                     // #tag
      .trim();
    inbox.push({ done: m[1] === "x", title: cleanTitle, rawLine: lines[i] });
  }

  return { header, inbox, footer };
}

function mergeTaskEntries(
  notionEntries: NormalizedEntry[],
  inbox: TaskEntry[],
): { updatedInbox: TaskEntry[]; newEntries: NormalizedEntry[]; completed: number; added: number; kept: number } {
  const used = new Set<number>();
  let completed = 0, kept = 0;
  const updatedInbox = inbox.map((task, idx) => ({ ...task, _idx: idx }));
  const newEntries: NormalizedEntry[] = [];

  for (const ne of notionEntries) {
    const isDone = ne.status === "Done" || ne.status === "完了";
    let matchIdx = -1;
    for (let i = 0; i < updatedInbox.length; i++) {
      if (used.has(i)) continue;
      if (titlesMatch(ne.title, updatedInbox[i].title)) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      used.add(matchIdx);
      const task = updatedInbox[matchIdx];
      if (isDone && !task.done) {
        // Mark as completed
        task.done = true;
        task.rawLine = task.rawLine.replace("- [ ]", "- [x]");
        completed++;
      } else {
        kept++;
      }
    } else {
      // New entry from Notion not in tasks.md
      newEntries.push(ne);
    }
  }

  // Count unmatched file entries as kept
  kept += inbox.length - used.size - completed;

  return { updatedInbox, newEntries, completed, added: newEntries.length, kept };
}

function renderTasksFile(header: string, inbox: TaskEntry[], footer: string, newEntries: NormalizedEntry[], today: string): string {
  const activeInbox = inbox.filter(t => !t.done);
  const completedInbox = inbox.filter(t => t.done);

  const lines: string[] = [header, ""];

  // Active inbox items
  for (const t of activeInbox) {
    lines.push(t.rawLine);
  }

  // New entries from Notion
  for (const ne of newEntries) {
    const isDone = ne.status === "Done" || ne.status === "完了";
    const check = isDone ? "[x]" : "[ ]";
    const dateStr = ne.start ? ne.start.split("T")[0] : today;
    lines.push(`- ${check} ${ne.title} (${today}) 📅 ${dateStr}`);
    if (isDone) {
      completedInbox.push({ done: true, title: ne.title, rawLine: `- [x] ${ne.title} (${today}) 📅 ${dateStr}` });
    }
  }

  // Preserve the marker comment
  lines.push("<!-- 新しいタスクはここに追加される -->");
  lines.push("");

  // Build archive
  const footerLines = footer.split("\n");
  const archiveLines: string[] = [];
  // Find existing archive content
  let inArchiveHeader = false;
  for (const l of footerLines) {
    if (l.match(/^## Archive/)) {
      archiveLines.push(l);
      inArchiveHeader = true;
      continue;
    }
    archiveLines.push(l);
  }
  if (archiveLines.length === 0) {
    archiveLines.push("## Archive", "");
  }

  // Add newly completed items to archive under current month
  if (completedInbox.length > 0) {
    const monthKey = today.slice(0, 7); // YYYY-MM
    const monthHeader = `### ${monthKey}`;

    // Check if month header exists
    const monthIdx = archiveLines.findIndex(l => l.trim() === monthHeader);
    if (monthIdx === -1) {
      // Add month header after "## Archive" line
      const archiveIdx = archiveLines.findIndex(l => l.match(/^## Archive/));
      const insertAt = archiveIdx + 1;
      const toInsert = ["", monthHeader, ""];
      for (const t of completedInbox) {
        toInsert.push(t.rawLine);
      }
      archiveLines.splice(insertAt, 0, ...toInsert);
    } else {
      // Find end of this month's section
      let insertAt = monthIdx + 1;
      while (insertAt < archiveLines.length && !archiveLines[insertAt].match(/^###\s/)) {
        insertAt++;
      }
      for (const t of completedInbox) {
        // Avoid duplicates
        const exists = archiveLines.some(l => l.includes(t.title));
        if (!exists) {
          archiveLines.splice(insertAt, 0, t.rawLine);
          insertAt++;
        }
      }
    }
  }

  lines.push(...archiveLines);
  lines.push("");
  return lines.join("\n");
}

// --- Main ---

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const dbFilter = opts.db as ScheduleDbName | undefined;
  const days = opts.days ? parseInt(opts.days, 10) : 1;

  const baseDate = opts.date || todayJST();
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(baseDate + "T12:00:00+09:00");
    d.setDate(d.getDate() + i);
    dates.push(d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
  }

  const eventDbs = dbFilter
    ? (dbFilter === "todo" ? [] : [dbFilter])
    : EVENT_DBS;
  const pullTodo = !dbFilter || dbFilter === "todo";

  if (dryRun) {
    console.log("[DRY RUN] Preview mode — no files will be written\n");
  }

  let totalAdded = 0, totalUpdated = 0, totalKept = 0, totalRemoved = 0;

  const today = todayJST();

  // --- Event DBs → event files ---
  for (const date of dates) {
    const isPast = date < today;

    for (const db of eventDbs) {
      const dbConf = getScheduleDbConfigOptional(db);
      if (!dbConf) continue;
      const { apiKey, dbId, config } = dbConf;

      const data = await queryDbByDate(apiKey, dbId, config, date, date);
      const notionEntries = normalizePages(data.results, config, db);

      const filePath = eventFilePath(db, date);
      const fileEntries = parseEventFile(filePath);

      if (notionEntries.length === 0 && fileEntries.length === 0) continue;

      const { merged, added, updated, kept } = mergeEntries(notionEntries, fileEntries);

      // For past dates: remove uncompleted entries
      let final = merged;
      let removed = 0;
      if (isPast) {
        final = merged.filter(e => e.done);
        removed = merged.length - final.length;
      }

      totalAdded += added;
      totalUpdated += updated;
      totalKept += kept - removed; // adjust kept count
      totalRemoved += removed;

      const relPath = filePath.replace(ROOT + "/", "");
      console.log(`${relPath} [${db}]:`);
      for (const e of merged) {
        const isRemoved = isPast && !e.done;
        const tag = isRemoved ? "REMOVE"
          : e.source === "notion" ? "ADD"
          : e.source === "both" ? "SYNC"
          : "KEEP";
        const time = e.allDay ? "終日" : `${e.startTime}-${e.endTime}`;
        const fb = e.feedbackLine ? ` 💬 ${e.feedbackLine}` : "";
        console.log(`  ${tag}: ${e.done ? "✅" : "⬜"} ${time} ${e.title}${fb}`);
      }

      if (!dryRun) {
        const content = renderFile(date, final);
        const dir = dirname(filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, content);
      }
    }
  }

  // --- Todo DB → planning/tasks.md ---
  if (pullTodo) {
    const todoConf = getScheduleDbConfigOptional("todo");
    if (todoConf) {
      const { apiKey, dbId, config } = todoConf;

      // Fetch all dates in range
      const allNotionTodos: NormalizedEntry[] = [];
      for (const date of dates) {
        const data = await queryDbByDate(apiKey, dbId, config, date, date);
        allNotionTodos.push(...normalizePages(data.results, config, "todo"));
      }

      if (allNotionTodos.length > 0) {
        const { header, inbox, footer } = parseTasksFile();
        const { updatedInbox, newEntries, completed, added, kept } = mergeTaskEntries(allNotionTodos, inbox);

        // Past uncompleted todos: clear date in Notion so they leave the calendar
        const pastUncompleted = allNotionTodos.filter(ne => {
          const isDone = ne.status === "Done" || ne.status === "完了";
          const entryDate = ne.start ? ne.start.split("T")[0] : "";
          return !isDone && entryDate < today;
        });

        totalUpdated += completed;
        totalAdded += added;
        totalKept += kept;

        console.log(`planning/tasks.md [todo]:`);
        for (const ne of allNotionTodos) {
          const isDone = ne.status === "Done" || ne.status === "完了";
          const matched = updatedInbox.some(t => titlesMatch(ne.title, t.title));
          const isNew = newEntries.some(n => n.id === ne.id);
          const isPastUncompleted = pastUncompleted.some(p => p.id === ne.id);
          const tag = isPastUncompleted ? "UNSCHEDULE"
            : isNew ? "ADD"
            : (matched && isDone ? "DONE" : "KEEP");
          console.log(`  ${tag}: ${isDone ? "✅" : "⬜"} ${ne.title}`);
        }

        if (!dryRun) {
          const content = renderTasksFile(header, updatedInbox, footer, newEntries, baseDate);
          writeFileSync(TASKS_FILE, content);

          // Clear date for past uncompleted todos in Notion
          for (const ne of pastUncompleted) {
            console.log(`  → Clearing date for: ${ne.title}`);
            await notionFetch(getApiKey(), `/pages/${ne.id}`, {
              properties: { [config.dateProp]: { date: null } },
            }, "PATCH");
          }
        }
      }
    }
  }

  const parts = [`Added: ${totalAdded}`, `Updated: ${totalUpdated}`, `Kept: ${totalKept}`];
  if (totalRemoved > 0) parts.push(`Removed: ${totalRemoved}`);
  console.log(`\nDone! ${parts.join(", ")}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
