#!/usr/bin/env bun
/**
 * デイリープラン生成
 *
 * 使い方:
 *   bun run scripts/notion-daily-plan.ts              # 今日のプラン
 *   bun run scripts/notion-daily-plan.ts --date 2026-02-15  # 指定日
 *   bun run scripts/notion-daily-plan.ts --json        # JSON出力
 */

import { readFileSync } from "fs";
import { join } from "path";
import { getApiKey, getDbId, notionFetch, parseArgs, todayJST } from "./lib/notion";

const ROOT = join(import.meta.dir, "..");
const ROUTINE_PATH = join(ROOT, "aspects/planning/routine.md");

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

interface NotionTask {
  id: string;
  title: string;
  start: string;
  end: string | null;
  status: string;
  description: string;
  feedback: string;
}

interface JournalEntry {
  date: string;
  mood: string;
  body: string;
}

interface DailyPlanData {
  targetDate: string;
  targetWeekday: string;
  yesterdayDate: string;
  yesterdayWeekday: string;
  journal: JournalEntry | null;
  yesterdayTasks: NotionTask[];
  todayTasks: NotionTask[];
  routine: string;
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

async function fetchTasks(apiKey: string, dbId: string, date: string): Promise<NotionTask[]> {
  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: {
      and: [
        { property: "Due date", date: { on_or_after: date + "T00:00:00+09:00" } },
        { property: "Due date", date: { on_or_before: date + "T23:59:59+09:00" } },
      ],
    },
    sorts: [{ property: "Due date", direction: "ascending" }],
  });

  return data.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      title: richTextToString(props.Name?.title),
      start: props["Due date"]?.date?.start || "",
      end: props["Due date"]?.date?.end || null,
      status: props.Status?.status?.name || "",
      description: richTextToString(props.Description?.rich_text),
      feedback: richTextToString(props.Feedback?.rich_text),
    };
  });
}

function loadRoutine(): string {
  try {
    return readFileSync(ROUTINE_PATH, "utf-8");
  } catch {
    return "";
  }
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

  // 今日のスケジュール
  lines.push("## 今日のスケジュール");
  lines.push("");

  // 登録済みタスク
  lines.push("### 登録済みタスク");
  if (data.todayTasks.length > 0) {
    for (const t of data.todayTasks) {
      const time = t.start.includes("T")
        ? `${formatTime(t.start)}${t.end ? "-" + formatTime(t.end) : ""}`
        : "[終日]";
      lines.push(`  ${time}  ${t.title}`);
    }
  } else {
    lines.push("  登録済みタスクなし");
  }

  // ルーティン
  lines.push("");
  lines.push("### ルーティン（テンプレート）");
  lines.push("  午前（9:00-12:00）  tsumugi開発（集中タイム）");
  lines.push("  昼（12:00-14:00）    昼食 + ジム or 運動");
  lines.push("  午後（14:00-17:00）  tsumugi開発（続き）or 営業活動");
  lines.push("  夕方（17:00-18:00）  ギター練習（1時間）");
  lines.push("  夜（18:00-20:00）    study / 読書 / 投資リサーチ / 自由時間");
  lines.push("  就寝前              日記");

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
  const tasksDbId = getDbId("NOTION_TASKS_DB");
  const journalDbId = getDbId("NOTION_JOURNAL_DB");

  const yesterdayDate = getYesterday(targetDate);

  const [journal, yesterdayTasks, todayTasks] = await Promise.all([
    fetchJournal(apiKey, journalDbId, yesterdayDate),
    fetchTasks(apiKey, tasksDbId, yesterdayDate),
    fetchTasks(apiKey, tasksDbId, targetDate),
  ]);

  const routine = loadRoutine();

  const data: DailyPlanData = {
    targetDate,
    targetWeekday: getWeekday(targetDate),
    yesterdayDate,
    yesterdayWeekday: getWeekday(yesterdayDate),
    journal,
    yesterdayTasks,
    todayTasks,
    routine,
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
