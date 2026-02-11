#!/usr/bin/env bun
/**
 * Notion タスク・イベント一覧取得
 *
 * 使い方:
 *   bun run scripts/notion-list.ts                    # 今日のタスク
 *   bun run scripts/notion-list.ts --date 2026-02-14  # 指定日のタスク
 *   bun run scripts/notion-list.ts --days 7           # 今後7日間
 *   bun run scripts/notion-list.ts --json             # JSON出力
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const ENV_FILE = join(ROOT, ".env.local");

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return env;
  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[trimmed.slice(0, eqIdx).trim()] = val;
  }
  return env;
}

function getConfig() {
  const env = loadEnv();
  const apiKey = env["NOTION_API_KEY"] || process.env.NOTION_API_KEY;
  const dbId = env["NOTION_TASKS_DB"] || process.env.NOTION_TASKS_DB;
  if (!apiKey || !dbId) {
    console.error("Error: NOTION_API_KEY and NOTION_TASKS_DB must be set in .env.local");
    process.exit(1);
  }
  return { apiKey, dbId };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let days = 1;
  let date: string | null = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) { days = parseInt(args[i + 1], 10); i++; }
    else if (args[i] === "--date" && args[i + 1]) { date = args[i + 1]; i++; }
    else if (args[i] === "--json") { json = true; }
  }
  return { days, date, json };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface NotionTask {
  id: string;
  title: string;
  start: string;
  end: string | null;
  status: string;
  description: string;
  feedback: string;
}

async function main() {
  const { days, date, json } = parseArgs();
  const { apiKey, dbId } = getConfig();

  let startDate: string, endDate: string;
  if (date) {
    startDate = date;
    endDate = date;
  } else {
    const now = new Date();
    const jstDate = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    startDate = jstDate;
    const end = new Date(now.getTime() + (days - 1) * 86400000);
    endDate = end.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  }

  const filter = {
    and: [
      { property: "Due date", date: { on_or_after: startDate + "T00:00:00+09:00" } },
      { property: "Due date", date: { on_or_before: endDate + "T23:59:59+09:00" } },
    ],
  };

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter,
      sorts: [{ property: "Due date", direction: "ascending" }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error(`Error: ${res.status} ${(err as any).message}`);
    process.exit(1);
  }

  const data = await res.json() as any;
  const tasks: NotionTask[] = data.results.map((page: any) => {
    const props = page.properties;
    return {
      id: page.id,
      title: props.Name?.title?.[0]?.plain_text || "",
      start: props["Due date"]?.date?.start || "",
      end: props["Due date"]?.date?.end || null,
      status: props.Status?.status?.name || "",
      description: props.Description?.rich_text?.[0]?.plain_text || "",
      feedback: props.Feedback?.rich_text?.[0]?.plain_text || "",
    };
  });

  if (json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  if (tasks.length === 0) {
    console.log("タスクなし");
    return;
  }

  // Group by date
  const byDate = new Map<string, NotionTask[]>();
  for (const task of tasks) {
    const dateKey = task.start.includes("T")
      ? new Date(task.start).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
      : task.start;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(task);
  }

  for (const [dateKey, dayTasks] of byDate) {
    const dateObj = new Date(dateKey + "T12:00:00+09:00");
    const label = dateObj.toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    console.log(`\n${label}`);
    for (const task of dayTasks) {
      const check = task.status === "Done" ? "✅" : "⬜";
      const time = task.start.includes("T")
        ? `${formatTime(task.start)}${task.end ? "-" + formatTime(task.end) : ""}`
        : "[終日]";
      const fb = task.feedback ? ` 💬 ${task.feedback}` : "";
      console.log(`  ${check} ${time}  ${task.title}${fb}`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
