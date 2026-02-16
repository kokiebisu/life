#!/usr/bin/env bun
/**
 * デイリープラン生成（全4 DB対応）
 *
 * 使い方:
 *   bun run scripts/notion-daily-plan.ts              # 今日のプラン
 *   bun run scripts/notion-daily-plan.ts --date 2026-02-15  # 指定日
 *   bun run scripts/notion-daily-plan.ts --json        # JSON出力
 *   bun run scripts/notion-daily-plan.ts --ai          # AI最適化プラン
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  type ScheduleDbName, type NormalizedEntry,
  getScheduleDbConfigOptional,
  queryDbByDate, normalizePages,
  parseArgs, todayJST,
} from "./lib/notion";
import { callClaude } from "./lib/claude";

const ROOT = join(import.meta.dir, "..");
const ASPECTS_DIR = join(ROOT, "aspects");
const PLANNING_DIR = join(ROOT, "planning");

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

const WEEKDAY_NOTES: Record<string, string> = {
  "月": "月曜: 週次プラン作成（朝30分）→ 通常スケジュール",
  "水": "水曜: ジムの日。昼の運動を重めに",
  "金": "金曜: ジムの日。昼の運動を重めに",
  "土": "土曜: sumitsugi開発は午前のみ。午後は自由時間",
  "日": "日曜: 教会 → ゆっくり過ごす日。ギターと読書中心",
};

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
  dbSource?: ScheduleDbName;
  notionRegistered?: boolean; // Notion登録済みフラグ
}

const ROUTINE_SLOTS: TimeSlot[] = [
  { start: "09:00", end: "12:00", label: "sumitsugi開発", source: "routine" },
  { start: "12:00", end: "13:00", label: "昼食", source: "routine" },
  { start: "13:00", end: "14:00", label: "運動", source: "routine" },
  { start: "14:00", end: "17:00", label: "sumitsugi開発", source: "routine" },
  { start: "17:00", end: "18:00", label: "ギター練習", source: "routine" },
  { start: "18:00", end: "20:00", label: "自由時間", source: "routine" },
];

interface DailyPlanData {
  targetDate: string;
  targetWeekday: string;
  yesterdayDate: string;
  yesterdayWeekday: string;
  yesterdayTasks: NormalizedEntry[];
  todayTasks: NormalizedEntry[];
  localEvents: LocalEvent[];
  schedule: { timeline: TimeSlot[]; allDay: { label: string; aspect?: string; dbSource?: ScheduleDbName; notionRegistered?: boolean }[] };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
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

async function fetchAllDbEntries(date: string): Promise<NormalizedEntry[]> {
  const dbNames: ScheduleDbName[] = ["routine", "events", "guitar", "meals", "todo"];
  const allEntries: NormalizedEntry[] = [];

  const queries = dbNames.map(async (name) => {
    const dbConf = getScheduleDbConfigOptional(name);
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
  const dbConf = getScheduleDbConfigOptional("routine");
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

/** 2つの時間帯が重なっているか */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = timeToMinutes(aStart);
  const a1 = timeToMinutes(aEnd);
  const b0 = timeToMinutes(bStart);
  const b1 = timeToMinutes(bEnd);
  return a0 < b1 && b0 < a1;
}

function buildSchedule(
  localEvents: LocalEvent[],
  todayTasks: NormalizedEntry[],
): { timeline: TimeSlot[]; allDay: { label: string; aspect?: string; dbSource?: ScheduleDbName; notionRegistered?: boolean }[] } {
  // Start with routine slots as base
  let slots: TimeSlot[] = ROUTINE_SLOTS.map((s) => ({ ...s }));

  const allDay: { label: string; aspect?: string; dbSource?: ScheduleDbName; notionRegistered?: boolean }[] = [];

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

  // Bug 1: Deduplicate local events vs Notion entries
  // Notion entries take priority; remove local events that overlap with a similar Notion entry
  const notionEvents = timedEvents.filter((e) => e.source === "notion");
  const deduped = timedEvents.filter((e) => {
    if (e.source !== "event") return true;
    // Normalize label: strip "[aspect] " prefix for comparison
    const normalizedLocal = e.label.replace(/^\[[^\]]+\]\s*/, "").toLowerCase();
    return !notionEvents.some((n) => {
      const normalizedNotion = n.label.toLowerCase();
      return (
        overlaps(e.start, e.end, n.start, n.end) &&
        (normalizedNotion.includes(normalizedLocal) || normalizedLocal.includes(normalizedNotion))
      );
    });
  });

  // Sort timed events by start time
  deduped.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  // Trim/split routine slots around each timed event
  for (const event of deduped) {
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

  // Bug 2: Remove routine fragments shorter than 30 minutes after carving
  slots = slots.filter((s) => {
    if (s.source !== "routine") return true;
    return timeToMinutes(s.end) - timeToMinutes(s.start) >= 30;
  });

  // Add timed events to slots
  slots.push(...deduped);

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

  // 振り返り対象は todo と events のみ（routine/meals/guitar はアクション不要）
  const actionableTasks = data.yesterdayTasks.filter(
    (t) => t.source === "todo" || t.source === "events",
  );

  if (actionableTasks.length > 0) {
    const done = actionableTasks.filter((t) => t.status === "Done");
    lines.push(`タスク: ${done.length}/${actionableTasks.length} 完了`);
  } else {
    lines.push("タスク: 登録なし");
  }

  // 完了タスク
  const doneTasks = actionableTasks.filter((t) => t.status === "Done");
  if (doneTasks.length > 0) {
    lines.push("");
    lines.push("### 完了");
    for (const t of doneTasks) {
      lines.push(`  ✅ ${t.title}`);
    }
  }

  // 未完了タスク
  const incompleteTasks = actionableTasks.filter((t) => t.status !== "Done");
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

const SYSTEM_PROMPT = `あなたは松本あかり、ライフコーチです。ユーザーの1日のスケジュールを最適化します。

ルール:
1. 確定済み予定（🔶マーク / Notion登録済み）は時間を変更しない
2. ルーティン枠（🔹）のみ調整可能
3. 優先順位: sumitsugi > 運動/減量 > ギター > 投資 > study > 読書
4. フィードバックに基づいて時間配分・運動強度・休息を調整
5. 未完了タスクは可能な範囲で今日に組み込む
6. 出力はマークダウンのみ。説明文不要

フィードバック解釈:
- 「疲れた」「だるい」→ 運動軽め、休憩増
- 「進捗遅れ」「終わらなかった」→ 該当aspectの時間延長
- 「楽しかった」「調子いい」→ 継続or負荷UP
- 「サボった」→ ハードル下げ（時間短縮）
- 未完了多い → 今日は重要タスクに絞る`;

function buildUserPrompt(data: DailyPlanData): string {
  const sections: string[] = [];

  // 日付・曜日
  sections.push(`## 対象日: ${data.targetDate}（${data.targetWeekday}）`);
  const weekdayNote = WEEKDAY_NOTES[data.targetWeekday];
  if (weekdayNote) {
    sections.push(`曜日ルール: ${weekdayNote}`);
  }

  // 昨日の完了/未完了（todo と events のみ）
  const actionableForAI = data.yesterdayTasks.filter(
    (t) => t.source === "todo" || t.source === "events",
  );
  const done = actionableForAI.filter((t) => t.status === "Done");
  const incomplete = actionableForAI.filter((t) => t.status !== "Done");

  if (done.length > 0) {
    sections.push(`\n## 昨日の完了タスク（${data.yesterdayDate}）`);
    for (const t of done) {
      sections.push(`- ✅ [${t.source}] ${t.title}`);
    }
  }

  if (incomplete.length > 0) {
    sections.push(`\n## 昨日の未完了タスク`);
    for (const t of incomplete) {
      sections.push(`- ⬜ [${t.source}] ${t.title}`);
    }
  }

  // フィードバック
  const feedbackTasks = data.yesterdayTasks.filter((t) => t.feedback);
  if (feedbackTasks.length > 0) {
    sections.push(`\n## 昨日のフィードバック`);
    for (const t of feedbackTasks) {
      sections.push(`- [${t.source}] ${t.title}: 「${t.feedback}」`);
    }
  }

  // 今日の確定予定
  const { timeline, allDay } = data.schedule;
  const confirmedSlots = timeline.filter((s) => s.source !== "routine");
  if (confirmedSlots.length > 0) {
    sections.push(`\n## 今日の確定予定（変更不可）`);
    for (const s of confirmedSlots) {
      sections.push(`- ${s.start}-${s.end} 🔶 ${s.label}`);
    }
  }

  if (allDay.length > 0) {
    sections.push(`\n## 今日の終日予定`);
    for (const item of allDay) {
      const prefix = item.aspect ? `[${item.aspect}] ` : "";
      sections.push(`- ${prefix}${item.label}`);
    }
  }

  // ルーティンテンプレート
  const routineSlots = timeline.filter((s) => s.source === "routine");
  if (routineSlots.length > 0) {
    sections.push(`\n## ルーティン枠（調整可能）`);
    for (const s of routineSlots) {
      sections.push(`- ${s.start}-${s.end} 🔹 ${s.label}`);
    }
  }

  // 出力フォーマット
  sections.push(`\n## 出力フォーマット

以下の形式でマークダウンを出力してください:

# デイリープラン: ${data.targetDate}（${data.targetWeekday}）

## 昨日の振り返り（${data.yesterdayDate}）

タスク: X/Y 完了

### 完了
  ✅ タスク名

### 未完了（持ち越し候補）
  ⬜ タスク名

### フィードバック
  💬 タスク名 → フィードバック内容

---

## 今日のスケジュール

HH:MM-HH:MM  🔶/🔹 タスク名

### 終日
- タスク名

> 🔶 = 確定した予定  🔹 = ルーティン（テンプレートからの提案）
> ※登録済みのタスクは重複登録しないこと。空き時間にのみ新規追加する。

---

## 今日のポイント

- フィードバックに基づく調整理由
- 曜日メモ
`);

  return sections.join("\n");
}

async function generateAIPlan(data: DailyPlanData): Promise<string> {
  const userPrompt = buildUserPrompt(data);
  const result = await callClaude(
    [{ role: "user", content: userPrompt }],
    { system: SYSTEM_PROMPT, maxTokens: 4096 },
  );
  return result.trim();
}

async function main() {
  const { flags, opts } = parseArgs();
  const targetDate = opts.date || todayJST();
  const json = flags.has("json");
  const ai = flags.has("ai");

  const yesterdayDate = getYesterday(targetDate);

  const [yesterdayTasks, todayTasks] = await Promise.all([
    fetchAllDbEntries(yesterdayDate),
    fetchAllDbEntries(targetDate),
  ]);

  const localEvents = loadLocalEvents(targetDate);
  const schedule = buildSchedule(localEvents, todayTasks);

  const data: DailyPlanData = {
    targetDate,
    targetWeekday: getWeekday(targetDate),
    yesterdayDate,
    yesterdayWeekday: getWeekday(yesterdayDate),
    yesterdayTasks,
    todayTasks,
    localEvents,
    schedule,
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (ai) {
    try {
      console.log(await generateAIPlan(data));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`AI generation failed, using template: ${msg}`);
      console.log(formatMarkdown(data));
    }
    return;
  }

  console.log(formatMarkdown(data));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
