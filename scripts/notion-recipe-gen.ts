#!/usr/bin/env bun
/**
 * レシピ自動生成・Notion食事ページ更新
 *
 * メニュー名 → レシピ検索 → Claude API → Notion 食事ページ本文
 *
 * 使い方:
 *   bun run scripts/notion-recipe-gen.ts --page-id <id>
 *   bun run scripts/notion-recipe-gen.ts --date 2026-02-17 --meal 昼
 *   bun run scripts/notion-recipe-gen.ts --page-id <id> --dry-run
 *
 * メニュー名はページタイトルから自動取得。レシピURLも自動検索。
 */

import {
  type ScheduleDbName,
  getScheduleDbConfig,
  queryDbByDate,
  notionFetch,
  getApiKey,
  parseArgs,
} from "./lib/notion";
import { callClaude } from "./lib/claude";

// --- Types ---

interface RecipeData {
  title: string;
  sourceUrl: string;
  sourceSite: string;
  cookingTime: string;
  ingredients: Array<{
    name: string;
    quantity: string;
  }>;
  steps: string[];
  tips: string[];
  skillTheme?: string;
}

// --- Claude API ---

const SYSTEM_PROMPT = `あなたはレシピフォーマットアシスタントです。
レシピサイトの内容から、構造化JSONを生成します。

## ルール

1. **材料は1人前に換算**: 元レシピが2人前なら半分に、4人前なら1/4に
2. **手順は簡潔に**: 各ステップを1文で
3. **コツは重要なものだけ**: 失敗しやすいポイント、美味しくなるコツ
4. **調理時間**: 下準備+調理の合計時間
5. **出典サイト名**: クラシル、白ごはん.com、Nadia、DELISH KITCHENなど

## 出力フォーマット

以下のJSON構造で出力してください（JSONのみ、他のテキスト不要）:

{
  "title": "鶏むね肉のソテー",
  "sourceUrl": "https://...",
  "sourceSite": "クラシル",
  "cookingTime": "20分",
  "ingredients": [
    { "name": "鶏むね肉", "quantity": "150g" },
    { "name": "ブロッコリー", "quantity": "1/2株" },
    { "name": "塩", "quantity": "少々" }
  ],
  "steps": [
    "鶏むね肉を一口大に切る",
    "ブロッコリーを小房に分ける",
    "フライパンで炒める"
  ],
  "tips": [
    "むね肉は下味をつけると柔らかくなる",
    "火加減は中火でじっくり"
  ],
  "skillTheme": "焼く - フライパンの火加減"
}`;

function buildUserPrompt(recipeHtml: string, recipeUrl: string): string {
  return `以下のレシピサイトの内容を構造化JSONに変換してください。

## レシピURL
${recipeUrl}

## レシピ内容
${recipeHtml}`;
}

async function generateRecipeJson(
  recipeHtml: string,
  recipeUrl: string,
): Promise<RecipeData> {
  const userPrompt = buildUserPrompt(recipeHtml, recipeUrl);
  const response = await callClaude(
    [{ role: "user", content: userPrompt }],
    { system: SYSTEM_PROMPT, model: "claude-sonnet-4-5-20250929" },
  );

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude API response does not contain valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as RecipeData;
}

// --- Notion block building ---

function richText(text: string): any[] {
  return [{ type: "text", text: { content: text } }];
}

function styledText(
  segments: Array<{ text: string; bold?: boolean; color?: string; url?: string }>,
): any[] {
  return segments.map((s) => ({
    type: "text",
    text: { content: s.text, ...(s.url && { link: { url: s.url } }) },
    annotations: {
      ...(s.bold && { bold: true }),
      ...(s.color && { color: s.color }),
    },
  }));
}

function buildNotionBlocks(data: RecipeData): any[] {
  const blocks: any[] = [];

  // Header callout (green background)
  blocks.push({
    object: "block",
    type: "callout",
    callout: {
      rich_text: styledText([
        { text: data.sourceSite, bold: true, url: data.sourceUrl },
        { text: " | 調理時間 " },
        { text: data.cookingTime, bold: true, color: "orange" },
      ]),
      icon: { type: "emoji", emoji: "📋" },
      color: "green_background",
    },
  });

  // Divider
  blocks.push({ object: "block", type: "divider", divider: {} });

  // Ingredients section
  blocks.push({
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: styledText([{ text: "🥗 材料（1人前）" }]),
    },
  });

  for (const ing of data.ingredients) {
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: styledText([
          { text: ing.name, bold: true },
          { text: ` ${ing.quantity}` },
        ]),
      },
    });
  }

  // Steps section
  blocks.push({
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: styledText([{ text: "👨‍🍳 作り方" }]),
    },
  });

  for (const step of data.steps) {
    blocks.push({
      object: "block",
      type: "numbered_list_item",
      numbered_list_item: {
        rich_text: richText(step),
      },
    });
  }

  // Tips section
  if (data.tips.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: styledText([{ text: "💡 コツ・ポイント" }]),
      },
    });

    blocks.push({
      object: "block",
      type: "quote",
      quote: {
        rich_text: richText(data.tips.join("\n")),
      },
    });
  }

  // Skill theme section
  if (data.skillTheme) {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: styledText([
          { text: "🎯 今週のスキルテーマ\n", bold: true },
          { text: data.skillTheme },
        ]),
        icon: { type: "emoji", emoji: "🎯" },
        color: "blue_background",
      },
    });
  }

  return blocks;
}

// --- Page finding ---

async function findMealPage(
  apiKey: string,
  date: string,
  meal: string,
): Promise<{ id: string; title: string }> {
  const { dbId, config } = getScheduleDbConfig("meals");
  const data = await queryDbByDate(apiKey, dbId, config, date, date);
  const pages = data.results;

  // Filter by meal time (朝/昼/間食/夜)
  const mealPages = pages.filter((p: any) => {
    const title =
      p.properties[config.titleProp]?.title
        ?.map((t: any) => t.plain_text)
        .join("") || "";
    return title.includes(meal);
  });

  if (mealPages.length === 0) {
    throw new Error(
      `No meal page found for date ${date}, meal ${meal}`,
    );
  }

  const page = mealPages[0];
  const props = page.properties;
  const titleArr = props[config.titleProp]?.title || [];
  const title = titleArr.map((t: any) => t.plain_text || "").join("");

  return { id: page.id, title };
}

async function getPageTitle(apiKey: string, pageId: string): Promise<string> {
  const page = await notionFetch(apiKey, `/pages/${pageId}`);
  const props = page.properties;
  const titleArr = props["名前"]?.title || [];
  return titleArr.map((t: any) => t.plain_text || "").join("");
}

// --- Recipe search ---

async function searchRecipeUrl(menuName: string): Promise<string> {
  console.log(`🔍 Searching for recipe: ${menuName}`);

  const query = `クラシル ${menuName}`;
  const proc = Bun.spawn(
    ["claude", "websearch", query, "-p", "レシピのURLだけを1つ返してください（クラシル優先）。他の説明は不要です。"],
    {
      env: { ...process.env, CLAUDECODE: "" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  // Extract URL from output
  const urlMatch = output.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) {
    throw new Error(`Could not find recipe URL for: ${menuName}`);
  }

  return urlMatch[0];
}

async function fetchRecipeContent(url: string): Promise<string> {
  const prompt = `レシピの内容を抽出してください。以下の情報を含めてください：
- タイトル
- 調理時間
- 材料リスト（分量も含む）
- 作り方の手順
- コツ・ポイント`;

  const proc = Bun.spawn(
    ["claude", "webfetch", url, "-p", prompt],
    {
      env: { ...process.env, CLAUDECODE: "" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return output;
}

// --- Notion update ---

async function updateNotionPage(
  apiKey: string,
  pageId: string,
  blocks: any[],
): Promise<void> {
  // Delete existing blocks
  const page = await notionFetch(
    apiKey,
    `/blocks/${pageId}/children?page_size=100`,
  );
  const existingBlocks = page.results || [];

  for (const block of existingBlocks) {
    await notionFetch(apiKey, `/blocks/${block.id}`, {
      method: "DELETE",
    });
  }

  // Append new blocks
  await notionFetch(apiKey, `/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children: blocks }),
  });
}

// --- Main ---

async function main() {
  const args = parseArgs();

  const pageId = args.opts["page-id"] || args.opts["id"];
  const date = args.opts["date"];
  const meal = args.opts["meal"];
  const dryRun = args.flags.has("dry-run");

  if (!pageId && (!date || !meal)) {
    console.error("Error: --page-id OR (--date AND --meal) is required");
    process.exit(1);
  }

  const apiKey = getApiKey();

  // Find page
  let targetPageId: string;
  let pageTitle: string;

  if (pageId) {
    targetPageId = pageId;
    pageTitle = await getPageTitle(apiKey, pageId);
    console.log(`📄 Page: ${pageTitle} (${pageId})`);
  } else {
    const page = await findMealPage(apiKey, date!, meal!);
    targetPageId = page.id;
    pageTitle = page.title;
    console.log(`📄 Found: ${pageTitle} (${targetPageId})`);
  }

  // Extract menu name from title (remove meal prefix like "昼 ")
  const menuName = pageTitle.replace(/^(朝|昼|間食|夜)\s*/, "");

  // Search for recipe URL
  const url = await searchRecipeUrl(menuName);
  console.log(`✅ Found recipe: ${url}`);

  // Fetch recipe
  console.log(`🌐 Fetching recipe content...`);
  const recipeHtml = await fetchRecipeContent(url);

  // Generate JSON
  console.log("🤖 Generating structured recipe...");
  const recipeData = await generateRecipeJson(recipeHtml, url);

  console.log(`\n📋 Recipe: ${recipeData.title}`);
  console.log(`⏱️  Cooking time: ${recipeData.cookingTime}`);
  console.log(`🥗 Ingredients: ${recipeData.ingredients.length} items`);
  console.log(`👨‍🍳 Steps: ${recipeData.steps.length} steps`);

  // Build Notion blocks
  const blocks = buildNotionBlocks(recipeData);

  if (dryRun) {
    console.log("\n🔍 [DRY RUN] Generated blocks:");
    console.log(JSON.stringify(blocks, null, 2));
    console.log("\n✅ Dry run complete. No changes made.");
    return;
  }

  // Update Notion page
  console.log(`\n📝 Updating Notion page...`);
  await updateNotionPage(apiKey, targetPageId, blocks);

  console.log(`✅ Recipe added to: ${pageTitle}`);
  console.log(`🔗 ${url}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
