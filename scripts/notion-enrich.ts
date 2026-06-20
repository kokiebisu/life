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
 *   bun run scripts/notion-enrich.ts --page <URL or ID>     # 単体ページを直接エンリッチ
 *   bun run scripts/notion-enrich.ts --all                  # 全 DB を一括エンリッチ
 *   bun run scripts/notion-enrich.ts --all --dry-run
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
} from "./lib/notion";

// 全一括エンリッチ対象の DB（envKey → titleProp）
const ALL_DB_ENV_KEYS: { envKey: string; label: string }[] = [
  // スケジュール系（SCHEDULE_DB_CONFIGS と一致）
  { envKey: "NOTION_DEVOTION_DB",       label: "devotion" },
  { envKey: "NOTION_EVENTS_DB",         label: "events" },
  { envKey: "NOTION_MEALS_DB",          label: "meals" },
  { envKey: "NOTION_GROCERIES_DB",      label: "groceries" },
  { envKey: "NOTION_TODO_DB",           label: "todo" },
  { envKey: "NOTION_OTHER_DB",          label: "other" },
  { envKey: "NOTION_STUDY_DB",          label: "study" },
  // その他 DB
  { envKey: "NOTION_JOB_DB",            label: "job" },
  { envKey: "NOTION_CHURCH_MESSAGES_DB",label: "church_messages" },
  { envKey: "NOTION_MAJIWARI_DB",       label: "majiwari" },
  { envKey: "NOTION_GYM_DB",            label: "gym" },
];

interface EnrichStats {
  iconsAdded: number;
  coversAdded: number;
  errors: string[];
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

/** URL または UUID から Notion ページ ID を抽出 */
function extractPageId(urlOrId: string): string {
  // UUID形式 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or 32hex)
  const uuidMatch = urlOrId.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch) return uuidMatch[1].replace(/-/g, "");
  return urlOrId;
}

/** page オブジェクトからタイトル文字列を取得 */
function getPageTitle(page: any): string {
  return (
    Object.values(page.properties as Record<string, any>)
      .find((p: any) => p.type === "title")
      ?.title ?? []
  ).map((t: any) => t.plain_text || "").join("") || "untitled";
}

/** ページにアイコン・カバーを付与（なければ）*/
async function patchIconCover(
  apiKey: string,
  pageId: string,
  title: string,
  hasIcon: boolean,
  hasCover: boolean,
  dryRun: boolean,
  stats: { iconsAdded: number; coversAdded: number; errors: string[] },
): Promise<void> {
  if (hasIcon && hasCover) return;
  const updates: Record<string, unknown> = {};
  if (!hasIcon) updates.icon = pickTaskIcon(title);
  if (!hasCover) updates.cover = pickCover();

  if (!dryRun) {
    try {
      await notionFetch(apiKey, `/pages/${pageId}`, updates, "PATCH");
    } catch (e) {
      stats.errors.push(`update failed for "${title}": ${e}`);
      return;
    }
  }
  if (!hasIcon) stats.iconsAdded++;
  if (!hasCover) stats.coversAdded++;
}

/** 単体ページをアイコン・カバーだけエンリッチ */
async function enrichSinglePage(
  apiKey: string,
  pageIdOrUrl: string,
  dryRun: boolean,
): Promise<void> {
  const pageId = extractPageId(pageIdOrUrl);
  const page = await notionFetch(apiKey, `/pages/${pageId}`, undefined, "GET");
  const title = getPageTitle(page);
  const hasIcon = !!page.icon;
  const hasCover = !!page.cover;

  if (hasIcon && hasCover) {
    console.log(`✓ "${title}" — アイコン・カバーともに設定済み`);
    return;
  }

  const updates: Record<string, unknown> = {};
  if (!hasIcon) updates.icon = pickTaskIcon(title);
  if (!hasCover) updates.cover = pickCover();

  console.log(`"${title}"`);
  if (!hasIcon) console.log(`  アイコン → ${(updates.icon as any).emoji}`);
  if (!hasCover) console.log(`  カバー → 追加`);

  if (!dryRun) {
    await notionFetch(apiKey, `/pages/${pageId}`, updates, "PATCH");
    console.log("  ✓ 更新完了");
  } else {
    console.log("  [dry-run] スキップ");
  }
}

/** DB 内の全ページを取得（ページネーション対応） */
async function queryAllPages(apiKey: string, dbId: string): Promise<any[]> {
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(apiKey, `/databases/${dbId}/query`, body);
    pages.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

/** 全 DB を一括エンリッチ */
async function enrichAllDbs(apiKey: string, dryRun: boolean): Promise<void> {
  const stats = { iconsAdded: 0, coversAdded: 0, errors: [] as string[] };
  const prefix = dryRun ? "[dry-run] " : "";
  console.log(`${prefix}全 DB 一括エンリッチ`);

  for (const { envKey, label } of ALL_DB_ENV_KEYS) {
    const dbId = getDbIdOptional(envKey);
    if (!dbId) continue;

    process.stdout.write(`  ${label} ... `);
    let pages: any[];
    try {
      pages = await queryAllPages(apiKey, dbId);
    } catch (e) {
      console.log(`エラー: ${e}`);
      continue;
    }

    let updated = 0;
    for (const page of pages) {
      const title = getPageTitle(page);
      const before = stats.iconsAdded + stats.coversAdded;
      await patchIconCover(apiKey, page.id, title, !!page.icon, !!page.cover, dryRun, stats);
      if (stats.iconsAdded + stats.coversAdded > before) updated++;
    }
    console.log(`${pages.length} 件 (更新: ${updated})`);
  }

  console.log(`\n結果:`);
  console.log(`  アイコン追加: ${stats.iconsAdded}`);
  console.log(`  カバー追加:   ${stats.coversAdded}`);
  if (stats.errors.length > 0) {
    console.log("  エラー:");
    for (const e of stats.errors) console.log(`    ${e}`);
  }
}

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");

  const apiKey = getApiKey();

  // --page モード: 単体ページを直接エンリッチ
  if (opts.page) {
    await enrichSinglePage(apiKey, opts.page, dryRun);
    return;
  }

  // --all モード: 全 DB を一括エンリッチ
  if (flags.has("all")) {
    await enrichAllDbs(apiKey, dryRun);
    return;
  }

  const date = opts.date || todayJST();

  const stats: EnrichStats = {
    iconsAdded: 0,
    coversAdded: 0,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("Could not find database")) {
        console.warn(`  SKIP [${dbName}] (${dbId}): not shared with integration`);
        continue;
      }
      throw err;
    }
  }

  console.log(`  ${allEntries.length} エントリを処理中...`);

  await enrichIcons(apiKey, allEntries, dryRun, stats);

  // サマリー
  console.log("\n結果:");
  console.log(`  アイコン追加: ${stats.iconsAdded}`);
  console.log(`  カバー追加:   ${stats.coversAdded}`);
  if (stats.errors.length > 0) {
    console.log("  エラー:");
    for (const e of stats.errors) console.log(`    ${e}`);
  }
}

main().catch(console.error);
