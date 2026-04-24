/**
 * 食事画像分析ライブラリ
 *
 * Notion の画像 URL を受け取って、Claude Code（`claude -p` CLI）の
 * マルチモーダル機能で 1 食分の栄養情報を推定する。
 */

import { writeFileSync, unlinkSync, existsSync } from "fs";

export interface MealVisionResult {
  dishName: string;
  items: string[];
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  confidence: "high" | "medium" | "low";
  confidenceReason?: string;
  imageCount: number;
}

export const MAX_IMAGES = 5;

export const SUPPORTED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Content-Type ヘッダから拡張子を判定する。
 * サポート外なら null を返す。
 */
export function extensionFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const type = contentType.split(";")[0].trim().toLowerCase();
  return SUPPORTED_CONTENT_TYPES[type] ?? null;
}

export interface DownloadedImage {
  path: string;
  cleanup: () => void;
}

export async function downloadImage(
  url: string,
  opts: { pageId: string; index: number },
): Promise<DownloadedImage | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const ext = extensionFromContentType(res.headers.get("content-type"));
  if (!ext) return null;

  const buf = new Uint8Array(await res.arrayBuffer());
  const pageIdNoDash = opts.pageId.replace(/-/g, "");
  const ts = Date.now();
  const path = `/tmp/meal-${pageIdNoDash}-${ts}-${opts.index}.${ext}`;
  writeFileSync(path, buf);
  return {
    path,
    cleanup: () => {
      if (existsSync(path)) unlinkSync(path);
    },
  };
}

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

export function parseVisionJson(raw: string, imageCount: number): MealVisionResult {
  // 1. Try to extract JSON from markdown code fence
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // 2. If still has surrounding text, find the outermost {...}
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON object found in vision output: ${raw.slice(0, 100)}`);
    }
    text = text.slice(start, end + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Vision output is not valid JSON: ${(e as Error).message}`);
  }

  const required = ["dishName", "items", "kcal", "protein", "fat", "carbs", "confidence"] as const;
  for (const key of required) {
    if (parsed[key] === undefined || parsed[key] === null) {
      throw new Error(`Vision output missing required field: ${key}`);
    }
  }
  if (typeof parsed.dishName !== "string") throw new Error("dishName must be string");
  if (!Array.isArray(parsed.items)) throw new Error("items must be array");
  if (typeof parsed.kcal !== "number") throw new Error("kcal must be number");
  if (typeof parsed.protein !== "number") throw new Error("protein must be number");
  if (typeof parsed.fat !== "number") throw new Error("fat must be number");
  if (typeof parsed.carbs !== "number") throw new Error("carbs must be number");
  if (!VALID_CONFIDENCE.has(parsed.confidence)) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  return {
    dishName: parsed.dishName,
    items: parsed.items.map(String),
    kcal: parsed.kcal,
    protein: parsed.protein,
    fat: parsed.fat,
    carbs: parsed.carbs,
    confidence: parsed.confidence,
    confidenceReason: typeof parsed.confidenceReason === "string" ? parsed.confidenceReason : undefined,
    imageCount,
  };
}

/**
 * 画像 URL のリストから 1 食分の栄養情報を推定する。
 * 最大 MAX_IMAGES 枚まで。超過分は無視（ログに警告）。
 */
export async function analyzeMealImages(
  imageUrls: string[],
  options?: { pageId?: string },
): Promise<MealVisionResult> {
  throw new Error("not implemented");
}
