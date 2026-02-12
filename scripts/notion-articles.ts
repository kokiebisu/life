#!/usr/bin/env bun
/**
 * Notion 記事キュレーション
 *
 * 使い方:
 *   bun run scripts/notion-articles.ts add --url https://example.com/article
 *   bun run scripts/notion-articles.ts add --url https://example.com --title "記事名" --source "Zenn" --aspect tsumugi,study
 *   bun run scripts/notion-articles.ts list
 *   bun run scripts/notion-articles.ts list --aspect tsumugi
 *   bun run scripts/notion-articles.ts list --all
 *   bun run scripts/notion-articles.ts read --title "記事名"
 */

import { getApiKey, getDbId, notionFetch, parseArgs, todayJST, pickArticleIcon, pickCover } from "./lib/notion";

const KNOWN_SOURCES: Record<string, string> = {
  "news.ycombinator.com": "Hacker News",
  "zenn.dev": "Zenn",
  "note.com": "note",
  "twitter.com": "Twitter",
  "x.com": "Twitter",
};

function getArticlesConfig() {
  return { apiKey: getApiKey(), dbId: getDbId("NOTION_ARTICLES_DB") };
}

function detectSource(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return KNOWN_SOURCES[hostname] || "Other";
  } catch {
    return "Other";
  }
}

async function fetchPageMeta(url: string): Promise<{ title: string; description: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; life-bot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return { title: "", description: "" };
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    return { title, description };
  } catch {
    return { title: "", description: "" };
  }
}

async function addArticle(opts: Record<string, string>) {
  const url = opts.url;
  if (!url) {
    console.error("Error: --url is required");
    process.exit(1);
  }

  console.log(`Fetching: ${url}`);
  const meta = await fetchPageMeta(url);

  const title = opts.title || meta.title || url;
  const source = opts.source || detectSource(url);
  const summary = opts.summary || meta.description || "";
  const aspects = opts.aspect ? opts.aspect.split(",").map(a => ({ name: a.trim() })) : [];

  const { apiKey, dbId } = getArticlesConfig();

  const properties: Record<string, unknown> = {
    "Name": { title: [{ text: { content: title } }] },
    "URL": { url },
    "Source": { select: { name: source } },
    "Date": { date: { start: todayJST() } },
  };
  if (aspects.length > 0) {
    properties["Aspect"] = { multi_select: aspects };
  }
  if (summary) {
    properties["Summary"] = { rich_text: [{ text: { content: summary.slice(0, 2000) } }] };
  }

  const icon = pickArticleIcon(source);
  const aspectHint = opts.aspect || "";
  const cover = pickCover(aspectHint);

  await notionFetch(apiKey, "/pages", {
    parent: { database_id: dbId },
    properties,
    icon,
    cover,
  });

  console.log(`記事を追加しました: ${title}`);
  console.log(`  Source: ${source}`);
  if (aspects.length > 0) console.log(`  Aspect: ${aspects.map(a => a.name).join(", ")}`);
  if (summary) console.log(`  Summary: ${summary.slice(0, 100)}...`);
}

async function listArticles(opts: Record<string, string>, flags: Set<string>) {
  const { apiKey, dbId } = getArticlesConfig();
  const showAll = flags.has("all");

  const filters: unknown[] = [];
  if (!showAll) {
    filters.push({ property: "Status", status: { equals: "未読" } });
  }
  if (opts.aspect) {
    filters.push({ property: "Aspect", multi_select: { contains: opts.aspect } });
  }

  const query: Record<string, unknown> = {
    sorts: [{ property: "Date", direction: "descending" }],
  };
  if (filters.length === 1) query.filter = filters[0];
  else if (filters.length > 1) query.filter = { and: filters };

  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, query);

  if (data.results.length === 0) {
    console.log(showAll ? "記事なし" : "未読記事なし");
    return;
  }

  const label = showAll ? "全記事" : "未読記事";
  console.log(`${label}: ${data.results.length}件\n`);
  for (const page of data.results) {
    const props = page.properties;
    const title = props.Name?.title?.[0]?.plain_text || "";
    const url = props.URL?.url || "";
    const source = props.Source?.select?.name || "";
    const status = props.Status?.status?.name || "";
    const aspects = (props.Aspect?.multi_select || []).map((s: any) => s.name).join(", ");
    const date = props.Date?.date?.start || "";

    const statusTag = showAll ? ` [${status}]` : "";
    console.log(`  ${title}${statusTag}`);
    console.log(`    ${url}`);
    const meta = [source, aspects, date].filter(Boolean).join(" | ");
    if (meta) console.log(`    ${meta}`);
    console.log("");
  }
}

async function readArticle(opts: Record<string, string>) {
  const title = opts.title;
  if (!title) {
    console.error("Error: --title is required");
    process.exit(1);
  }

  const { apiKey, dbId } = getArticlesConfig();

  const data = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: {
      and: [
        { property: "Name", title: { contains: title } },
        { property: "Status", status: { equals: "未読" } },
      ],
    },
  });

  if (data.results.length === 0) {
    console.log(`「${title}」に一致する未読記事が見つかりません`);
    return;
  }

  for (const page of data.results) {
    const name = page.properties.Name?.title?.[0]?.plain_text || "";
    await notionFetch(apiKey, `/pages/${page.id}`, {
      properties: {
        "Status": { status: { name: "読了" } },
      },
    }, "PATCH");
    console.log(`読了にしました: ${name}`);
  }
}

async function main() {
  const { flags, opts, positional } = parseArgs();
  const command = positional[0];

  if (!command) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-articles.ts add --url <URL> [--title <title>] [--source <source>] [--aspect <a,b>]");
    console.error("  bun run scripts/notion-articles.ts list [--aspect <aspect>] [--all]");
    console.error("  bun run scripts/notion-articles.ts read --title <title>");
    process.exit(1);
  }

  switch (command) {
    case "add":
      await addArticle(opts);
      break;
    case "list":
      await listArticles(opts, flags);
      break;
    case "read":
      await readArticle(opts);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
