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
 *   bun run scripts/notion-articles.ts replenish [--dry-run]
 */

import { getApiKey, getDbId, notionFetch, parseArgs, todayJST, pickArticleIcon, pickCover } from "./lib/notion";

const KNOWN_SOURCES: Record<string, string> = {
  "news.ycombinator.com": "Hacker News",
  "zenn.dev": "Zenn",
  "note.com": "note",
  "twitter.com": "Twitter",
  "x.com": "Twitter",
};

const ASPECT_KEYWORDS: Record<string, RegExp> = {
  tsumugi: /saas|startup|indie|solo.?dev|ship|mvp|bootstrap|claude|ai.?agent|llm|gpt|anthropic/i,
  study: /typescript|react|next\.?js|bun|hono|architecture|design.?pattern|system.?design/i,
  investment: /invest|stock|crypto|fintech|market|portfolio|vc|funding|ipo/i,
  diet: /health|nutrition|diet|fitness|workout|exercise|wellness/i,
  guitar: /guitar|music|musician|chord|scale/i,
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

function classifyAspects(title: string): string[] {
  const matched: string[] = [];
  for (const [aspect, pattern] of Object.entries(ASPECT_KEYWORDS)) {
    if (pattern.test(title)) matched.push(aspect);
  }
  return matched;
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
    "タイトル": { title: [{ text: { content: title } }] },
    "URL": { url },
    "ソース": { select: { name: source } },
    "公開日": { date: { start: todayJST() } },
  };
  if (aspects.length > 0) {
    properties["Aspect"] = { multi_select: aspects };
  }
  if (summary) {
    properties["要約"] = { rich_text: [{ text: { content: summary.slice(0, 2000) } }] };
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
    filters.push({ property: "既読", checkbox: { equals: false } });
  }
  if (opts.aspect) {
    filters.push({ property: "Aspect", multi_select: { contains: opts.aspect } });
  }

  const query: Record<string, unknown> = {
    sorts: [{ property: "公開日", direction: "descending" }],
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
    const title = props["タイトル"]?.title?.[0]?.plain_text || "";
    const url = props.URL?.url || "";
    const source = props["ソース"]?.select?.name || "";
    const read = props["既読"]?.checkbox ?? false;
    const aspects = (props.Aspect?.multi_select || []).map((s: any) => s.name).join(", ");
    const date = props["公開日"]?.date?.start || "";

    const statusTag = showAll ? ` [${read ? "既読" : "未読"}]` : "";
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
        { property: "タイトル", title: { contains: title } },
        { property: "既読", checkbox: { equals: false } },
      ],
    },
  });

  if (data.results.length === 0) {
    console.log(`「${title}」に一致する未読記事が見つかりません`);
    return;
  }

  for (const page of data.results) {
    const name = page.properties["タイトル"]?.title?.[0]?.plain_text || "";
    await notionFetch(apiKey, `/pages/${page.id}`, {
      properties: {
        "既読": { checkbox: true },
      },
    }, "PATCH");
    console.log(`既読にしました: ${name}`);
  }
}

// --- replenish command ---

interface ArticleCandidate {
  title: string;
  url: string;
  source: string;
  aspects: string[];
  summary: string;
}

async function fetchHNArticles(limit: number): Promise<ArticleCandidate[]> {
  const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);
  const ids: number[] = await res.json();

  const candidates: ArticleCandidate[] = [];
  // Fetch top 30 to get enough after filtering
  const batch = ids.slice(0, 30);
  const items = await Promise.all(
    batch.map(async (id) => {
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return r.ok ? r.json() : null;
    })
  );

  for (const item of items) {
    if (!item || !item.url || (item.score ?? 0) < 50) continue;
    candidates.push({
      title: item.title || "",
      url: item.url,
      source: "Hacker News",
      aspects: classifyAspects(item.title || ""),
      summary: "",
    });
    if (candidates.length >= limit) break;
  }

  return candidates;
}

async function fetchZennArticles(limit: number): Promise<ArticleCandidate[]> {
  const res = await fetch("https://zenn.dev/api/articles?order=daily");
  if (!res.ok) throw new Error(`Zenn API error: ${res.status}`);
  const data: any = await res.json();

  const candidates: ArticleCandidate[] = [];
  for (const article of data.articles || []) {
    const url = `https://zenn.dev${article.path}`;
    candidates.push({
      title: article.title || "",
      url,
      source: "Zenn",
      aspects: classifyAspects(article.title || ""),
      summary: "",
    });
    if (candidates.length >= limit) break;
  }

  return candidates;
}

async function getExistingUrls(apiKey: string, dbId: string): Promise<Set<string>> {
  const urls = new Set<string>();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter_properties: ["URL"],
    };
    if (cursor) body.start_cursor = cursor;

    // Use the property ID approach - query all pages, extract URLs
    const data = await notionFetch(apiKey, `/databases/${dbId}/query`, body);
    for (const page of data.results) {
      const url = page.properties?.URL?.url;
      if (url) urls.add(url);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return urls;
}

async function replenish(flags: Set<string>) {
  const dryRun = flags.has("dry-run");
  const { apiKey, dbId } = getArticlesConfig();

  // 1. Count unread articles
  const unreadQuery = await notionFetch(apiKey, `/databases/${dbId}/query`, {
    filter: { property: "既読", checkbox: { equals: false } },
    page_size: 100,
  });
  const unreadCount = unreadQuery.results.length;
  console.log(`未読記事: ${unreadCount}件`);

  if (unreadCount >= 10) {
    console.log("未読が10件以上あるため補充不要です");
    return;
  }

  const needed = 10 - unreadCount;
  console.log(`${needed}件の記事を補充します${dryRun ? " (dry-run)" : ""}\n`);

  // 2. Get existing URLs to avoid duplicates
  const existingUrls = await getExistingUrls(apiKey, dbId);
  console.log(`既存記事: ${existingUrls.size}件\n`);

  // 3. Fetch candidates from both sources
  const [hnCandidates, zennCandidates] = await Promise.all([
    fetchHNArticles(needed).catch((e) => { console.error(`HN fetch error: ${e.message}`); return [] as ArticleCandidate[]; }),
    fetchZennArticles(needed).catch((e) => { console.error(`Zenn fetch error: ${e.message}`); return [] as ArticleCandidate[]; }),
  ]);

  // 4. Interleave sources and filter duplicates
  const allCandidates: ArticleCandidate[] = [];
  const maxLen = Math.max(hnCandidates.length, zennCandidates.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < hnCandidates.length) allCandidates.push(hnCandidates[i]);
    if (i < zennCandidates.length) allCandidates.push(zennCandidates[i]);
  }

  const toAdd: ArticleCandidate[] = [];
  for (const c of allCandidates) {
    if (existingUrls.has(c.url)) continue;
    toAdd.push(c);
    if (toAdd.length >= needed) break;
  }

  if (toAdd.length === 0) {
    console.log("追加できる新しい記事がありません");
    return;
  }

  // 5. Add to Notion
  const today = todayJST();
  for (const article of toAdd) {
    const icon = pickArticleIcon(article.source);
    const cover = pickCover(article.aspects.join(","));
    const aspects = article.aspects.map(a => ({ name: a }));

    if (dryRun) {
      const aspectStr = article.aspects.length > 0 ? ` [${article.aspects.join(", ")}]` : "";
      console.log(`  ${icon.emoji} ${article.title.slice(0, 60)}${aspectStr}`);
      console.log(`    ${article.url}`);
      continue;
    }

    const properties: Record<string, unknown> = {
      "タイトル": { title: [{ text: { content: article.title } }] },
      "URL": { url: article.url },
      "ソース": { select: { name: article.source } },
      "公開日": { date: { start: today } },
    };
    if (aspects.length > 0) {
      properties["Aspect"] = { multi_select: aspects };
    }

    await notionFetch(apiKey, "/pages", {
      parent: { database_id: dbId },
      properties,
      icon,
      cover,
    });

    console.log(`  ${icon.emoji} ${article.title.slice(0, 60)}`);
  }

  console.log(`\n${dryRun ? "追加予定" : "追加完了"}: ${toAdd.length}件`);
}

async function main() {
  const { flags, opts, positional } = parseArgs();
  const command = positional[0];

  if (!command) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-articles.ts add --url <URL> [--title <title>] [--source <source>] [--aspect <a,b>]");
    console.error("  bun run scripts/notion-articles.ts list [--aspect <aspect>] [--all]");
    console.error("  bun run scripts/notion-articles.ts read --title <title>");
    console.error("  bun run scripts/notion-articles.ts replenish [--dry-run]");
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
    case "replenish":
      await replenish(flags);
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
