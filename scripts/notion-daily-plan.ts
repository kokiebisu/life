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
  type ScheduleDbName,
  type NormalizedEntry,
  getScheduleDbConfigOptional,
  queryDbByDate,
  normalizePages,
  parseArgs,
  todayJST,
} from "./lib/notion";
import { callClaude } from "./lib/claude";

const ROOT = join(import.meta.dir, "..");
const ASPECTS_DIR = join(ROOT, "aspects");
const PLANNING_DIR = join(ROOT, "planning");

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// --- Types ---

interface RoutinePoolItem {
  label: string;
  minutes: number;
  priority: number;
  splittable: boolean;
  minBlock: number;
}

interface FreeSlot {
  start: string; // "09:00"
  end: string; // "12:00"
  minutes: number;
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
  end: string; // "12:00"
  label: string;
  source: "routine" | "event" | "notion";
  aspect?: string;
  dbSource?: ScheduleDbName;
  notionRegistered?: boolean;
}

interface AllDayItem {
  label: string;
  aspect?: string;
  dbSource?: ScheduleDbName;
  notionRegistered?: boolean;
}

interface ScheduleConfig {
  activeHours: { start: string; end: string };
  routines: RoutinePoolItem[];
}

interface DailyPlanData {
  targetDate: string;
  targetWeekday: string;
  yesterdayDate: string;
  yesterdayWeekday: string;
  yesterdayTasks: NormalizedEntry[];
  todayTasks: NormalizedEntry[];
  localEvents: LocalEvent[];
  schedule: {
    confirmedTimeline: TimeSlot[];
    allDay: AllDayItem[];
    freeSlots: FreeSlot[];
    routinePool: RoutinePoolItem[];
    activeHours: { start: string; end: string };
    timeline: TimeSlot[]; // backward compat: confirmed + filled routines
  };
}

// --- Utility ---

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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a0 = timeToMinutes(aStart);
  const a1 = timeToMinutes(aEnd);
  const b0 = timeToMinutes(bStart);
  const b1 = timeToMinutes(bEnd);
  return a0 < b1 && b0 < a1;
}

// --- Schedule Config ---

function loadScheduleConfig(): ScheduleConfig {
  const configPath = join(ROOT, "aspects", "routine", "schedule.json");
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    return {
      activeHours: config.activeHours,
      routines: config.routines.map((r: any) => ({
        label: r.label,
        minutes: r.minutes,
        priority: r.priority,
        splittable: r.splittable ?? false,
        minBlock: r.minBlock ?? 30,
      })),
    };
  }
  // Fallback defaults (equivalent to old ROUTINE_SLOTS)
  return {
    activeHours: { start: "08:00", end: "22:00" },
    routines: [
      { label: "開発", minutes: 300, priority: 1, splittable: true, minBlock: 60 },
      { label: "ジム", minutes: 90, priority: 2, splittable: false, minBlock: 90 },
      { label: "ギター練習", minutes: 60, priority: 3, splittable: false, minBlock: 60 },
      { label: "読書", minutes: 90, priority: 4, splittable: true, minBlock: 30 },
    ],
  };
}

// --- Data Fetching ---

async function fetchAllDbEntries(date: string): Promise<NormalizedEntry[]> {
  const dbNames: ScheduleDbName[] = [
    "routine",
    "events",
    "guitar",
    "meals",
    "todo",
  ];
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

function loadLocalEvents(date: string): LocalEvent[] {
  const events: LocalEvent[] = [];

  // Check planning/events/
  const planningEventFile = join(PLANNING_DIR, "events", `${date}.md`);
  if (existsSync(planningEventFile)) {
    const content = readFileSync(planningEventFile, "utf-8");
    events.push(...parseEventLines(content, "planning"));
  }

  // Scan aspects/*/events/ directories
  let aspects: string[];
  try {
    aspects = readdirSync(ASPECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    aspects = [];
  }

  for (const aspect of aspects) {
    const filePath = join(ASPECTS_DIR, aspect, "events", `${date}.md`);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    events.push(...parseEventLines(content, aspect));
  }

  return events;
}

function parseEventLines(content: string, aspect: string): LocalEvent[] {
  const events: LocalEvent[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^- \[[ x]\] (.+?) (.+)$/);
    if (!match) continue;

    const timeStr = match[1];
    const title = match[2];
    let description = "";
    if (i + 1 < lines.length && lines[i + 1].startsWith("  - ")) {
      description = lines[i + 1].replace(/^\s+- /, "");
    }

    const timeRange = timeStr.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (timeRange) {
      events.push({
        aspect,
        start: timeRange[1],
        end: timeRange[2],
        allDay: false,
        title,
        description,
      });
    } else if (timeStr === "終日") {
      events.push({
        aspect,
        start: "",
        end: "",
        allDay: true,
        title,
        description,
      });
    } else {
      events.push({
        aspect,
        start: "",
        end: "",
        allDay: true,
        title: `${timeStr} ${title}`,
        description,
      });
    }
  }

  return events;
}

// --- Schedule Building ---

function buildConfirmedSchedule(
  localEvents: LocalEvent[],
  todayTasks: NormalizedEntry[],
): { confirmedTimeline: TimeSlot[]; allDay: AllDayItem[] } {
  const allDay: AllDayItem[] = [];
  const timedEvents: TimeSlot[] = [];

  // Collect from local events
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

  // Collect from Notion tasks
  for (const t of todayTasks) {
    if (!t.start.includes("T")) {
      allDay.push({
        label: t.title,
        dbSource: t.source,
        notionRegistered: true,
      });
      continue;
    }
    const start = formatTime(t.start);
    const end = t.end ? formatTime(t.end) : "";
    if (!end) {
      allDay.push({
        label: `${start}〜 ${t.title}`,
        dbSource: t.source,
        notionRegistered: true,
      });
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

  // Deduplicate: Notion entries take priority over local events
  const notionEvents = timedEvents.filter((e) => e.source === "notion");
  const deduped = timedEvents.filter((e) => {
    if (e.source !== "event") return true;
    const normalizedLocal = e.label.replace(/^\[[^\]]+\]\s*/, "").toLowerCase();
    return !notionEvents.some((n) => {
      const normalizedNotion = n.label.toLowerCase();
      return (
        overlaps(e.start, e.end, n.start, n.end) &&
        (normalizedNotion.includes(normalizedLocal) ||
          normalizedLocal.includes(normalizedNotion))
      );
    });
  });

  deduped.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return { confirmedTimeline: deduped, allDay };
}

function computeFreeSlots(
  confirmed: TimeSlot[],
  activeHours: { start: string; end: string },
): FreeSlot[] {
  const sorted = [...confirmed].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
  );

  const activeStart = timeToMinutes(activeHours.start);
  const activeEnd = timeToMinutes(activeHours.end);

  const freeSlots: FreeSlot[] = [];
  let cursor = activeStart;

  for (const slot of sorted) {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);

    // Only consider events within active hours
    const effectiveStart = Math.max(slotStart, activeStart);
    const effectiveEnd = Math.min(slotEnd, activeEnd);
    if (effectiveStart >= effectiveEnd) continue;

    if (effectiveStart > cursor) {
      const gap = effectiveStart - cursor;
      if (gap >= 30) {
        freeSlots.push({
          start: minutesToTime(cursor),
          end: minutesToTime(effectiveStart),
          minutes: gap,
        });
      }
    }
    cursor = Math.max(cursor, effectiveEnd);
  }

  // After last confirmed event to activeEnd
  if (activeEnd > cursor) {
    const gap = activeEnd - cursor;
    if (gap >= 30) {
      freeSlots.push({
        start: minutesToTime(cursor),
        end: minutesToTime(activeEnd),
        minutes: gap,
      });
    }
  }

  return freeSlots;
}

function fillRoutinesByPriority(
  freeSlots: FreeSlot[],
  routinePool: RoutinePoolItem[],
): TimeSlot[] {
  const sorted = [...routinePool].sort((a, b) => a.priority - b.priority);

  // Track available segments (mutable copies)
  const segments = freeSlots.map((s) => ({
    start: timeToMinutes(s.start),
    end: timeToMinutes(s.end),
  }));

  const result: TimeSlot[] = [];

  for (const routine of sorted) {
    let minutesLeft = routine.minutes;
    const minBlock = routine.minBlock;

    if (routine.splittable) {
      for (const seg of segments) {
        if (minutesLeft <= 0) break;
        const available = seg.end - seg.start;
        if (available < minBlock) continue;

        const allocate = Math.min(minutesLeft, available);
        if (allocate < minBlock) continue;

        result.push({
          start: minutesToTime(seg.start),
          end: minutesToTime(seg.start + allocate),
          label: routine.label,
          source: "routine",
        });

        seg.start += allocate;
        minutesLeft -= allocate;
      }
    } else {
      // Need a single contiguous block
      for (const seg of segments) {
        const available = seg.end - seg.start;
        if (available >= routine.minutes) {
          result.push({
            start: minutesToTime(seg.start),
            end: minutesToTime(seg.start + routine.minutes),
            label: routine.label,
            source: "routine",
          });

          seg.start += routine.minutes;
          minutesLeft = 0;
          break;
        }
      }
    }
  }

  return result;
}

// --- Markdown Output ---

function formatMarkdown(data: DailyPlanData): string {
  const lines: string[] = [];

  lines.push(`# デイリープラン: ${data.targetDate}（${data.targetWeekday}）`);
  lines.push("");

  // 昨日の振り返り
  lines.push(`## 昨日の振り返り（${data.yesterdayDate}）`);
  lines.push("");

  const actionableTasks = data.yesterdayTasks.filter(
    (t) => t.source === "todo" || t.source === "events",
  );

  if (actionableTasks.length > 0) {
    const done = actionableTasks.filter((t) => t.status === "Done");
    lines.push(`タスク: ${done.length}/${actionableTasks.length} 完了`);
  } else {
    lines.push("タスク: 登録なし");
  }

  const doneTasks = actionableTasks.filter((t) => t.status === "Done");
  if (doneTasks.length > 0) {
    lines.push("");
    lines.push("### 完了");
    for (const t of doneTasks) {
      lines.push(`  ✅ ${t.title}`);
    }
  }

  const incompleteTasks = actionableTasks.filter((t) => t.status !== "Done");
  if (incompleteTasks.length > 0) {
    lines.push("");
    lines.push("### 未完了（持ち越し候補）");
    for (const t of incompleteTasks) {
      lines.push(`  ⬜ ${t.title}`);
    }
  }

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
      lines.push(
        `${slot.start}-${slot.end}  ${icon} ${slot.label}${registered}`,
      );
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
  lines.push("> 🔶 = 確定した予定  🔹 = ルーティン（プールからの配置）");
  lines.push(
    "> ※登録済みのタスクは重複登録しないこと。空き時間にのみ新規追加する。",
  );

  lines.push("");
  lines.push("---");
  lines.push("");

  // 今日のポイント
  lines.push("## 今日のポイント");
  lines.push("");

  const points: string[] = [];

  for (const t of incompleteTasks) {
    points.push(`- 昨日未完了: ${t.title}`);
  }

  for (const t of feedbackTasks) {
    points.push(`- 💬 ${t.title} → ${t.feedback}`);
  }

  if (points.length > 0) {
    lines.push(...points);
  } else {
    lines.push("- 通常通りの1日。ルーティンを意識して過ごす");
  }

  lines.push("");
  return lines.join("\n");
}

// --- AI Generation ---

const SYSTEM_PROMPT = `あなたは松本あかり、ライフコーチです。ユーザーの1日のスケジュールを最適化します。

ルール:
1. 確定済み予定（🔶マーク / Notion登録済み）は時間を変更しない
2. ルーティンプールの項目を空き時間に最適配置する
3. 優先順位: sumitsugi(開発) > 運動/減量(ジム) > ギター > 投資 > study > 読書
4. フィードバックに基づいて時間配分・運動強度・休息を調整
5. 未完了タスクは可能な範囲で今日に組み込む
6. 出力はマークダウンのみ。説明文不要
7. **1ブロック = 1タスク（厳守）**: 「A + B」「A or B」「A / B / C」のような複合タイトル禁止。1つの時間枠には1つの活動だけ入れる
8. 夜の自由時間もその日に1つ選んで具体的に入れる（「study / 読書 / 投資」ではなく「読書」など）

ルーティンプール配置ルール:
- splittable: true → 複数の空きブロックに分割可能（minBlock 以上の単位で）
- splittable: false → 連続した1つの空きブロックに収まる必要がある。入らなければスキップ
- priority が小さいほど優先。空き時間が足りなければ低優先度のルーティンを削る
- 確定予定は絶対に変更しない。空き時間にのみルーティンを配置する

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
  const { confirmedTimeline, allDay, freeSlots, routinePool, activeHours } =
    data.schedule;

  if (confirmedTimeline.length > 0) {
    sections.push(`\n## 今日の確定予定（変更不可）`);
    for (const s of confirmedTimeline) {
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

  // 空き時間
  const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.minutes, 0);
  sections.push(`\n## 空き時間（合計 ${totalFreeMinutes} 分）`);
  sections.push(`活動時間帯: ${activeHours.start}〜${activeHours.end}`);
  for (const s of freeSlots) {
    sections.push(`- ${s.start}-${s.end}（${s.minutes}分）`);
  }

  // ルーティンプール
  const totalRoutineMinutes = routinePool.reduce(
    (sum, r) => sum + r.minutes,
    0,
  );
  sections.push(`\n## ルーティンプール（合計 ${totalRoutineMinutes} 分）`);
  for (const r of routinePool) {
    const split = r.splittable
      ? `分割可（最小${r.minBlock}分）`
      : "分割不可";
    sections.push(
      `- [優先${r.priority}] ${r.label}: ${r.minutes}分（${split}）`,
    );
  }

  if (totalRoutineMinutes > totalFreeMinutes) {
    sections.push(
      `\n⚠️ 空き時間（${totalFreeMinutes}分）< ルーティン合計（${totalRoutineMinutes}分）。優先度順で配置し、入りきらない低優先度ルーティンはスキップしてください。`,
    );
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

> 🔶 = 確定した予定  🔹 = ルーティン（プールからの配置）
> ※登録済みのタスクは重複登録しないこと。空き時間にのみ新規追加する。

---

## 今日のポイント

- フィードバックに基づく調整理由
- ルーティン配置の判断理由
`);

  return sections.join("\n");
}

async function generateAIPlan(data: DailyPlanData): Promise<string> {
  const userPrompt = buildUserPrompt(data);
  const result = await callClaude([{ role: "user", content: userPrompt }], {
    system: SYSTEM_PROMPT,
    maxTokens: 4096,
  });
  return result.trim();
}

// --- Main ---

async function main() {
  const { flags, opts } = parseArgs();
  const targetDate = opts.date || todayJST();
  const json = flags.has("json");
  const ai = flags.has("ai");

  const yesterdayDate = getYesterday(targetDate);

  // Fetch data
  const [yesterdayTasks, todayTasks] = await Promise.all([
    fetchAllDbEntries(yesterdayDate),
    fetchAllDbEntries(targetDate),
  ]);

  const localEvents = loadLocalEvents(targetDate);

  // Load schedule config
  const scheduleConfig = loadScheduleConfig();

  // Build confirmed schedule (no routines)
  const { confirmedTimeline, allDay } = buildConfirmedSchedule(
    localEvents,
    todayTasks,
  );

  // Compute free slots
  const freeSlots = computeFreeSlots(
    confirmedTimeline,
    scheduleConfig.activeHours,
  );

  // Fill routines for non-AI path (and backward-compat timeline)
  const filledRoutines = fillRoutinesByPriority(
    freeSlots,
    scheduleConfig.routines,
  );

  // Merge confirmed + filled routines into unified timeline
  const timeline = [...confirmedTimeline, ...filledRoutines].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
  );

  const data: DailyPlanData = {
    targetDate,
    targetWeekday: getWeekday(targetDate),
    yesterdayDate,
    yesterdayWeekday: getWeekday(yesterdayDate),
    yesterdayTasks,
    todayTasks,
    localEvents,
    schedule: {
      confirmedTimeline,
      allDay,
      freeSlots,
      routinePool: scheduleConfig.routines,
      activeHours: scheduleConfig.activeHours,
      timeline,
    },
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
