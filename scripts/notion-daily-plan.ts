#!/usr/bin/env bun
/**
 * デイリープラン生成（全4 DB対応）
 *
 * 使い方:
 *   bun run scripts/notion-daily-plan.ts              # 今日のプラン
 *   bun run scripts/notion-daily-plan.ts --date 2026-02-15  # 指定日
 *   bun run scripts/notion-daily-plan.ts --json        # JSON出力
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  type DbName, type NormalizedEntry, type DbConfig,
  getApiKey, getDbId, getDbIdOptional, getDbConfigOptional,
  notionFetch, queryDbByDate, normalizePages,
  parseArgs, todayJST,
} from "./lib/notion";

const ROOT = join(import.meta.dir, "..");
const ASPECTS_DIR = join(ROOT, "aspects");
const PLANNING_DIR = join(ROOT, "planning");

const MOOD_MAP: Record<string, string> = {
  "😊 良い": "good",
  "😐 普通": "ok",
  "😞 イマイチ": "bad",
};

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const WEEKDAY_NOTES: Record<string, string> = {
  "月": "月曜: 週次プラン作成（朝30分）→ 通常スケジュール",
  "水": "水曜: ジムの日。昼の運動を重めに",
  "金": "金曜: ジムの日。昼の運動を重めに",
  "土": "土曜: tsumugi開発は午前のみ。午後は自由時間",
  "日": "日曜: 教会 → ゆっくり過ごす日。ギターと読書中心",
};

interface JournalEntry {
  date: string;
  mood: string;
  body: string;
}

interface LocalEvent {
  aspect: string;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  description: string;
}

interface TimeSlot {
  start: string; // "09:00"
  end: string;   // "12:00"
  label: string;
  source: "routine" | "event" | "notion";
  aspect?: string;
  dbSource?: DbName;
  notionRegistered?: boolean; // Notion登録済みフラグ
}

const ROUTINE_SLOTS: TimeSlot[] = [
  { start: "09:00", end: "12:00", label: "tsumugi開発（集中タイム）", source: "routine" },
  { start: "12:00", end: "14:00", label: "昼食 + ジム or 運動", source: "routine" },
  { start: "14:00", end: "17:00", label: "tsumugi開発（続き）or 営業活動", source: "routine" },
  { start: "17:00", end: "18:00", label: "ギター練習（1時間）", source: "routine" },
  { start: "18:00", end: "20:00", label: "study / 読書 / 投資リサーチ / 自由時間", source: "routine" },
];

interface DailyPlanData {
  targetDate: string;
  targetWeekday: string;
  yesterdayDate: string;
  yesterdayWeekday: string;
  journal: JournalEntry | null;
  yesterdayTasks: NormalizedEntry[];
  todayTasks: NormalizedEntry[];
  localEvents: LocalEvent[];
  schedule: { timeline: TimeSlot[]; allDay: { label: string; aspect?: string; dbSource?: DbName; notionRegistered?: boolean }[] };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function richTextToString(richText: any[]): string {
  if (!richText || richText.length === 0) return "";
  return richText.map((seg: any) => seg.plain_text || "").join("");
}

function getYesterday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  return WEEKDAY_NAMES[d.getDay()];
}

async function fetchJournal(apiKey: string, dbId: string, date: string): Promise<JournalEntry | null> {
  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: { property: "Date", date: { equals: date } },
  });

  if (data.results.length === 0) return null;

  const props = data.results[0].properties;
  return {
    date,
    mood: props.Mood?.select?.name || "",
    body: richTextToString(props.Body?.rich_text),
  };
}

async function fetchAllDbEntries(date: string): Promise<NormalizedEntry[]> {
  const dbNames: DbName[] = ["routine", "events", "guitar", "meals"];
  const allEntries: NormalizedEntry[] = [];

  const queries = dbNames.map(async (name) => {
    const dbConf = getDbConfigOptional(name);
    if (!dbConf) return;
    const { apiKey, dbId, config } = dbConf;
    const data = await queryDbByDate(apiKey, dbId, config, date, date);
    allEntries.push(...normalizePages(data.results, config, name));
  });
  await Promise.all(queries);

  allEntries.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  return allEntries;
}

async function fetchRoutineEntries(date: string): Promise<NormalizedEntry[]> {
  const dbConf = getDbConfigOptional("routine");
  if (!dbConf) return [];
  const { apiKey, dbId, config } = dbConf;
  const data = await queryDbByDate(apiKey, dbId, config, date, date);
  return normalizePages(data.results, config, "routine");
}

function loadLocalEvents(date: string): LocalEvent[] {
  const events: LocalEvent[] = [];

  // Scan aspects/*/events/ directories
  let aspects: string[];
  try {
    aspects = readdirSync(ASPECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    aspects = [];
  }

  // Also check planning/events/
  const planningEventFile = join(PLANNING_DIR, "events", `${date}.md`);
  if (existsSync(planningEventFile)) {
    const content = readFileSync(planningEventFile, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^- \[[ x]\] (.+?) (.+)$/);
      if (match) {
        const timeStr = match[1];
        const title = match[2];
        let description = "";
        if (i + 1 < lines.length && lines[i + 1].startsWith("  - ")) {
          description = lines[i + 1].replace(/^\s+- /, "");
        }
        const timeRange = timeStr.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (timeRange) {
          events.push({ aspect: "planning", start: timeRange[1], end: timeRange[2], allDay: false, title, description });
        } else if (timeStr === "終日") {
          events.push({ aspect: "planning", start: "", end: "", allDay: true, title, description });
        } else {
          events.push({ aspect: "planning", start: "", end: "", allDay: true, title: `${timeStr} ${title}`, description });
        }
      }
    }
  }

  for (const aspect of aspects) {
    const filePath = join(ASPECTS_DIR, aspect, "events", `${date}.md`);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^- \[[ x]\] (.+?) (.+)$/);
      if (match) {
        const timeStr = match[1];
        const title = match[2];
        let description = "";
        if (i + 1 < lines.length && lines[i + 1].startsWith("  - ")) {
          description = lines[i + 1].replace(/^\s+- /, "");
        }

        const timeRange = timeStr.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (timeRange) {
          events.push({ aspect, start: timeRange[1], end: timeRange[2], allDay: false, title, description });
        } else if (timeStr === "終日") {
          events.push({ aspect, start: "", end: "", allDay: true, title, description });
        } else {
          // 時間形式が不明な場合はそのまま終日扱い
          events.push({ aspect, start: "", end: "", allDay: true, title: `${timeStr} ${title}`, description });
        }
      }
    }
  }

  return events;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function buildSchedule(
  localEvents: LocalEvent[],
  todayTasks: NormalizedEntry[],
): { timeline: TimeSlot[]; allDay: { label: string; aspect?: string; dbSource?: DbName; notionRegistered?: boolean }[] } {
  // Start with routine slots as base
  let slots: TimeSlot[] = ROUTINE_SLOTS.map((s) => ({ ...s }));

  const allDay: { label: string; aspect?: string; dbSource?: DbName; notionRegistered?: boolean }[] = [];

  // Collect timed events from local events
  const timedEvents: TimeSlot[] = [];
  for (const ev of localEvents) {
    if (ev.allDay) {
      const desc = ev.description ? ` — ${ev.description}` : "";
      allDay.push({ label: `${ev.title}${desc}`, aspect: ev.aspect });
      continue;
    }
    const desc = ev.description ? ` — ${ev.description}` : "";
    timedEvents.push({
      start: ev.start,
      end: ev.end,
      label: `[${ev.aspect}] ${ev.title}${desc}`,
      source: "event",
      aspect: ev.aspect,
    });
  }

  // Collect timed events from Notion tasks
  for (const t of todayTasks) {
    if (!t.start.includes("T")) {
      // All-day Notion task
      allDay.push({ label: t.title, dbSource: t.source, notionRegistered: true });
      continue;
    }
    const start = formatTime(t.start);
    const end = t.end ? formatTime(t.end) : "";
    if (!end) {
      // No end time → treat as all-day
      allDay.push({ label: `${start}〜 ${t.title}`, dbSource: t.source, notionRegistered: true });
      continue;
    }
    timedEvents.push({
      start,
      end,
      label: t.title,
      source: "notion",
      dbSource: t.source,
      notionRegistered: true,
    });
  }

  // Sort timed events by start time
  timedEvents.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  // Trim/split routine slots around each timed event
  for (const event of timedEvents) {
    const evStart = timeToMinutes(event.start);
    const evEnd = timeToMinutes(event.end);

    const newSlots: TimeSlot[] = [];
    for (const slot of slots) {
      if (slot.source !== "routine") {
        newSlots.push(slot);
        continue;
      }

      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);

      // No overlap
      if (evEnd <= slotStart || evStart >= slotEnd) {
        newSlots.push(slot);
        continue;
      }

      // Event fully covers routine → remove routine
      if (evStart <= slotStart && evEnd >= slotEnd) {
        continue;
      }

      // Event overlaps start of routine → trim routine start
      if (evStart <= slotStart && evEnd < slotEnd) {
        newSlots.push({ ...slot, start: minutesToTime(evEnd) });
        continue;
      }

      // Event overlaps end of routine → trim routine end
      if (evStart > slotStart && evEnd >= slotEnd) {
        newSlots.push({ ...slot, end: minutesToTime(evStart) });
        continue;
      }

      // Event in the middle → split routine
      newSlots.push({ ...slot, end: minutesToTime(evStart) });
      newSlots.push({ ...slot, start: minutesToTime(evEnd) });
    }
    slots = newSlots;
  }

  // Add timed events to slots
  slots.push(...timedEvents);

  // Sort all by start time
  slots.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return { timeline: slots, allDay };
}

function formatMarkdown(data: DailyPlanData): string {
  const lines: string[] = [];

  lines.push(`# デイリープラン: ${data.targetDate}（${data.targetWeekday}）`);
  lines.push("");

  // 昨日の振り返り
  lines.push(`## 昨日の振り返り（${data.yesterdayDate}）`);
  lines.push("");

  if (data.journal) {
    lines.push(`気分: ${data.journal.mood || "未記入"}`);
  } else {
    lines.push("気分: 未記入");
  }

  if (data.yesterdayTasks.length > 0) {
    const done = data.yesterdayTasks.filter((t) => t.status === "Done");
    lines.push(`タスク: ${done.length}/${data.yesterdayTasks.length} 完了`);
  } else {
    lines.push("タスク: 登録なし");
  }

  // 完了タスク
  const doneTasks = data.yesterdayTasks.filter((t) => t.status === "Done");
  if (doneTasks.length > 0) {
    lines.push("");
    lines.push("### 完了");
    for (const t of doneTasks) {
      lines.push(`  ✅ ${t.title}`);
    }
  }

  // 未完了タスク
  const incompleteTasks = data.yesterdayTasks.filter((t) => t.status !== "Done");
  if (incompleteTasks.length > 0) {
    lines.push("");
    lines.push("### 未完了（持ち越し候補）");
    for (const t of incompleteTasks) {
      lines.push(`  ⬜ ${t.title}`);
    }
  }

  // フィードバック
  const feedbackTasks = data.yesterdayTasks.filter((t) => t.feedback);
  if (feedbackTasks.length > 0) {
    lines.push("");
    lines.push("### フィードバック");
    for (const t of feedbackTasks) {
      lines.push(`  💬 ${t.title} → ${t.feedback}`);
    }
  }

  // 日記
  lines.push("");
  lines.push("### 日記");
  if (data.journal?.body) {
    lines.push(`  ${data.journal.body}`);
  } else {
    lines.push("  昨日の日記が未記入です");
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // 今日のスケジュール（統合タイムライン）
  lines.push("## 今日のスケジュール");
  lines.push("");

  const { timeline, allDay } = data.schedule;

  if (timeline.length > 0) {
    for (const slot of timeline) {
      const icon = slot.source === "routine" ? "🔹" : "🔶";
      const registered = slot.notionRegistered ? "（※登録済み）" : "";
      lines.push(`${slot.start}-${slot.end}  ${icon} ${slot.label}${registered}`);
    }
  } else {
    lines.push("予定なし");
  }

  if (allDay.length > 0) {
    lines.push("");
    lines.push("### 終日");
    for (const item of allDay) {
      const prefix = item.aspect ? `[${item.aspect}] ` : "";
      const registered = item.notionRegistered ? "（※登録済み）" : "";
      lines.push(`- ${prefix}${item.label}${registered}`);
    }
  }

  lines.push("");
  lines.push("> 🔶 = 確定した予定  🔹 = ルーティン（テンプレートからの提案）");
  lines.push("> ※登録済みのタスクは重複登録しないこと。空き時間にのみ新規追加する。");

  lines.push("");
  lines.push("---");
  lines.push("");

  // 今日のポイント
  lines.push("## 今日のポイント");
  lines.push("");

  const points: string[] = [];

  // 持ち越し
  for (const t of incompleteTasks) {
    points.push(`- 昨日未完了: ${t.title}`);
  }

  // フィードバック引用
  for (const t of feedbackTasks) {
    points.push(`- 💬 ${t.title} → ${t.feedback}`);
  }

  // 気分ベース
  if (data.journal?.mood) {
    const moodKey = MOOD_MAP[data.journal.mood];
    if (moodKey === "bad") {
      points.push("- 昨日は調子がイマイチ。無理しない1日に");
    }
  }

  // 日記未記入
  if (!data.journal?.body) {
    points.push("- 昨日の日記が未記入です");
  }

  // 曜日メモ
  const weekdayNote = WEEKDAY_NOTES[data.targetWeekday];
  if (weekdayNote) {
    points.push(`- ${weekdayNote}`);
  }

  if (points.length > 0) {
    lines.push(...points);
  } else {
    lines.push("- 通常通りの1日。ルーティンを意識して過ごす");
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { flags, opts } = parseArgs();
  const targetDate = opts.date || todayJST();
  const json = flags.has("json");

  const apiKey = getApiKey();
  const journalDbId = getDbIdOptional("NOTION_JOURNAL_DB");

  const yesterdayDate = getYesterday(targetDate);

  const [journal, yesterdayTasks, todayTasks] = await Promise.all([
    journalDbId ? fetchJournal(apiKey, journalDbId, yesterdayDate) : Promise.resolve(null),
    fetchRoutineEntries(yesterdayDate),
    fetchAllDbEntries(targetDate),
  ]);

  const localEvents = loadLocalEvents(targetDate);
  const schedule = buildSchedule(localEvents, todayTasks);

  const data: DailyPlanData = {
    targetDate,
    targetWeekday: getWeekday(targetDate),
    yesterdayDate,
    yesterdayWeekday: getWeekday(yesterdayDate),
    journal,
    yesterdayTasks,
    todayTasks,
    localEvents,
    schedule,
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(formatMarkdown(data));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
