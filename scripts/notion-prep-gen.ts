#!/usr/bin/env bun
/**
 * 食材整理・下準備チェックリスト自動生成
 *
 * 買い出しページ + daily 献立 + fridge.md → Claude API → Notion 下準備ページ本文
 *
 * 使い方:
 *   bun run scripts/notion-prep-gen.ts --date 2026-02-21
 *   bun run scripts/notion-prep-gen.ts --date 2026-02-21 --dry-run
 *   bun run scripts/notion-prep-gen.ts --page-id <grocery-page-id>
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  getScheduleDbConfig,
  queryDbByDateCached,
  notionFetch,
  getApiKey,
  parseArgs,
  pickCover,
} from "./lib/notion";
import { callClaude } from "./lib/claude";

const ROOT = join(import.meta.dir, "..");
const DIET_DIR = join(ROOT, "aspects/diet");

const WEEKDAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

// --- Types ---

interface MealEntry {
  date: string;
  weekday: string;
  meal: string;
  menu: string;
  isEatingOut: boolean;
}

interface PrepSection {
  heading: string;
  items: string[];
}

interface PrepData {
  sections: PrepSection[];
  fridgeAdditions: string[];
  estimatedMinutes: number;
}

// --- Helpers ---

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  return WEEKDAY_NAMES[d.getDay()];
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = new Date(start + "T12:00:00+09:00");
  const endDate = new Date(end + "T12:00:00+09:00");
  while (current <= endDate) {
    dates.push(current.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parseDailyMeals(date: string, content: string): MealEntry[] {
  const weekday = getWeekday(date);
  const meals: MealEntry[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^\|\s*(朝|昼|間食|夜)\s*\|\s*(.+?)\s*\|/);
    if (match) {
      const meal = match[1];
      const menu = match[2].trim();
      const isEatingOut = /外食/.test(menu) || /自炊なし/.test(menu);
      meals.push({ date, weekday, meal, menu, isEatingOut });
    }
  }
  return meals;
}

function loadFridge(): string {
  const path = join(DIET_DIR, "fridge.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

// --- Page finding ---

async function findGroceriesPage(
  apiKey: string,
  date: string,
): Promise<{ id: string; title: string; dateStart: string; dateEnd: string }> {
  const { dbId, config } = getScheduleDbConfig("groceries");
  const data = await queryDbByDateCached(apiKey, dbId, config, date, date);
  const pages = data.results;

  if (pages.length === 0) {
    throw new Error(`No groceries page found for date ${date}`);
  }

  // Filter out 食材整理 pages — we want the actual grocery list
  const groceryPages = pages.filter((p: any) => {
    const title =
      p.properties[config.titleProp]?.title
        ?.map((t: any) => t.plain_text)
        .join("") || "";
    return !title.includes("食材整理");
  });

  const page = groceryPages.length > 0 ? groceryPages[0] : pages[0];
  const props = page.properties;
  const titleArr = props[config.titleProp]?.title || [];
  const title = titleArr.map((t: any) => t.plain_text || "").join("");
  const dateObj = props[config.dateProp]?.date;

  if (!dateObj?.start) {
    throw new Error(`Groceries page "${title}" has no date set`);
  }

  const dateStart = dateObj.start.split("T")[0];
  const dateEnd = dateObj.end ? dateObj.end.split("T")[0] : dateStart;

  return { id: page.id, title, dateStart, dateEnd };
}

async function getPageDateRange(
  apiKey: string,
  pageId: string,
): Promise<{ id: string; title: string; dateStart: string; dateEnd: string }> {
  const page = await notionFetch(apiKey, `/pages/${pageId}`);
  const props = page.properties;
  const titleArr = props["件名"]?.title || [];
  const title = titleArr.map((t: any) => t.plain_text || "").join("");
  const dateObj = props["日付"]?.date;

  if (!dateObj?.start) {
    throw new Error(`Page "${title}" has no date set`);
  }

  const dateStart = dateObj.start.split("T")[0];
  const dateEnd = dateObj.end ? dateObj.end.split("T")[0] : dateStart;

  return { id: pageId, title, dateStart, dateEnd };
}

// --- Read grocery page content (to_do blocks) ---

async function fetchGroceryItems(apiKey: string, pageId: string): Promise<string[]> {
  const response = await notionFetch(apiKey, `/blocks/${pageId}/children`);
  const blocks = response.results || [];
  const items: string[] = [];

  function extractText(block: any): string {
    const type = block.type;
    const richText = block[type]?.rich_text || [];
    return richText.map((t: any) => t.plain_text || "").join("");
  }

  for (const block of blocks) {
    if (block.type === "to_do") {
      const text = extractText(block);
      if (text) items.push(text);
    }
    // Also check children in toggle headings
    if (block.has_children) {
      const children = await notionFetch(apiKey, `/blocks/${block.id}/children`);
      for (const child of children.results || []) {
        if (child.type === "to_do") {
          const text = extractText(child);
          if (text) items.push(text);
        }
      }
    }
  }

  return items;
}

// --- Find or create prep page ---

async function findPrepPage(
  apiKey: string,
  date: string,
): Promise<string | null> {
  const { dbId, config } = getScheduleDbConfig("groceries");
  const data = await queryDbByDateCached(apiKey, dbId, config, date, date);
  const pages = data.results || [];

  for (const page of pages) {
    const titleArr = page.properties[config.titleProp]?.title || [];
    const title = titleArr.map((t: any) => t.plain_text || "").join("");
    if (title.includes("食材整理")) {
      return page.id;
    }
  }

  return null;
}

async function createPrepPage(
  apiKey: string,
  date: string,
  groceryTitle: string,
): Promise<string> {
  const { dbId, config } = getScheduleDbConfig("groceries");
  const m = date.match(/\d{4}-(\d{2})-(\d{2})/);
  const shortDate = m ? `${parseInt(m[1])}/${parseInt(m[2])}` : date;

  // Extract the grocery number (① ② etc) from the title
  const numMatch = groceryTitle.match(/[①②③④⑤]/);
  const num = numMatch ? numMatch[0] : "";
  const title = `食材整理・下準備 ${num}${shortDate}`.trim();

  const page = await notionFetch(apiKey, "/pages", {
    parent: { database_id: dbId },
    icon: { type: "emoji", emoji: "🧹" },
    cover: pickCover(),
    properties: {
      [config.titleProp]: {
        title: [{ type: "text", text: { content: title } }],
      },
      [config.dateProp]: {
        date: {
          start: `${date}T12:00:00+09:00`,
          end: `${date}T12:30:00+09:00`,
        },
      },
    },
  });

  return page.id;
}

// --- Claude API ---

const SYSTEM_PROMPT = `あなたは食材整理・下準備のチェックリスト生成アシスタントです。
買い出しリスト・献立・冷蔵庫の在庫から、買い出し後にやるチェックリストをセクション別JSONで出力します。

## セクション構成（この順番で出力）

1. **🧊 冷凍する食材** — 買い出し日から2日以上先に使う肉・魚。小分けラップして冷凍。何曜日の何に使うか注記
2. **🥬 冷蔵庫に仕分け** — 野菜は野菜室、卵・乳製品はチルド室、その他は冷蔵
3. **📦 常温保存** — 玄米パック、乾物、パン、ナッツなど
4. **🍳 当日の食材取り出し** — 買い出し当日の昼・夜で使う食材（外食ならスキップ）
5. **🔪 下ごしらえ** — 野菜カット、豆腐の水切り、炊飯セットなど

## ルール

- 該当アイテムがないセクションは省略してよい
- 各アイテムは具体的に書く（食材名 + 量 + 保存先 + 用途）
- fridgeAdditions: 買い出しで追加する食材の一覧（fridge.md 更新用）
- estimatedMinutes: 全体の所要時間（通常15〜30分）

## 出力フォーマット（JSONのみ、他のテキスト不要）

{
  "sections": [
    {
      "heading": "🧊 冷凍する食材",
      "items": [
        "豚バラ 150g → 小分けラップして冷凍（火夜 重ね蒸し用）",
        "鶏むね肉 150g → ラップして冷凍（水昼 蒸し鶏用）"
      ]
    },
    {
      "heading": "🥬 冷蔵庫に仕分け",
      "items": [
        "キャベツ 1/4玉 → 野菜室（木昼 回鍋肉 / 土朝 千切り用）",
        "卵 1パック → チルド室（木朝 目玉焼き / 金朝 卵かけご飯）",
        "ヨーグルト → 冷蔵（金 間食用）"
      ]
    },
    {
      "heading": "📦 常温保存",
      "items": [
        "玄米パック → 棚",
        "食パン 1斤 → 常温（土朝 トースト用）"
      ]
    },
    {
      "heading": "🍳 当日の食材取り出し",
      "items": [
        "昼: 鶏むね肉・ブロッコリー（蒸し鶏サラダ）",
        "夜: 豚バラ・ニラ・卵（ニラ玉炒め）"
      ]
    },
    {
      "heading": "🔪 下ごしらえ",
      "items": [
        "ブロッコリーを小房に分けて洗う",
        "キャベツ千切り（朝食2日分まとめて）",
        "玄米を炊飯器にセット"
      ]
    }
  ],
  "fridgeAdditions": [
    "豚バラ 300g",
    "キャベツ 1/4玉",
    "卵 10個"
  ],
  "estimatedMinutes": 20
}`;

function buildUserPrompt(
  groceryItems: string[],
  meals: MealEntry[],
  fridge: string,
  startDate: string,
  endDate: string,
): string {
  const sections: string[] = [];

  sections.push(`## 買い出し日: ${startDate}（${getWeekday(startDate)}）`);
  sections.push(`## 期間: ${startDate} 〜 ${endDate}`);

  // Grocery items
  sections.push("\n## 買い出しリスト（食材）");
  if (groceryItems.length > 0) {
    for (const item of groceryItems) {
      sections.push(`- ${item}`);
    }
  } else {
    sections.push("（買い出しリスト未取得）");
  }

  // Meals by day
  sections.push("\n## 献立");
  const byDate = new Map<string, MealEntry[]>();
  for (const m of meals) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date)!.push(m);
  }

  for (const [date, dayMeals] of byDate) {
    const wd = getWeekday(date);
    sections.push(`\n### ${date}（${wd}）`);
    for (const m of dayMeals) {
      const marker = m.isEatingOut ? " 【外食】" : "";
      sections.push(`- ${m.meal}: ${m.menu}${marker}`);
    }
  }

  // Fridge
  sections.push("\n## 現在の冷蔵庫在庫（fridge.md）");
  sections.push(fridge);

  return sections.join("\n");
}

async function generatePrepList(
  groceryItems: string[],
  meals: MealEntry[],
  fridge: string,
  startDate: string,
  endDate: string,
): Promise<PrepData> {
  const userPrompt = buildUserPrompt(groceryItems, meals, fridge, startDate, endDate);

  const result = await callClaude(
    [{ role: "user", content: userPrompt }],
    { system: SYSTEM_PROMPT, maxTokens: 4096 },
  );

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude API response does not contain valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as PrepData;
}

// --- Notion block building ---

function richText(text: string): any[] {
  return [{ type: "text", text: { content: text } }];
}

function buildNotionBlocks(data: PrepData): any[] {
  const blocks: any[] = [];

  // Main heading
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: richText(`買い出し後の食材整理（${data.estimatedMinutes}分）`),
    },
  });

  // Sections: heading_3 + to_do items
  for (const section of data.sections) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: richText(section.heading),
      },
    });
    for (const item of section.items) {
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: richText(item),
          checked: false,
        },
      });
    }
  }

  return blocks;
}

// --- Notion write operations ---

async function clearPageContent(apiKey: string, pageId: string): Promise<number> {
  const response = await notionFetch(apiKey, `/blocks/${pageId}/children`);
  const blocks = response.results || [];
  let deleted = 0;
  for (const block of blocks) {
    await notionFetch(apiKey, `/blocks/${block.id}`, undefined, "DELETE");
    deleted++;
  }
  return deleted;
}

async function appendBlocks(apiKey: string, pageId: string, blocks: any[]): Promise<void> {
  const BATCH_SIZE = 100;
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    await notionFetch(apiKey, `/blocks/${pageId}/children`, { children: batch }, "PATCH");
  }
}

// --- Fridge.md update ---

function updateFridgeMd(additions: string[]): void {
  const fridgePath = join(DIET_DIR, "fridge.md");
  if (!existsSync(fridgePath)) {
    console.log("  Warning: fridge.md not found, skipping update");
    return;
  }

  let content = readFileSync(fridgePath, "utf-8");

  // Update the date
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  content = content.replace(/最終更新: \d{4}-\d{2}-\d{2}/, `最終更新: ${today}`);

  // Categorize additions and add them to the right sections
  // For now, append as a note at the bottom (Claude output tells what to add)
  // A more sophisticated approach would parse categories, but keeping it simple
  console.log(`  fridge.md additions: ${additions.join(", ")}`);

  writeFileSync(fridgePath, content, "utf-8");
}

// --- Local md output ---

function buildLocalMd(data: PrepData): string {
  const lines: string[] = [];

  lines.push(`## 買い出し後の食材整理（${data.estimatedMinutes}分）`);
  lines.push("");
  for (const section of data.sections) {
    lines.push(`### ${section.heading}`);
    for (const item of section.items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Dry run preview ---

function previewData(data: PrepData): string {
  const lines: string[] = [];
  lines.push(`## 買い出し後の食材整理（${data.estimatedMinutes}分）`);
  lines.push("");
  for (const section of data.sections) {
    lines.push(`### ${section.heading}`);
    for (const item of section.items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }
  if (data.fridgeAdditions.length > 0) {
    lines.push(`fridge.md 追加: ${data.fridgeAdditions.join(", ")}`);
  }
  return lines.join("\n");
}

// --- Main ---

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const pageId = opts["page-id"];
  const date = opts.date;

  if (!pageId && !date) {
    console.error("Usage:");
    console.error("  bun run scripts/notion-prep-gen.ts --date 2026-02-21");
    console.error("  bun run scripts/notion-prep-gen.ts --date 2026-02-21 --dry-run");
    console.error("  bun run scripts/notion-prep-gen.ts --page-id <grocery-page-id>");
    process.exit(1);
  }

  const apiKey = getApiKey();

  // 1. Find groceries page
  console.log("Finding groceries page ...");
  const groceryPage = pageId
    ? await getPageDateRange(apiKey, pageId)
    : await findGroceriesPage(apiKey, date!);

  console.log(`  Page: ${groceryPage.title} (${groceryPage.id})`);
  console.log(`  Range: ${groceryPage.dateStart} ~ ${groceryPage.dateEnd}`);

  // 2. Get date range
  const dates = dateRange(groceryPage.dateStart, groceryPage.dateEnd);
  console.log(`  Days: ${dates.map((d) => `${d}(${getWeekday(d)})`).join(", ")}`);

  // 3. Collect data (parallel)
  console.log("Collecting data ...");
  const [groceryItems, fridge] = await Promise.all([
    fetchGroceryItems(apiKey, groceryPage.id),
    Promise.resolve(loadFridge()),
  ]);

  console.log(`  Grocery items: ${groceryItems.length}`);

  // Parse daily meals
  const allMeals: MealEntry[] = [];
  for (const d of dates) {
    const dailyPath = join(DIET_DIR, "daily", `${d}.md`);
    if (existsSync(dailyPath)) {
      const content = readFileSync(dailyPath, "utf-8");
      allMeals.push(...parseDailyMeals(d, content));
    } else {
      console.log(`  Warning: ${d} (${getWeekday(d)}) daily file not found`);
    }
  }

  console.log(
    `  Meals: ${allMeals.length} (eating out: ${allMeals.filter((m) => m.isEatingOut).length})`,
  );

  // 4. Call Claude API
  console.log("Generating prep list via Claude API ...");
  const prepData = await generatePrepList(
    groceryItems,
    allMeals,
    fridge,
    groceryPage.dateStart,
    groceryPage.dateEnd,
  );

  // 5. Build Notion blocks
  const blocks = buildNotionBlocks(prepData);
  console.log(`  Blocks: ${blocks.length}`);

  // 6. Output
  if (dryRun) {
    console.log("\n--- Preview (dry-run) ---\n");
    console.log(previewData(prepData));
    console.log("\n--- JSON ---\n");
    console.log(JSON.stringify(prepData, null, 2));
    return;
  }

  // Find or create prep page
  console.log("Finding or creating prep page ...");
  let prepPageId = await findPrepPage(apiKey, groceryPage.dateStart);

  if (prepPageId) {
    console.log(`  Found existing prep page: ${prepPageId}`);
    const deletedCount = await clearPageContent(apiKey, prepPageId);
    console.log(`  Deleted ${deletedCount} existing blocks`);
  } else {
    prepPageId = await createPrepPage(apiKey, groceryPage.dateStart, groceryPage.title);
    console.log(`  Created new prep page: ${prepPageId}`);
  }

  // Write blocks to Notion
  await appendBlocks(apiKey, prepPageId, blocks);
  console.log(`  Added ${blocks.length} blocks`);

  // Update local md
  const groceriesMdPath = join(DIET_DIR, "groceries", `${groceryPage.dateStart}.md`);
  const localMd = buildLocalMd(prepData);

  if (existsSync(groceriesMdPath)) {
    const existing = readFileSync(groceriesMdPath, "utf-8");
    // Append if prep section doesn't exist yet
    if (!existing.includes("食材整理・下準備")) {
      writeFileSync(groceriesMdPath, existing.trimEnd() + "\n\n" + localMd, "utf-8");
      console.log(`  Updated ${groceriesMdPath}`);
    } else {
      // Replace existing prep section
      const prepIdx = existing.indexOf("## 食材整理・下準備");
      const before = existing.slice(0, prepIdx).trimEnd();
      writeFileSync(groceriesMdPath, before + "\n\n" + localMd, "utf-8");
      console.log(`  Replaced prep section in ${groceriesMdPath}`);
    }
  } else {
    writeFileSync(groceriesMdPath, `# ${groceryPage.dateStart}\n\n${localMd}`, "utf-8");
    console.log(`  Created ${groceriesMdPath}`);
  }

  // Update fridge.md
  console.log("Updating fridge.md ...");
  updateFridgeMd(prepData.fridgeAdditions);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
