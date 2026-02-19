#!/usr/bin/env bun
/**
 * デイリープラン生成（全4 DB対応）
 *
 * 使い方:
 *   bun run scripts/notion-daily-plan.ts              # 今日のプラン
 *   bun run scripts/notion-daily-plan.ts --date 2026-02-15  # 指定日
 *   bun run scripts/notion-daily-plan.ts --json        # JSON出力
 *   bun run scripts/notion-daily-plan.ts --ai          # AI最適化プラン
 *   bun run scripts/notion-daily-plan.ts --week-stats  # 週間バランス表示
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  type ScheduleDbName,
  type NormalizedEntry,
  getScheduleDbConfigOptional,
  queryDbByDateCached,
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

type ConflictAction = "keep" | "delete" | "shift" | "shrink";

interface ConflictOverride {
  match: { label?: string; dbSource?: ScheduleDbName };
  action: ConflictAction;
  shiftDirection?: "later" | "earlier";
  maxShiftMinutes?: number;
  allowExceedActiveHours?: boolean;
  minMinutes?: number;
}

interface ConflictRules {
  dbPriority: ScheduleDbName[];
  defaults: Partial<Record<ScheduleDbName, ConflictAction>>;
  overrides: ConflictOverride[];
}

interface ConflictResolution {
  entry: TimeSlot;
  action: ConflictAction;
  conflictWith: TimeSlot;
  originalStart: string;
  originalEnd: string;
  newStart?: string;
  newEnd?: string;
  warning?: string;
}

interface RoutinePoolItem {
  label: string;
  minutes: number;
  ratio?: number;
  priority: number;
  splittable: boolean;
  minBlock: number;
  preferred?: "start" | "end";
  earliestStart?: string; // "21:00" — skip if no slot available after this time
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
  notionId?: string;
  notionRegistered?: boolean;
  actualStart?: string; // "18:30" — 実際のイベント開始時刻
  actualEnd?: string;   // "21:00" — 実際のイベント終了時刻
}

interface AllDayItem {
  label: string;
  aspect?: string;
  dbSource?: ScheduleDbName;
  notionRegistered?: boolean;
}

interface WeekRoutineHistory {
  label: string;
  totalMinutes: number; // 完了した合計分数
}

interface AdjustedRatio {
  label: string;
  targetRatio: number;
  actualRatio: number;
  adjustedRatio: number;
  weekMinutes: number; // 今週の実績分数
  todayMinutes: number; // 今日の配分分数
}

interface WeeklyStats {
  weekStart: string; // "2026-02-16"
  weekEnd: string; // "2026-02-22"
  daysElapsed: number;
  daysTotal: number;
  adjustedRatios: AdjustedRatio[];
}

interface ScheduleConfig {
  activeHours: { start: string; end: string };
  routines: RoutinePoolItem[];
  conflictRules?: ConflictRules;
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
    conflictResolutions?: ConflictResolution[];
  };
  weeklyStats?: WeeklyStats;
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

function getWeekStartDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // Monday-based
  d.setDate(d.getDate() - diff);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function getWeekEndDate(dateStr: string): string {
  const monday = getWeekStartDate(dateStr);
  const d = new Date(monday + "T12:00:00+09:00");
  d.setDate(d.getDate() + 6); // Sunday
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function daysBetween(startStr: string, endStr: string): number {
  const s = new Date(startStr + "T12:00:00+09:00");
  const e = new Date(endStr + "T12:00:00+09:00");
  return Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
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
        minutes: r.minutes ?? 0,
        ratio: r.ratio,
        priority: r.priority,
        splittable: r.splittable ?? false,
        minBlock: r.minBlock ?? 30,
        preferred: r.preferred,
        earliestStart: r.earliestStart,
      })),
      conflictRules: config.conflictRules,
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
    "groceries",
    "todo",
  ];
  const allEntries: NormalizedEntry[] = [];

  const queries = dbNames.map(async (name) => {
    const dbConf = getScheduleDbConfigOptional(name);
    if (!dbConf) return;
    const { apiKey, dbId, config } = dbConf;
    const data = await queryDbByDateCached(apiKey, dbId, config, date, date);
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

// --- Weekly Ratio Tracking ---

async function fetchWeekRoutineHistory(
  weekStart: string,
  yesterday: string,
  ratioRoutines: RoutinePoolItem[],
): Promise<WeekRoutineHistory[]> {
  if (weekStart > yesterday) return []; // Monday: no prior data

  const dbConf = getScheduleDbConfigOptional("routine");
  if (!dbConf) return [];

  const { apiKey, dbId, config } = dbConf;
  const data = await queryDbByDateCached(apiKey, dbId, config, weekStart, yesterday);
  const entries = normalizePages(data.results, config, "routine");

  // Count completed minutes per label
  const minutesByLabel = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== "Done" && entry.status !== "完了") continue;
    if (!entry.start.includes("T") || !entry.end) continue;

    const startMs = new Date(entry.start).getTime();
    const endMs = new Date(entry.end).getTime();
    const mins = Math.round((endMs - startMs) / 60000);
    if (mins <= 0) continue;

    // Match entry title to schedule.json labels via prefix matching
    const matchedLabel = matchRoutineLabel(entry.title, ratioRoutines);
    if (!matchedLabel) continue;

    minutesByLabel.set(matchedLabel, (minutesByLabel.get(matchedLabel) || 0) + mins);
  }

  return ratioRoutines.map((r) => ({
    label: r.label,
    totalMinutes: minutesByLabel.get(r.label) || 0,
  }));
}

function matchRoutineLabel(title: string, routines: RoutinePoolItem[]): string | null {
  const normalized = title.toLowerCase();
  // Exact match first
  for (const r of routines) {
    if (normalized === r.label.toLowerCase()) return r.label;
  }
  // Prefix match: "開発 @ 図書館" → "開発"
  for (const r of routines) {
    if (normalized.startsWith(r.label.toLowerCase())) return r.label;
  }
  // Reverse prefix: label starts with title
  for (const r of routines) {
    if (r.label.toLowerCase().startsWith(normalized)) return r.label;
  }
  return null;
}

function computeAdjustedRatios(
  ratioRoutines: RoutinePoolItem[],
  history: WeekRoutineHistory[],
  daysElapsed: number,
  daysTotal: number,
  poolForRatio: number,
): AdjustedRatio[] {
  const totalTracked = history.reduce((sum, h) => sum + h.totalMinutes, 0);

  // Monday or no data: use raw ratios
  if (daysElapsed === 0 || totalTracked === 0) {
    return ratioRoutines.map((r) => {
      const todayMinutes = Math.max(r.minBlock, Math.floor(poolForRatio * r.ratio!));
      return {
        label: r.label,
        targetRatio: r.ratio!,
        actualRatio: 0,
        adjustedRatio: r.ratio!,
        weekMinutes: 0,
        todayMinutes,
      };
    });
  }

  const daysRemaining = daysTotal - daysElapsed;
  const correctionWeight = Math.min(daysElapsed / daysRemaining, 2.0);

  // Compute adjusted ratios
  const raw: { label: string; targetRatio: number; actualRatio: number; adjusted: number }[] = [];
  for (const r of ratioRoutines) {
    const h = history.find((h) => h.label === r.label);
    const actualRatio = h ? h.totalMinutes / totalTracked : 0;
    const adjusted = r.ratio! + (r.ratio! - actualRatio) * correctionWeight;
    raw.push({
      label: r.label,
      targetRatio: r.ratio!,
      actualRatio,
      adjusted: Math.max(adjusted, 0.05), // Floor 5%
    });
  }

  // Normalize to sum = 1.0
  const totalAdjusted = raw.reduce((sum, r) => sum + r.adjusted, 0);
  const normalized = raw.map((r) => ({
    ...r,
    adjusted: r.adjusted / totalAdjusted,
  }));

  return normalized.map((r) => {
    const h = history.find((h) => h.label === r.label);
    const todayMinutes = Math.max(
      ratioRoutines.find((rr) => rr.label === r.label)!.minBlock,
      Math.floor(poolForRatio * r.adjusted),
    );
    return {
      label: r.label,
      targetRatio: r.targetRatio,
      actualRatio: r.actualRatio,
      adjustedRatio: r.adjusted,
      weekMinutes: h?.totalMinutes || 0,
      todayMinutes,
    };
  });
}

// --- Schedule Building ---

const ASPECT_TO_DB: Record<string, ScheduleDbName> = {
  planning: "events",
  diet: "meals",
  guitar: "guitar",
  routine: "routine",
};

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
      allDay.push({ label: `${ev.title}${desc}`, aspect: ev.aspect, dbSource: ASPECT_TO_DB[ev.aspect] });
      continue;
    }
    const desc = ev.description ? ` — ${ev.description}` : "";
    timedEvents.push({
      start: ev.start,
      end: ev.end,
      label: `[${ev.aspect}] ${ev.title}${desc}`,
      source: "event",
      aspect: ev.aspect,
      dbSource: ASPECT_TO_DB[ev.aspect],
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
      notionId: t.id,
      notionRegistered: true,
      actualStart: t.actualStart || undefined,
      actualEnd: t.actualEnd || undefined,
    });
  }

  // Deduplicate: Notion entries take priority over local events (label match only)
  const notionEvents = timedEvents.filter((e) => e.source === "notion");
  const usedNotionIds = new Set<string>();
  const deduped = timedEvents.filter((e) => {
    if (e.source !== "event") return true;
    const normalizedLocal = e.label.replace(/^\[[^\]]+\]\s*/, "").toLowerCase();
    const match = notionEvents.find((n) => {
      if (n.notionId && usedNotionIds.has(n.notionId)) return false;
      const normalizedNotion = n.label.toLowerCase();
      return (
        normalizedNotion.includes(normalizedLocal) ||
        normalizedLocal.includes(normalizedNotion)
      );
    });
    if (match) {
      if (match.notionId) usedNotionIds.add(match.notionId);
      return false;
    }
    return true;
  });

  deduped.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  return { confirmedTimeline: deduped, allDay };
}

function resolveTimelineConflicts(
  timeline: TimeSlot[],
  rules: ConflictRules,
  activeHours: { start: string; end: string },
): { resolved: TimeSlot[]; resolutions: ConflictResolution[] } {
  const resolved = timeline
    .map((s) => ({ ...s }))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const resolutions: ConflictResolution[] = [];
  const maxIterations = resolved.length * 2;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Find first overlapping pair
    let foundOverlap = false;
    for (let i = 0; i < resolved.length - 1; i++) {
      const a = resolved[i];
      const b = resolved[i + 1];
      if (!overlaps(a.start, a.end, b.start, b.end)) continue;
      // Same DB → skip (user-intentional)
      if (a.dbSource && a.dbSource === b.dbSource) continue;

      foundOverlap = true;

      // Determine winner/loser by dbPriority
      const aPrio = a.dbSource ? rules.dbPriority.indexOf(a.dbSource) : -1;
      const bPrio = b.dbSource ? rules.dbPriority.indexOf(b.dbSource) : -1;
      // Lower index = higher priority. -1 means not in list → treat as highest (keep)
      const aWins = aPrio !== -1 && bPrio !== -1 ? aPrio <= bPrio : aPrio === -1;
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;

      // Determine action for loser
      const action = getConflictAction(loser, rules);

      const resolution: ConflictResolution = {
        entry: loser,
        action,
        conflictWith: winner,
        originalStart: loser.start,
        originalEnd: loser.end,
      };

      if (action === "delete") {
        const idx = resolved.indexOf(loser);
        resolved.splice(idx, 1);
      } else if (action === "shift") {
        const override = findOverride(loser, rules);
        const maxShift = override?.maxShiftMinutes ?? 120;
        const allowExceed = override?.allowExceedActiveHours ?? false;
        const winnerEnd = timeToMinutes(winner.end);
        const loserDuration = timeToMinutes(loser.end) - timeToMinutes(loser.start);
        const hardEnd = allowExceed ? 24 * 60 : timeToMinutes(activeHours.end);

        // Find first gap after winner ends where loser fits
        let placed = false;
        let candidate = winnerEnd;
        const maxCandidate = Math.max(timeToMinutes(loser.start), winnerEnd) + maxShift;

        while (candidate + loserDuration <= Math.min(hardEnd, maxCandidate + loserDuration)) {
          const candidateEnd = candidate + loserDuration;
          // Check no overlap with any existing slot
          const hasConflict = resolved.some(
            (s) => s !== loser && overlaps(minutesToTime(candidate), minutesToTime(candidateEnd), s.start, s.end),
          );
          if (!hasConflict) {
            loser.start = minutesToTime(candidate);
            loser.end = minutesToTime(candidateEnd);
            resolution.newStart = loser.start;
            resolution.newEnd = loser.end;
            placed = true;
            break;
          }
          candidate += 5; // try 5-minute increments
        }

        if (!placed) {
          // Cannot shift → fallback to delete
          resolution.action = "delete";
          resolution.warning = `シフト先が見つからず削除: ${loser.label}`;
          const idx = resolved.indexOf(loser);
          resolved.splice(idx, 1);
        }
      } else if (action === "shrink") {
        const override = findOverride(loser, rules);
        const minMins = override?.minMinutes ?? 15;
        const winnerStart = timeToMinutes(winner.start);
        const winnerEnd = timeToMinutes(winner.end);
        const loserStart = timeToMinutes(loser.start);
        const loserEnd = timeToMinutes(loser.end);

        // Trim the overlapping part
        let newStart = loserStart;
        let newEnd = loserEnd;
        if (loserStart < winnerStart) {
          newEnd = Math.min(newEnd, winnerStart);
        } else {
          newStart = Math.max(newStart, winnerEnd);
        }

        if (newEnd - newStart < minMins) {
          // Too short → delete
          resolution.action = "delete";
          resolution.warning = `縮小後${newEnd - newStart}分 < 最小${minMins}分のため削除`;
          const idx = resolved.indexOf(loser);
          resolved.splice(idx, 1);
        } else {
          loser.start = minutesToTime(newStart);
          loser.end = minutesToTime(newEnd);
          resolution.newStart = loser.start;
          resolution.newEnd = loser.end;
        }
      }
      // "keep" → both stay; if both are "keep", shift the lower-priority one
      else if (action === "keep") {
        const winnerEnd = timeToMinutes(winner.end);
        const loserDuration = timeToMinutes(loser.end) - timeToMinutes(loser.start);
        const hardEnd = 24 * 60; // keep entries are important: allow up to midnight
        const maxShift = 120;
        const maxCandidate = Math.max(timeToMinutes(loser.start), winnerEnd) + maxShift;

        let placed = false;
        let candidate = winnerEnd;
        while (candidate + loserDuration <= Math.min(hardEnd, maxCandidate + loserDuration)) {
          const candidateEnd = candidate + loserDuration;
          const hasConflict = resolved.some(
            (s) => s !== loser && overlaps(minutesToTime(candidate), minutesToTime(candidateEnd), s.start, s.end),
          );
          if (!hasConflict) {
            loser.start = minutesToTime(candidate);
            loser.end = minutesToTime(candidateEnd);
            resolution.action = "shift";
            resolution.newStart = loser.start;
            resolution.newEnd = loser.end;
            resolution.warning = "両方 keep のため低優先側をシフト";
            placed = true;
            break;
          }
          candidate += 5;
        }

        if (!placed) {
          // Cannot find gap → keep original position with warning
          resolution.warning = "シフト先が見つからず元の位置を維持: " + loser.label;
        }
      }

      resolutions.push(resolution);
      // Re-sort after modification
      resolved.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      break; // restart loop
    }

    if (!foundOverlap) break;
  }

  return { resolved, resolutions };
}

function getConflictAction(slot: TimeSlot, rules: ConflictRules): ConflictAction {
  // Check overrides first
  const override = findOverride(slot, rules);
  if (override) return override.action;
  // Fall back to DB default
  if (slot.dbSource && rules.defaults[slot.dbSource]) {
    return rules.defaults[slot.dbSource]!;
  }
  return "delete";
}

function findOverride(slot: TimeSlot, rules: ConflictRules): ConflictOverride | undefined {
  return rules.overrides.find((o) => {
    if (o.match.label && !slot.label.includes(o.match.label)) return false;
    if (o.match.dbSource && slot.dbSource !== o.match.dbSource) return false;
    return true;
  });
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
    const fromEnd = routine.preferred === "end";
    const earliestStartMin = routine.earliestStart
      ? timeToMinutes(routine.earliestStart)
      : 0;

    // Iterate segments: from end (reversed) or from start
    const segOrder = fromEnd ? [...segments].reverse() : segments;

    if (routine.splittable) {
      for (const seg of segOrder) {
        if (minutesLeft <= 0) break;
        // Apply earliestStart constraint: skip segments entirely before the threshold
        if (seg.end <= earliestStartMin) continue;
        // Clamp segment start to earliestStart
        const effectiveStart = Math.max(seg.start, earliestStartMin);
        const available = seg.end - effectiveStart;
        if (available < minBlock) continue;

        const allocate = Math.min(minutesLeft, available);
        if (allocate < minBlock) continue;

        if (fromEnd) {
          // Place at the tail of the segment
          result.push({
            start: minutesToTime(seg.end - allocate),
            end: minutesToTime(seg.end),
            label: routine.label,
            source: "routine",
          });
          seg.end -= allocate;
        } else {
          result.push({
            start: minutesToTime(effectiveStart),
            end: minutesToTime(effectiveStart + allocate),
            label: routine.label,
            source: "routine",
          });
          seg.start = effectiveStart + allocate;
        }
        minutesLeft -= allocate;
      }
    } else {
      // Need a single contiguous block
      for (const seg of segOrder) {
        // Apply earliestStart constraint
        if (seg.end <= earliestStartMin) continue;
        const effectiveStart = Math.max(seg.start, earliestStartMin);
        const available = seg.end - effectiveStart;
        if (available >= routine.minutes) {
          if (fromEnd) {
            result.push({
              start: minutesToTime(seg.end - routine.minutes),
              end: minutesToTime(seg.end),
              label: routine.label,
              source: "routine",
            });
            seg.end -= routine.minutes;
          } else {
            result.push({
              start: minutesToTime(effectiveStart),
              end: minutesToTime(effectiveStart + routine.minutes),
              label: routine.label,
              source: "routine",
            });
            seg.start = effectiveStart + routine.minutes;
          }
          minutesLeft = 0;
          break;
        }
      }
    }
  }

  return result;
}

// --- Markdown Output ---

function formatWeeklyStats(data: DailyPlanData): string {
  const lines: string[] = [];
  const ws = data.weeklyStats;
  if (!ws) return "週間データなし";

  lines.push(`## 週間バランス`);
  lines.push(`期間: ${ws.weekStart}（${getWeekday(ws.weekStart)}）〜 ${ws.weekEnd}（${getWeekday(ws.weekEnd)}）`);
  lines.push(`経過日数: ${ws.daysElapsed} / ${ws.daysTotal}`);
  lines.push("");
  lines.push("| ルーティン | 目標 | 実績 | 今日の配分 | 今週(分) | 今日(分) |");
  lines.push("|-----------|------|------|-----------|---------|---------|");

  for (const r of ws.adjustedRatios) {
    const target = `${Math.round(r.targetRatio * 100)}%`;
    const actual = ws.daysElapsed > 0 ? `${Math.round(r.actualRatio * 100)}%` : "-";
    const arrow = ws.daysElapsed > 0
      ? (r.adjustedRatio > r.targetRatio + 0.02 ? " ↑" : r.adjustedRatio < r.targetRatio - 0.02 ? " ↓" : "")
      : "";
    const adjusted = `${Math.round(r.adjustedRatio * 100)}%${arrow}`;
    lines.push(`| ${r.label} | ${target} | ${actual} | ${adjusted} | ${r.weekMinutes} | ${r.todayMinutes} |`);
  }

  lines.push("");
  return lines.join("\n");
}

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
      const actualInfo = slot.actualStart ? `（開始 ${slot.actualStart}）` : "";
      lines.push(
        `${slot.start}-${slot.end}  ${icon} ${slot.label}${actualInfo}${registered}`,
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

  // Conflict resolutions
  const cr = data.schedule.conflictResolutions;
  if (cr && cr.length > 0) {
    lines.push("");
    lines.push("### 競合解決");
    for (const r of cr) {
      const icon = r.action === "delete" ? "🗑️" : r.action === "shift" ? "➡️" : "✂️";
      if (r.action === "delete") {
        lines.push(`${icon} ${r.entry.label}（${r.originalStart}-${r.originalEnd}）→ 削除（${r.conflictWith.label} と重複）`);
      } else {
        lines.push(`${icon} ${r.entry.label}（${r.originalStart}-${r.originalEnd}）→ ${r.newStart}-${r.newEnd}（${r.conflictWith.label} と重複）`);
      }
      if (r.warning) lines.push(`  ⚠️ ${r.warning}`);
    }
  }

  // 週間バランス
  if (data.weeklyStats) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(formatWeeklyStats(data));
  }

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
      const actualInfo = s.actualStart ? `（開始 ${s.actualStart}）` : "";
      sections.push(`- ${s.start}-${s.end} 🔶 ${s.label}${actualInfo}`);
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

  // 週間バランスコンテキスト
  if (data.weeklyStats && data.weeklyStats.daysElapsed > 0) {
    const ws = data.weeklyStats;
    sections.push(`\n## 週間バランス（${ws.weekStart}〜、${ws.daysElapsed}/${ws.daysTotal}日経過）`);
    sections.push("今週の実績と調整方向:");
    for (const r of ws.adjustedRatios) {
      const dir = r.adjustedRatio > r.targetRatio + 0.02 ? "↑ 増やす" : r.adjustedRatio < r.targetRatio - 0.02 ? "↓ 減らす" : "→ 維持";
      sections.push(`- ${r.label}: 目標${Math.round(r.targetRatio * 100)}% → 実績${Math.round(r.actualRatio * 100)}% → 今日${Math.round(r.adjustedRatio * 100)}%（${dir}）`);
    }
    sections.push("\n上記の調整済み配分に基づいてルーティンを配置してください。遅れているルーティンを優先し、超過しているものは控えめにしてください。");
  }

  // 競合解決
  const cr = data.schedule.conflictResolutions;
  if (cr && cr.length > 0) {
    sections.push(`\n## 競合解決（自動処理済み）`);
    for (const r of cr) {
      if (r.action === "delete") {
        sections.push(`- 🗑️ ${r.entry.label}（${r.originalStart}-${r.originalEnd}）→ 削除（${r.conflictWith.label} と重複）`);
      } else {
        sections.push(`- ➡️ ${r.entry.label}（${r.originalStart}-${r.originalEnd}）→ ${r.newStart}-${r.newEnd}（${r.conflictWith.label} と重複）`);
      }
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
  const weekStats = flags.has("week-stats");

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
  const { confirmedTimeline: rawTimeline, allDay } = buildConfirmedSchedule(
    localEvents,
    todayTasks,
  );

  // Resolve conflicts between confirmed entries
  let confirmedTimeline = rawTimeline;
  let conflictResolutions: ConflictResolution[] = [];
  if (scheduleConfig.conflictRules) {
    const result = resolveTimelineConflicts(
      rawTimeline,
      scheduleConfig.conflictRules,
      scheduleConfig.activeHours,
    );
    confirmedTimeline = result.resolved;
    conflictResolutions = result.resolutions;
  }

  // Compute free slots
  const freeSlots = computeFreeSlots(
    confirmedTimeline,
    scheduleConfig.activeHours,
  );

  // Adjust routine pool: subtract already-confirmed minutes, skip non-splittable duplicates
  const confirmedMinutesByLabel = new Map<string, number>();
  for (const s of confirmedTimeline) {
    const key = s.label.toLowerCase();
    const mins = timeToMinutes(s.end) - timeToMinutes(s.start);
    confirmedMinutesByLabel.set(key, (confirmedMinutesByLabel.get(key) || 0) + mins);
  }

  // Resolve ratio-based routines with weekly adjustment
  const totalFreeMinutes = freeSlots.reduce((sum, s) => sum + s.minutes, 0);
  const fixedRoutines = scheduleConfig.routines.filter((r) => r.minutes > 0 && !r.ratio);
  const ratioRoutines = scheduleConfig.routines.filter((r) => r.ratio);
  const fixedTotal = fixedRoutines.reduce((sum, r) => sum + r.minutes, 0);
  const poolForRatio = Math.max(0, totalFreeMinutes - fixedTotal);

  // Weekly ratio tracking
  const weekStart = getWeekStartDate(targetDate);
  const weekEnd = getWeekEndDate(targetDate);
  const daysElapsed = daysBetween(weekStart, targetDate);
  const daysTotal = 7;

  const history = await fetchWeekRoutineHistory(weekStart, yesterdayDate, ratioRoutines);
  const adjustedRatios = computeAdjustedRatios(
    ratioRoutines,
    history,
    daysElapsed,
    daysTotal,
    poolForRatio,
  );

  const weeklyStatsData: WeeklyStats = {
    weekStart,
    weekEnd,
    daysElapsed,
    daysTotal,
    adjustedRatios,
  };

  // Build resolved routines using adjusted ratios
  const resolvedRoutines: RoutinePoolItem[] = [
    ...fixedRoutines,
    ...ratioRoutines.map((r) => {
      const adj = adjustedRatios.find((a) => a.label === r.label);
      return {
        ...r,
        minutes: adj ? adj.todayMinutes : Math.max(r.minBlock, Math.floor(poolForRatio * r.ratio!)),
      };
    }),
  ];

  const remainingRoutines: RoutinePoolItem[] = [];
  for (const r of resolvedRoutines) {
    const confirmed = confirmedMinutesByLabel.get(r.label.toLowerCase()) || 0;
    if (confirmed <= 0) {
      remainingRoutines.push(r);
    } else if (r.splittable) {
      // splittable: reduce remaining minutes
      const left = r.minutes - confirmed;
      if (left >= r.minBlock) {
        remainingRoutines.push({ ...r, minutes: left });
      }
    }
    // non-splittable + already confirmed → skip entirely
  }

  // Fill routines for non-AI path (and backward-compat timeline)
  const filledRoutines = fillRoutinesByPriority(
    freeSlots,
    remainingRoutines,
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
      conflictResolutions: conflictResolutions.length > 0 ? conflictResolutions : undefined,
    },
    weeklyStats: weeklyStatsData,
  };

  if (weekStats) {
    console.log(formatWeeklyStats(data));
    return;
  }

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
