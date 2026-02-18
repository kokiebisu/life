#!/usr/bin/env bun
/**
 * デイリープランのスケジュールを Notion Calendar に同期
 *
 * 使い方:
 *   bun run scripts/notion-sync-schedule.ts --date 2026-02-15
 *   bun run scripts/notion-sync-schedule.ts --date 2026-02-15 --dry-run
 *
 * 動作:
 *   1. notion-daily-plan.ts --json でスケジュール取得
 *   2. notion-list.ts --json で既存イベント取得
 *   3. 未登録のルーティン枠を Notion に追加
 */

import { getScheduleDbConfig, notionFetch, parseArgs, todayJST, pickTaskIcon, pickCover, type ScheduleDbName } from "./lib/notion";

interface TimeSlot {
  start: string;
  end: string;
  label: string;
  source: "routine" | "event" | "notion";
  notionRegistered?: boolean;
}

interface DailyPlanData {
  schedule: {
    timeline: TimeSlot[];
    allDay: { label: string; aspect?: string; notionRegistered?: boolean }[];
  };
}

interface ExistingTask {
  title: string;
  start: string;
  end: string | null;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timeFromISO(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 2つの時間帯が重なっているか（1分でも重なればtrue） */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = timeToMinutes(aStart);
  const a1 = timeToMinutes(aEnd);
  const b0 = timeToMinutes(bStart);
  const b1 = timeToMinutes(bEnd);
  return a0 < b1 && b0 < a1;
}

async function main() {
  const { flags, opts } = parseArgs();
  const date = opts.date || todayJST();
  const dryRun = flags.has("dry-run");

  // 1. Get schedule from daily plan
  const planProc = Bun.spawn(
    ["bun", "run", "scripts/notion-daily-plan.ts", "--date", date, "--json"],
    { stdout: "pipe", stderr: "pipe", cwd: import.meta.dir + "/.." },
  );
  const planOutput = await new Response(planProc.stdout).text();
  const planErr = await new Response(planProc.stderr).text();
  await planProc.exited;
  if (planProc.exitCode !== 0) {
    console.error("Failed to get daily plan:", planErr);
    process.exit(1);
  }
  const planData: DailyPlanData = JSON.parse(planOutput);

  // 2. Get existing Notion events
  const listProc = Bun.spawn(
    ["bun", "run", "scripts/notion-list.ts", "--date", date, "--json"],
    { stdout: "pipe", stderr: "pipe", cwd: import.meta.dir + "/.." },
  );
  const listOutput = await new Response(listProc.stdout).text();
  await listProc.exited;
  const existing: ExistingTask[] = JSON.parse(listOutput || "[]");

  // 3. Find routine slots not yet registered (skip fragments < 30 min)
  const routineSlots = planData.schedule.timeline.filter(
    (s) => s.source === "routine" && !s.notionRegistered &&
      timeToMinutes(s.end) - timeToMinutes(s.start) >= 30,
  );

  const toRegister: TimeSlot[] = [];
  for (const slot of routineSlots) {
    // 時間帯が重なる既存イベントがあればスキップ（同日2回実行しても安全）
    const hasOverlap = existing.some((e) => {
      if (!e.start.includes("T") || !e.end) return false;
      return overlaps(slot.start, slot.end, timeFromISO(e.start), timeFromISO(e.end));
    });
    if (!hasOverlap) {
      toRegister.push(slot);
    }
  }

  if (toRegister.length === 0) {
    console.log("全てのルーティンは登録済みです");
    return;
  }

  console.log(`${toRegister.length} 件のルーティンを登録${dryRun ? "（dry-run）" : ""}:`);

  // Label → DB mapping for non-routine entries
  const GUITAR_LABEL = "ギター練習";

  /** Find the next unscheduled Lesson page in guitar DB (no date set, not completed) */
  async function findNextLesson(): Promise<{ id: string; title: string } | null> {
    const { apiKey, dbId } = getScheduleDbConfig("guitar");
    const resp = await notionFetch(apiKey, "/databases/" + dbId + "/query", {
      filter: {
        and: [
          { property: "名前", title: { starts_with: "Lesson" } },
          { property: "日付", date: { is_empty: true } },
          { property: "ステータス", status: { does_not_equal: "完了" } },
        ],
      },
      sorts: [{ property: "名前", direction: "ascending" }],
      page_size: 1,
    });
    const page = resp.results?.[0];
    if (!page) return null;
    const title = page.properties?.["名前"]?.title?.[0]?.plain_text || "";
    return { id: page.id, title };
  }

  for (const slot of toRegister) {
    const isGuitar = slot.label === GUITAR_LABEL;

    if (isGuitar) {
      // Guitar: find existing Lesson page and set date (don't create new)
      const lesson = await findNextLesson();
      if (!lesson) {
        console.log(`  ${slot.start}-${slot.end}  ⚠ 未スケジュールの Lesson が見つかりません [guitar]`);
        continue;
      }

      console.log(`  ${slot.start}-${slot.end}  ${lesson.title} [guitar]`);

      if (dryRun) continue;

      const { apiKey } = getScheduleDbConfig("guitar");
      await notionFetch(apiKey, `/pages/${lesson.id}`, {
        properties: {
          "日付": {
            date: {
              start: `${date}T${slot.start}:00+09:00`,
              end: `${date}T${slot.end}:00+09:00`,
            },
          },
        },
      }, "PATCH");
    } else {
      // Default: create new page in routine DB
      const { apiKey, dbId, config } = getScheduleDbConfig("routine");

      console.log(`  ${slot.start}-${slot.end}  ${slot.label}`);

      if (dryRun) continue;

      const properties: Record<string, unknown> = {
        [config.titleProp]: { title: [{ text: { content: slot.label } }] },
        [config.dateProp]: {
          date: {
            start: `${date}T${slot.start}:00+09:00`,
            end: `${date}T${slot.end}:00+09:00`,
          },
        },
      };

      await notionFetch(apiKey, "/pages", {
        parent: { database_id: dbId },
        properties,
        icon: pickTaskIcon(slot.label),
        cover: pickCover(),
      });
    }
  }

  if (!dryRun) {
    console.log("登録完了");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
