#!/usr/bin/env bun
/**
 * AI デイリープラン → Notion ルーティン同期
 *
 * AI 生成のデイリープラン markdown から 🔹（ルーティン）エントリを抽出し、
 * Notion routine DB に未登録のものを追加、時間が異なるものを更新する。
 *
 * 使い方:
 *   bun run scripts/notion-sync-ai-plan.ts --date 2026-02-20
 *   bun run scripts/notion-sync-ai-plan.ts --date 2026-02-20 --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  getScheduleDbConfig, notionFetch, parseArgs, todayJST,
  pickTaskIcon, pickCover, queryDbByDateCached, normalizePages,
  clearNotionCache,
} from "./lib/notion";

const ROOT = join(import.meta.dir, "..");

interface PlanEntry {
  start: string; // "09:00"
  end: string;   // "09:30"
  label: string; // "読書"
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getTimeFromISO(iso: string): string {
  return iso.match(/T(\d{2}:\d{2})/)?.[1] || "00:00";
}

/**
 * Parse daily plan markdown for 🔹 (routine) entries.
 * Handles both table format and plain text format.
 */
function parseDailyPlan(filePath: string): PlanEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const entries: PlanEntry[] = [];

  for (const line of content.split("\n")) {
    // Table format: | 09:00-09:30 | 🔹 | 読書 |
    const tableMatch = line.match(
      /\|\s*(\d{2}:\d{2})-(\d{2}:\d{2})\s*\|\s*🔹\s*\|\s*(.+?)\s*\|/,
    );
    if (tableMatch) {
      entries.push({
        start: tableMatch[1],
        end: tableMatch[2],
        label: tableMatch[3].trim(),
      });
      continue;
    }

    // Plain format: 09:00-09:30  🔹 読書
    const plainMatch = line.match(/(\d{2}:\d{2})-(\d{2}:\d{2})\s+🔹\s+(.+)/);
    if (plainMatch) {
      entries.push({
        start: plainMatch[1],
        end: plainMatch[2],
        label: plainMatch[3].trim(),
      });
    }
  }

  return entries;
}

function labelsMatch(planLabel: string, notionTitle: string): boolean {
  const a = planLabel.toLowerCase();
  const b = notionTitle.toLowerCase();
  return a.includes(b) || b.includes(a);
}

async function main() {
  const { flags, opts } = parseArgs();
  const date = opts.date || todayJST();
  const dryRun = flags.has("dry-run");

  const planFile = join(ROOT, "planning", "daily", `${date}.md`);
  if (!existsSync(planFile)) {
    console.log(`Plan file not found: ${planFile}`);
    return;
  }

  const planEntries = parseDailyPlan(planFile);
  if (planEntries.length === 0) {
    console.log("No routine (🔹) entries found in daily plan");
    return;
  }

  if (dryRun) {
    console.log("[DRY RUN] Preview mode\n");
  }

  console.log(
    `Found ${planEntries.length} routine entries in daily plan for ${date}`,
  );

  // Get existing Notion routine entries
  const { apiKey, dbId, config } = getScheduleDbConfig("routine");
  const data = await queryDbByDateCached(apiKey, dbId, config, date, date);
  const existing = normalizePages(data.results, config, "routine");

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const matchedNotionIds = new Set<string>();

  for (const entry of planEntries) {
    const expectedStart = `${date}T${entry.start}:00+09:00`;
    const expectedEnd = `${date}T${entry.end}:00+09:00`;
    const entryStartMin = timeToMinutes(entry.start);

    // Find unmatched Notion entries with same label
    const candidates = existing.filter((e) => {
      if (matchedNotionIds.has(e.id)) return false;
      return labelsMatch(entry.label, e.title);
    });

    if (candidates.length > 0) {
      // Find closest by start time
      const closest = candidates.reduce((best, e) => {
        const eDist = Math.abs(
          timeToMinutes(getTimeFromISO(e.start)) - entryStartMin,
        );
        const bestDist = Math.abs(
          timeToMinutes(getTimeFromISO(best.start)) - entryStartMin,
        );
        return eDist < bestDist ? e : best;
      });

      const closestStartMin = timeToMinutes(getTimeFromISO(closest.start));
      const timeDiff = Math.abs(closestStartMin - entryStartMin);

      if (timeDiff <= 60) {
        // Close enough → same logical entry
        matchedNotionIds.add(closest.id);

        const existingStart = getTimeFromISO(closest.start);
        const existingEnd = closest.end
          ? getTimeFromISO(closest.end)
          : "";

        if (existingStart === entry.start && existingEnd === entry.end) {
          console.log(
            `  SKIP: ${entry.label} ${entry.start}-${entry.end} (already registered)`,
          );
          skipped++;
        } else {
          console.log(
            `  UPDATE: ${entry.label} ${existingStart}-${existingEnd} → ${entry.start}-${entry.end}`,
          );
          if (!dryRun) {
            await notionFetch(
              apiKey,
              `/pages/${closest.id}`,
              {
                properties: {
                  [config.dateProp]: {
                    date: { start: expectedStart, end: expectedEnd },
                  },
                },
              },
              "PATCH",
            );
          }
          updated++;
        }
        continue;
      }
      // timeDiff > 60 → different block, fall through to create
    }

    // No close match → create new entry
    console.log(`  CREATE: ${entry.label} ${entry.start}-${entry.end}`);

    if (!dryRun) {
      await notionFetch(apiKey, "/pages", {
        parent: { database_id: dbId },
        properties: {
          [config.titleProp]: {
            title: [{ text: { content: entry.label } }],
          },
          [config.dateProp]: {
            date: { start: expectedStart, end: expectedEnd },
          },
        },
        icon: pickTaskIcon(entry.label),
        cover: pickCover(),
      });
    }
    created++;
  }

  if (created > 0 || updated > 0) {
    clearNotionCache();
  }

  console.log(
    `\nDone! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
