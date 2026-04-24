/**
 * Notion meals DB の画像エントリーを走査して、kcal/PFC を自動推定する。
 *
 * 対象判定:
 *   - ページ本文に image ブロックがある
 *   - ANALYSIS_MARKER（"推定（画像分析）"）が未記入（冪等性）
 *   - 材料リスト（"- X 数字g/個/本/枚"）が未記入（自炊除外）
 *   - 数値 kcal（"\d+\s*kcal"）が未記入
 */

import type { MealVisionResult } from "../lib/vision.ts";

export const ANALYSIS_MARKER = "推定（画像分析）";

const INGREDIENT_PATTERN = /-?\s*.+?\s+\d+\s*(g|個|本|枚)/;
const KCAL_PATTERN = /\d+\s*kcal/;

type NotionBlock = Record<string, any>;

export function extractImageUrls(blocks: NotionBlock[]): string[] {
  const urls: string[] = [];
  for (const b of blocks) {
    if (b.type !== "image") continue;
    const img = b.image;
    if (!img) continue;
    if (img.type === "file" && img.file?.url) urls.push(img.file.url);
    else if (img.type === "external" && img.external?.url) urls.push(img.external.url);
  }
  return urls;
}

export function blocksToPlainText(blocks: NotionBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const payload = b[b.type];
    const rich = payload?.rich_text;
    if (Array.isArray(rich)) {
      for (const r of rich) {
        if (r?.plain_text) parts.push(r.plain_text);
      }
    }
  }
  return parts.join("\n");
}

export function shouldAnalyze(blocks: NotionBlock[]): boolean {
  const images = extractImageUrls(blocks);
  if (images.length === 0) return false;
  const text = blocksToPlainText(blocks);
  if (text.includes(ANALYSIS_MARKER)) return false;
  if (INGREDIENT_PATTERN.test(text)) return false;
  if (KCAL_PATTERN.test(text)) return false;
  return true;
}

const GENERIC_TITLES = new Set(["外食", "朝食", "昼食", "夕食"]);

/**
 * 既存タイトルと推定料理名から、新しいタイトルを返す。
 * 変更不要なら既存タイトルをそのまま返す。
 */
export function computeEnhancedTitle(currentTitle: string, dishName: string): string {
  const trimmed = currentTitle.trim();

  if (trimmed === "") return `外食（${dishName}）`;
  if (GENERIC_TITLES.has(trimmed)) return `外食（${dishName}）`;

  if (trimmed.startsWith("外食") && trimmed.includes("（")) return currentTitle;

  return currentTitle;
}

function richText(text: string) {
  return [{ type: "text", text: { content: text } }];
}

const CONFIDENCE_JA: Record<MealVisionResult["confidence"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function buildAnalysisBlocks(result: MealVisionResult): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(ANALYSIS_MARKER) },
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(result.dishName) },
  });

  for (const item of result.items) {
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: richText(item) },
    });
  }

  const summary = `~${result.kcal} kcal | P: ${result.protein}g | F: ${result.fat}g | C: ${result.carbs}g`;
  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(summary) },
  });

  const confJa = CONFIDENCE_JA[result.confidence];
  const reason = result.confidenceReason ? ` / ${result.confidenceReason}` : "";
  blocks.push({
    object: "block",
    type: "quote",
    quote: { rich_text: richText(`画像分析による概算（信頼度: ${confJa}${reason}）`) },
  });

  return blocks;
}
