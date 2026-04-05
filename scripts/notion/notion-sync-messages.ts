#!/usr/bin/env bun
/**
 * aspects/church/messages/*.md → Notion メッセージDB 同期
 *
 * 使い方:
 *   bun run scripts/notion/notion-sync-messages.ts              # 全ファイル同期
 *   bun run scripts/notion/notion-sync-messages.ts --dry-run    # プレビュー
 *   bun run scripts/notion/notion-sync-messages.ts --date 2026-04-03  # 特定日のみ
 */

import { readdirSync, readFileSync } from "fs";
import { join, basename } from "path";
import { getApiKey, getDbId, notionFetch, parseArgs, pickTaskIcon, pickCover } from "./lib/notion";

const ROOT = join(import.meta.dir, "../..");
const MESSAGES_DIR = join(ROOT, "aspects/church/messages");

// --- Types ---

interface ParsedMessage {
  date: string;       // "2026-04-03"
  title: string;      // 「十字架の元へ行こう」
  series: string;     // Good Friday 礼拝
  points: string;     // ポイントセクションの内容
  notes: string;      // メモセクションの内容
  raw: string;        // 元のMarkdown全文
}

interface NotionMessage {
  id: string;
  date: string | null;
  title: string;
}

// --- Parse message MD file ---

function parseMessageFile(content: string, filename: string): ParsedMessage {
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  const date = dateMatch ? dateMatch[1] : "";

  const titleMatch = content.match(/^\*\*タイトル:\*\*\s*(.+)$/m);
  const seriesMatch = content.match(/^\*\*シリーズ:\*\*\s*(.+)$/m);

  const title = titleMatch ? titleMatch[1].trim().replace(/^「|」$/g, "") : "";
  const series = seriesMatch ? seriesMatch[1].trim().replace(/^[""]|[""]$/g, "") : "";

  // Extract ポイント section
  const pointsMatch = content.match(/## ポイント\n([\s\S]*?)(?=\n---|\n## |$)/);
  const points = pointsMatch ? pointsMatch[1].trim() : "";

  // Extract メモ section
  const notesMatch = content.match(/## メモ\n([\s\S]*?)(?=\n---|\n## |$)/);
  const notes = notesMatch ? notesMatch[1].trim() : "";

  return { date, title, series, points, notes, raw: content };
}

// --- List existing Notion entries ---

async function listNotionMessages(apiKey: string, dbId: string): Promise<NotionMessage[]> {
  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    page_size: 100,
  });

  return data.results.map((page: any) => ({
    id: page.id,
    date: page.properties["日付"]?.date?.start ?? null,
    title: page.properties["タイトル"]?.title?.[0]?.plain_text ?? "",
  }));
}

// --- Create or update page ---

async function upsertMessage(
  apiKey: string,
  dbId: string,
  msg: ParsedMessage,
  existingId: string | null,
  dryRun: boolean
): Promise<void> {
  const action = existingId ? "更新" : "作成";
  console.log(`  ${action}: ${msg.date} 「${msg.title}」`);
  if (dryRun) return;

  const properties: Record<string, any> = {
    "タイトル": {
      title: [{ type: "text", text: { content: msg.title } }],
    },
    "日付": {
      date: msg.date ? { start: msg.date } : null,
    },
    "シリーズ": {
      rich_text: [{ type: "text", text: { content: msg.series } }],
    },
    "テーマ": {
      rich_text: [{ type: "text", text: { content: msg.points.slice(0, 2000) } }],
    },
  };

  let pageId: string;

  if (existingId) {
    await notionFetch(apiKey, `/pages/${existingId}`, { properties }, "PATCH");
    pageId = existingId;
  } else {
    const page = await notionFetch(apiKey, "/pages", {
      parent: { database_id: dbId },
      icon: pickTaskIcon("church"),
      cover: pickCover(),
      properties,
    });
    pageId = page.id;
  }

  // Write full content to page body (clear existing blocks first on update)
  const bodyBlocks = buildBlocks(msg.raw);
  if (bodyBlocks.length > 0) {
    if (existingId) {
      const existing = await notionFetch(apiKey, `/blocks/${pageId}/children`);
      for (const block of existing.results ?? []) {
        await notionFetch(apiKey, `/blocks/${block.id}`, undefined, "DELETE");
      }
    }
    await notionFetch(apiKey, `/blocks/${pageId}/children`, {
      children: bodyBlocks,
    });
  }
}

// --- Build Notion blocks from Markdown ---

/** Remove lone surrogates and truncate to Notion's 2000-char rich_text limit */
function rt(str: string, max = 2000): string {
  // Strip lone surrogates (would produce invalid JSON in some runtimes)
  let s = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) { s += str[i] + str[i + 1]; i++; }
      // else lone high surrogate — skip
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // lone low surrogate — skip
    } else {
      s += str[i];
    }
  }
  return s.slice(0, max);
}

function buildBlocks(content: string): any[] {
  const blocks: any[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      // Skip H1 (already the page title area)
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: rt(line.slice(3).trim()) } }] },
      });
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: rt(line.slice(4).trim()) } }] },
      });
      i++;
      continue;
    }

    if (line.startsWith("---")) {
      blocks.push({ type: "divider", divider: {} });
      i++;
      continue;
    }

    // Block quote (possibly multi-line)
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: rt(quoteLines.join("\n")) } }],
        },
      });
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push({
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: rt(line.slice(2).trim()) } }],
        },
      });
      i++;
      continue;
    }

    if (line.match(/^\d+\. /)) {
      blocks.push({
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: rt(line.replace(/^\d+\. /, "").trim()) } }],
        },
      });
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    blocks.push({
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: rt(line.trim()) } }],
      },
    });
    i++;
  }

  // Notion API: max 100 blocks per request
  return blocks.slice(0, 100);
}

// --- Main ---

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const targetDate = opts["date"] as string | undefined;

  const apiKey = getApiKey();
  const dbId = getDbId("NOTION_CHURCH_MESSAGES_DB");

  // Read message files
  const files = readdirSync(MESSAGES_DIR)
    .filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .sort();

  const messages: ParsedMessage[] = files
    .filter((f) => !targetDate || f.startsWith(targetDate))
    .map((f) => parseMessageFile(readFileSync(join(MESSAGES_DIR, f), "utf-8"), f));

  if (messages.length === 0) {
    console.log("対象ファイルなし");
    return;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}${messages.length} 件のメッセージを同期します...`);

  // Fetch existing Notion entries
  const existing = await listNotionMessages(apiKey, dbId);

  for (const msg of messages) {
    const found = existing.find((e) => e.date === msg.date);
    await upsertMessage(apiKey, dbId, msg, found?.id ?? null, dryRun);
  }

  console.log(`\n完了${dryRun ? "（dry-run）" : ""}。`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
