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

import { getTasksConfig, notionFetch, parseArgs, todayJST } from "./lib/notion";

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
  const { flags, opts } = parseArgs();
  const days = opts.days ? parseInt(opts.days, 10) : 1;
  const date = opts.date || null;
  const json = flags.has("json");

  const { apiKey, dbId } = getTasksConfig();

  let startDate: string, endDate: string;
  if (date) {
    startDate = date;
    endDate = date;
  } else {
    const now = new Date();
    startDate = todayJST();
    const end = new Date(now.getTime() + (days - 1) * 86400000);
    endDate = end.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  }

  const filter = {
    and: [
      { property: "Due date", date: { on_or_after: startDate + "T00:00:00+09:00" } },
      { property: "Due date", date: { on_or_before: endDate + "T23:59:59+09:00" } },
    ],
  };

  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter,
    sorts: [{ property: "Due date", direction: "ascending" }],
  });

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
