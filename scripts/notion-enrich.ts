#!/usr/bin/env bun
/**
 * Notion エンリッチスクリプト
 *
 * - アイコン・カバーが未設定のページに自動追加
 * - `@ 場所名` を含むエントリの移動時間を計算し、移動エントリ（todo DB）を作成
 *
 * Usage:
 *   bun run scripts/notion-enrich.ts                        # 今日
 *   bun run scripts/notion-enrich.ts --date 2026-04-10      # 指定日
 *   bun run scripts/notion-enrich.ts --date 2026-04-10 --dry-run
 *   bun run scripts/notion-enrich.ts --date 2026-04-10 --no-travel  # 移動エントリ作成スキップ
 */

import {
  getApiKey,
  getDbIdOptional,
  SCHEDULE_DB_CONFIGS,
  type ScheduleDbName,
  type NormalizedEntry,
  getScheduleDbConfigOptional,
  queryDbByDateCached,
  normalizePages,
  notionFetch,
  pickTaskIcon,
  pickCover,
  parseArgs,
  todayJST,
  getHomeAddress,
} from "./lib/notion";
import { estimateTravelTime } from "./lib/travel";

interface EnrichStats {
  iconsAdded: number;
  coversAdded: number;
  travelEntries: string[];
  skipped: string[];
  errors: string[];
}

/** タイトルから `@ 場所名` を抽出 */
function extractLocation(title: string): string | null {
  const match = title.match(/@\s*(.+)/);
  return match ? match[1].trim() : null;
}

/** ISO文字列から指定分数を引いた JST ISO文字列を返す */
function subtractMinutes(isoStr: string, minutes: number): string {
  const d = new Date(isoStr);
  d.setMinutes(d.getMinutes() - minutes);
  const local = d.toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
  // local: "2026-04-10 14:45:00"
  const [datePart, timePart] = local.split(" ");
  const [h, m] = timePart.split(":");
  return `${datePart}T${h}:${m}:00+09:00`;
}

/** ISO文字列から HH:MM を抽出 */
function hhmm(isoStr: string): string {
  const local = new Date(isoStr).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
  return local.split(" ")[1].slice(0, 5);
}

/** 時刻コンポーネントがある ISO文字列かどうか */
function hasTime(isoStr: string): boolean {
  return isoStr.includes("T");
}

async function enrichIcons(
  apiKey: string,
  entries: NormalizedEntry[],
  dryRun: boolean,
  stats: EnrichStats,
): Promise<void> {
  for (const entry of entries) {
    if (entry.hasIcon && entry.hasCover) continue;

    const updates: Record<string, unknown> = {};
    if (!entry.hasIcon) updates.icon = pickTaskIcon(entry.title);
    if (!entry.hasCover) updates.cover = pickCover();

    if (dryRun) {
      if (!entry.hasIcon) stats.iconsAdded++;
      if (!entry.hasCover) stats.coversAdded++;
      continue;
    }

    try {
      await notionFetch(apiKey, `/pages/${entry.id}`, updates, "PATCH");
      if (!entry.hasIcon) stats.iconsAdded++;
      if (!entry.hasCover) stats.coversAdded++;
    } catch (e) {
      stats.errors.push(`icon/cover update failed for "${entry.title}": ${e}`);
    }
  }
}

async function enrichTravelTime(
  apiKey: string,
  todoDbId: string,
  entries: NormalizedEntry[],
  date: string,
  dryRun: boolean,
  stats: EnrichStats,
): Promise<void> {
  // 既存の移動エントリタイトルを収集して重複を防ぐ
  const existingTitles = new Set(entries.map((e) => e.title));
  const processedLocations = new Set<string>();

  let homeAddress: string;
  try {
    homeAddress = getHomeAddress();
  } catch {
    homeAddress = "横浜市中区桜木町";
  }

  for (const entry of entries) {
    const location = extractLocation(entry.title);
    if (!location) continue;
    if (processedLocations.has(location)) continue;
    if (!entry.start || !hasTime(entry.start)) {
      stats.skipped.push(`"${entry.title}" — 時刻なし、移動エントリ作成スキップ`);
      continue;
    }

    const travelTitle = `移動 → ${location}`;
    if (existingTitles.has(travelTitle)) {
      stats.skipped.push(`"${travelTitle}" — すでに存在`);
      processedLocations.add(location);
      continue;
    }

    processedLocations.add(location);

    let travelMinutes: number;
    try {
      const travel = await estimateTravelTime(homeAddress, location, entry.start);
      travelMinutes = travel.minutes;
    } catch (e) {
      stats.errors.push(`travel estimate failed for "${location}": ${e}`);
      continue;
    }

    const departureISO = subtractMinutes(entry.start, travelMinutes);
    const arrivalISO = entry.start;
    const label = `${travelTitle} ${hhmm(departureISO)}-${hhmm(arrivalISO)} (${travelMinutes}分)`;

    if (dryRun) {
      stats.travelEntries.push(`[dry-run] ${label}`);
      continue;
    }

    try {
      await notionFetch(apiKey, "/pages", {
        parent: { database_id: todoDbId },
        icon: { type: "emoji", emoji: "🚃" },
        properties: {
          [SCHEDULE_DB_CONFIGS.todo.titleProp]: {
            title: [{ text: { content: travelTitle } }],
          },
          [SCHEDULE_DB_CONFIGS.todo.dateProp]: {
            date: { start: departureISO, end: arrivalISO },
          },
        },
      });
      stats.travelEntries.push(label);
    } catch (e) {
      stats.errors.push(`travel entry creation failed for "${location}": ${e}`);
    }
  }
}

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const noTravel = flags.has("no-travel");
  const date = opts.date || todayJST();

  const apiKey = getApiKey();
  const todoDbId = getDbIdOptional(SCHEDULE_DB_CONFIGS.todo.envKey);

  const stats: EnrichStats = {
    iconsAdded: 0,
    coversAdded: 0,
    travelEntries: [],
    skipped: [],
    errors: [],
  };

  const prefix = dryRun ? "[dry-run] " : "";
  console.log(`${prefix}エンリッチ: ${date}`);

  // 全スケジュール DB のエントリを取得
  const allEntries: NormalizedEntry[] = [];
  for (const dbName of Object.keys(SCHEDULE_DB_CONFIGS) as ScheduleDbName[]) {
    const setup = getScheduleDbConfigOptional(dbName);
    if (!setup) continue;
    const { dbId, config } = setup;
    try {
      const data = await queryDbByDateCached(apiKey, dbId, config, date, date);
      const entries = normalizePages(data.results || [], config, dbName);
      allEntries.push(...entries);
    } catch { continue; }
  }

  console.log(`  ${allEntries.length} エントリを処理中...`);

  await enrichIcons(apiKey, allEntries, dryRun, stats);

  if (!noTravel && todoDbId) {
    await enrichTravelTime(apiKey, todoDbId, allEntries, date, dryRun, stats);
  } else if (!todoDbId) {
    console.log("  NOTION_TODO_DB 未設定 — 移動エントリ作成スキップ");
  }

  // サマリー
  console.log("\n結果:");
  console.log(`  アイコン追加: ${stats.iconsAdded}`);
  console.log(`  カバー追加:   ${stats.coversAdded}`);
  if (stats.travelEntries.length > 0) {
    console.log("  移動エントリ:");
    for (const t of stats.travelEntries) console.log(`    ${t}`);
  }
  if (stats.skipped.length > 0) {
    console.log("  スキップ:");
    for (const s of stats.skipped) console.log(`    ${s}`);
  }
  if (stats.errors.length > 0) {
    console.log("  エラー:");
    for (const e of stats.errors) console.log(`    ${e}`);
  }
}

main().catch(console.error);
