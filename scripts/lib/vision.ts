/**
 * 食事画像分析ライブラリ
 *
 * Notion の画像 URL を受け取って、Claude Code（`claude -p` CLI）の
 * マルチモーダル機能で 1 食分の栄養情報を推定する。
 */

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
