#!/usr/bin/env bun
/**
 * Notion データベースセットアップ
 *
 * 使い方:
 *   bun run scripts/notion-setup.ts --type journal --parent <PAGE_ID>
 *   bun run scripts/notion-setup.ts --type articles --parent <PAGE_ID>
 *
 * 作成後、.env.local に DB ID を追加してください:
 *   NOTION_JOURNAL_DB=xxx
 *   NOTION_ARTICLES_DB=xxx
 */

import { getApiKey, notionFetch, parseArgs } from "./lib/notion";

const DB_SCHEMAS: Record<string, { title: string; properties: Record<string, unknown> }> = {
  journal: {
    title: "Journal",
    properties: {
      "Name": { title: {} },
      "Date": { date: {} },
      "Mood": {
        select: {
          options: [
            { name: "😊 良い", color: "green" },
            { name: "😐 普通", color: "yellow" },
            { name: "😞 イマイチ", color: "red" },
          ],
        },
      },
      "Body": { rich_text: {} },
    },
  },
  articles: {
    title: "Articles",
    properties: {
      "Name": { title: {} },
      "URL": { url: {} },
      "Source": {
        select: {
          options: [
            { name: "Hacker News", color: "orange" },
            { name: "Zenn", color: "blue" },
            { name: "note", color: "green" },
            { name: "Twitter", color: "default" },
            { name: "Other", color: "gray" },
          ],
        },
      },
      "Aspect": {
        multi_select: {
          options: [
            { name: "tsumugi", color: "purple" },
            { name: "diet", color: "green" },
            { name: "guitar", color: "orange" },
            { name: "investment", color: "blue" },
            { name: "study", color: "yellow" },
            { name: "reading", color: "pink" },
            { name: "fukuoka", color: "red" },
          ],
        },
      },
      "Summary": { rich_text: {} },
      "Status": {
        status: {
          options: [
            { name: "未読", color: "default" },
            { name: "読了", color: "green" },
            { name: "お気に入り", color: "yellow" },
          ],
          groups: [
            { name: "To-do", option_names: ["未読"] },
            { name: "Complete", option_names: ["読了", "お気に入り"] },
          ],
        },
      },
      "Date": { date: {} },
    },
  },
};

async function main() {
  const { opts } = parseArgs();
  const type = opts.type;
  const parentId = opts.parent;

  if (!type || !parentId || !DB_SCHEMAS[type]) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-setup.ts --type journal --parent <PAGE_ID>");
    console.error("  bun run scripts/notion-setup.ts --type articles --parent <PAGE_ID>");
    process.exit(1);
  }

  const schema = DB_SCHEMAS[type];
  const apiKey = getApiKey();

  console.log(`Creating ${schema.title} database...`);

  const data = await notionFetch(apiKey, "/databases", {
    parent: { type: "page_id", page_id: parentId },
    title: [{ type: "text", text: { content: schema.title } }],
    properties: schema.properties,
  });

  const dbId = data.id;
  const envKey = type === "journal" ? "NOTION_JOURNAL_DB" : "NOTION_ARTICLES_DB";

  console.log(`\n${schema.title} DB を作成しました!`);
  console.log(`  DB ID: ${dbId}`);
  console.log(`\n.env.local に以下を追加してください:`);
  console.log(`  ${envKey}=${dbId}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
