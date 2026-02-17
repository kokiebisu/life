#!/usr/bin/env bun
/**
 * Notion タスク・イベント追加（4 DB対応）
 *
 * 使い方:
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:30 --end 18:30
 *   bun run scripts/notion-add.ts --title "買い出し" --date 2026-02-14 --start 10:00 --end 11:00
 *   bun run scripts/notion-add.ts --title "イベント" --date 2026-02-14 --start 14:00 --end 16:00 --db events
 *   bun run scripts/notion-add.ts --title "ギター練習" --date 2026-02-14 --start 17:00 --end 18:00 --db guitar
 */

import { type ScheduleDbName, getScheduleDbConfig, notionFetch, queryDbByDate, parseArgs, pickTaskIcon, pickCover } from "./lib/notion";

function normalizeTitle(title: string): string {
  return title.replace(/[（）()]/g, "").replace(/\s+/g, "").replace(/ー/g, "").toLowerCase();
}

async function aiIsDuplicate(newTitle: string, existingTitle: string): Promise<boolean> {
  const prompt = `同じ予定かどうか判定してください。表記揺れ（長音、括弧、スペース等）は同一とみなします。ただし「買い出し」と「パーティ」のように活動内容が異なるものは別の予定です。

新規: "${newTitle}"
既存: "${existingTitle}"

同じ予定なら "yes"、別の予定なら "no" とだけ答えてください。`;
  try {
    const proc = Bun.spawn(["claude", "-p", prompt, "--model", "haiku"], {
      env: { ...process.env, CLAUDECODE: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim().toLowerCase().includes("yes");
  } catch {
    return false;
  }
}

function getTimeFromISO(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

async function checkDuplicate(apiKey: string, dbId: string, config: any, date: string, title: string, newStart?: string, newEnd?: string): Promise<boolean> {
  const data = await queryDbByDate(apiKey, dbId, config, date, date);
  const pages: any[] = data.results || [];
  const normalizedNew = normalizeTitle(title);
  for (const page of pages) {
    const existingTitle = (page.properties?.[config.titleProp]?.title || [])
      .map((t: any) => t.plain_text || "").join("");
    const normalizedExisting = normalizeTitle(existingTitle);
    const existingDate = page.properties?.[config.dateProp]?.date;
    const existingStart = getTimeFromISO(existingDate?.start);
    const existingEnd = getTimeFromISO(existingDate?.end);

    const titleMatch = normalizedNew === normalizedExisting;
    const titleSimilar = !titleMatch && (normalizedNew.includes(normalizedExisting) || normalizedExisting.includes(normalizedNew));

    if (!titleMatch && !titleSimilar) continue;

    // タイトルが一致/類似でも、時間帯が異なれば別エントリとして許可
    if (newStart && existingStart && newStart !== existingStart) continue;
    if (newEnd && existingEnd && newEnd !== existingEnd) continue;

    if (titleMatch) {
      console.error(`重複検出: "${existingTitle}" が既に存在します。スキップします。`);
      return true;
    }
    // 部分的に似ている場合 → AI で判定
    if (titleSimilar) {
      const isDup = await aiIsDuplicate(title, existingTitle);
      if (isDup) {
        console.error(`重複検出（AI判定）: "${existingTitle}" と同一の予定です。スキップします。`);
        return true;
      }
    }
  }
  return false;
}

async function main() {
  const { flags, opts } = parseArgs();
  if (!opts.title || !opts.date) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --start HH:MM --end HH:MM");
    console.error("  bun run scripts/notion-add.ts --title <title> --date YYYY-MM-DD --allday");
    console.error("  Options: --db <routine|events|guitar|meals> --end-date YYYY-MM-DD");
    console.error("  Options: --actual-start HH:MM --actual-end HH:MM --location <住所>");
    process.exit(1);
  }

  const dbName = (opts.db || "routine") as ScheduleDbName;
  const { apiKey, dbId, config } = getScheduleDbConfig(dbName);

  const properties: Record<string, unknown> = {
    [config.titleProp]: { title: [{ text: { content: opts.title } }] },
  };

  if (flags.has("allday")) {
    const dateObj: Record<string, string> = { start: opts.date };
    if (opts["end-date"]) {
      dateObj.end = opts["end-date"];
    }
    properties[config.dateProp] = { date: dateObj };
  } else {
    if (!opts.start) {
      console.error("Error: --start required (or use --allday)");
      process.exit(1);
    }
    const endDate = opts["end-date"] || opts.date;
    const dateObj: Record<string, string> = {
      start: `${opts.date}T${opts.start}:00+09:00`,
    };
    if (opts.end) {
      dateObj.end = `${endDate}T${opts.end}:00+09:00`;
    }
    properties[config.dateProp] = { date: dateObj };
  }

  // 移動時間管理プロパティ（開始時間/終了時間/場所）
  if (opts["actual-start"]) {
    properties["開始時間"] = { rich_text: [{ text: { content: opts["actual-start"] } }] };
  }
  if (opts["actual-end"]) {
    properties["終了時間"] = { rich_text: [{ text: { content: opts["actual-end"] } }] };
  }
  if (opts.location) {
    properties["場所"] = { rich_text: [{ text: { content: opts.location } }] };
  }

  // 重複チェック
  const isDuplicate = await checkDuplicate(apiKey, dbId, config, opts.date, opts.title, opts.start, opts.end);
  if (isDuplicate) {
    process.exit(0);
  }

  const defaultEmoji = dbName === "meals" ? "🍽️" : "📌";
  const icon = pickTaskIcon(opts.title, defaultEmoji);
  const cover = pickCover();

  return notionFetch(apiKey, "/pages", { parent: { database_id: dbId }, properties, icon, cover })
    .then((data: any) => {
      const title = (data.properties[config.titleProp]?.title || [])
        .map((t: any) => t.plain_text || "").join("");
      const date = data.properties[config.dateProp]?.date;
      console.log(`追加しました: ${title} [${dbName}]`);
      if (date?.end) {
        console.log(`  ${date.start} 〜 ${date.end}`);
      } else if (date?.start) {
        console.log(`  ${date.start}`);
      }
    });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
