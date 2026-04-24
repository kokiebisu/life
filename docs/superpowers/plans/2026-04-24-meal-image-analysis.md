# 食事画像分析による PFC/kcal 自動化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion meals DB のページに画像を貼ると、`/from-notion` 実行時に Claude Code サブスク経由で料理名・kcal・PFC を自動推定して書き戻す。

**Architecture:**
画像 URL → `lib/vision.ts` がダウンロード + `claude -p --allowedTools Read` でマルチモーダル分析 + JSON パース → `notion-meal-analyze.ts` が対象検出・書き戻しをオーケストレート → `notion-pull.ts` の enrich パイプラインに組み込み。自炊（レシピあり）は対象外で二重処理しない。

**Tech Stack:** TypeScript, Bun, `bun:test`, 既存の `lib/claude.ts`（`claude -p` CLI 経由）、既存の `lib/notion.ts`（REST API 直叩き）

**Spec:** [docs/superpowers/specs/2026-04-24-meal-image-analysis-design.md](../specs/2026-04-24-meal-image-analysis-design.md)

---

## File Structure

**新規作成:**
- `scripts/lib/vision.ts` — 画像分析ライブラリ（URL → JSON）
- `scripts/lib/vision.test.ts` — vision.ts のユニットテスト
- `scripts/notion/notion-meal-analyze.ts` — meals DB 走査 + 書き戻し CLI
- `scripts/notion/notion-meal-analyze.test.ts` — 対象判定・タイトル補強ルールのユニットテスト

**変更:**
- `scripts/notion/notion-pull.ts` — enrich パイプラインに `enrichMealImages()` を追加

**変更なし（参照のみ）:**
- `scripts/lib/claude.ts` — `callClaude()` を使う（`allowedTools: ["Read"]` 指定）
- `scripts/lib/notion.ts` — `notionFetch()`, `getMealsConfig()` を使う

---

## Task 1: vision.ts の型定義とモジュール骨格

**Files:**
- Create: `scripts/lib/vision.ts`
- Create: `scripts/lib/vision.test.ts`

- [ ] **Step 1: `vision.ts` に型定義とスタブを書く**

Create `scripts/lib/vision.ts`:

```typescript
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
```

- [ ] **Step 2: `vision.test.ts` に `extensionFromContentType` の failing test を書く**

Create `scripts/lib/vision.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { extensionFromContentType, MAX_IMAGES } from "./vision.ts";

describe("extensionFromContentType", () => {
  test("image/jpeg → jpg", () => {
    expect(extensionFromContentType("image/jpeg")).toBe("jpg");
  });

  test("image/png → png", () => {
    expect(extensionFromContentType("image/png")).toBe("png");
  });

  test("image/webp → webp", () => {
    expect(extensionFromContentType("image/webp")).toBe("webp");
  });

  test("image/jpg → jpg (alias)", () => {
    expect(extensionFromContentType("image/jpg")).toBe("jpg");
  });

  test("Content-Type with charset → still matches", () => {
    expect(extensionFromContentType("image/jpeg; charset=utf-8")).toBe("jpg");
  });

  test("uppercase Content-Type → still matches", () => {
    expect(extensionFromContentType("IMAGE/PNG")).toBe("png");
  });

  test("unsupported type → null", () => {
    expect(extensionFromContentType("image/gif")).toBe(null);
    expect(extensionFromContentType("application/pdf")).toBe(null);
  });

  test("null → null", () => {
    expect(extensionFromContentType(null)).toBe(null);
  });
});

describe("constants", () => {
  test("MAX_IMAGES is 5", () => {
    expect(MAX_IMAGES).toBe(5);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: All tests PASS (the function is already implemented in Step 1).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/vision.ts scripts/lib/vision.test.ts
git commit -m "feat(vision): add type definitions and extension helper"
```

---

## Task 2: vision.ts — 画像ダウンロードと一時ファイル管理

**Files:**
- Modify: `scripts/lib/vision.ts`
- Modify: `scripts/lib/vision.test.ts`

- [ ] **Step 1: Write failing test for `downloadImage`**

Append to `scripts/lib/vision.test.ts`:

```typescript
import { downloadImage } from "./vision.ts";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("downloadImage", () => {
  test("downloads a valid jpeg to /tmp and returns path + cleanup", async () => {
    // Use a data URL-style mock: we'll spin up a tiny fixture file and serve it via file://
    // Simplest approach: stub `fetch` globally for this test
    const originalFetch = globalThis.fetch;
    const fakeBody = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => fakeBody.buffer,
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/img.jpg", { pageId: "abc123", index: 0 });
      expect(result.path.startsWith("/tmp/meal-abc123-")).toBe(true);
      expect(result.path.endsWith("-0.jpg")).toBe(true);
      expect(existsSync(result.path)).toBe(true);
      expect(readFileSync(result.path)).toEqual(Buffer.from(fakeBody));
      result.cleanup();
      expect(existsSync(result.path)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("unsupported content-type returns null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/gif" },
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/img.gif", { pageId: "abc", index: 0 });
      expect(result).toBe(null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("HTTP error returns null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/404.jpg", { pageId: "abc", index: 0 });
      expect(result).toBe(null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: FAIL — `downloadImage is not a function`.

- [ ] **Step 3: Implement `downloadImage` in `vision.ts`**

Add to `scripts/lib/vision.ts`:

```typescript
import { writeFileSync, unlinkSync, existsSync } from "fs";

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
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/vision.ts scripts/lib/vision.test.ts
git commit -m "feat(vision): add image download with Content-Type detection"
```

---

## Task 3: vision.ts — JSON パーサとスキーマ検証

**Files:**
- Modify: `scripts/lib/vision.ts`
- Modify: `scripts/lib/vision.test.ts`

- [ ] **Step 1: Write failing tests for `parseVisionJson`**

Append to `scripts/lib/vision.test.ts`:

```typescript
import { parseVisionJson } from "./vision.ts";

describe("parseVisionJson", () => {
  test("valid JSON is parsed and imageCount is injected", () => {
    const raw = JSON.stringify({
      dishName: "ラーメン",
      items: ["醤油ラーメン 1杯"],
      kcal: 700,
      protein: 25,
      fat: 20,
      carbs: 90,
      confidence: "high",
    });
    const result = parseVisionJson(raw, 2);
    expect(result.dishName).toBe("ラーメン");
    expect(result.kcal).toBe(700);
    expect(result.imageCount).toBe(2);
    expect(result.confidence).toBe("high");
  });

  test("JSON wrapped in markdown code fence is extracted", () => {
    const raw = '```json\n{"dishName":"A","items":[],"kcal":1,"protein":1,"fat":1,"carbs":1,"confidence":"low"}\n```';
    const result = parseVisionJson(raw, 1);
    expect(result.dishName).toBe("A");
  });

  test("JSON with extra whitespace and surrounding text", () => {
    const raw = 'Here is the JSON:\n{"dishName":"B","items":[],"kcal":2,"protein":2,"fat":2,"carbs":2,"confidence":"medium"}\n';
    const result = parseVisionJson(raw, 1);
    expect(result.dishName).toBe("B");
  });

  test("missing required field throws", () => {
    const raw = JSON.stringify({ dishName: "X" });
    expect(() => parseVisionJson(raw, 1)).toThrow();
  });

  test("invalid confidence value throws", () => {
    const raw = JSON.stringify({
      dishName: "X", items: [], kcal: 1, protein: 1, fat: 1, carbs: 1,
      confidence: "unknown",
    });
    expect(() => parseVisionJson(raw, 1)).toThrow();
  });

  test("non-JSON input throws", () => {
    expect(() => parseVisionJson("not json", 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: FAIL — `parseVisionJson is not a function`.

- [ ] **Step 3: Implement `parseVisionJson`**

Add to `scripts/lib/vision.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/vision.ts scripts/lib/vision.test.ts
git commit -m "feat(vision): add JSON parser with schema validation"
```

---

## Task 4: vision.ts — プロンプト生成

**Files:**
- Modify: `scripts/lib/vision.ts`
- Modify: `scripts/lib/vision.test.ts`

- [ ] **Step 1: Write failing test for `buildVisionPrompt`**

Append to `scripts/lib/vision.test.ts`:

```typescript
import { buildVisionPrompt } from "./vision.ts";

describe("buildVisionPrompt", () => {
  test("single image prompt contains the path and JSON schema", () => {
    const prompt = buildVisionPrompt(["/tmp/a.jpg"]);
    expect(prompt).toContain("/tmp/a.jpg");
    expect(prompt).toContain("dishName");
    expect(prompt).toContain("kcal");
    expect(prompt).toContain("confidence");
  });

  test("multi-image prompt lists all paths and explains merging", () => {
    const prompt = buildVisionPrompt(["/tmp/a.jpg", "/tmp/b.png"]);
    expect(prompt).toContain("/tmp/a.jpg");
    expect(prompt).toContain("/tmp/b.png");
    expect(prompt).toContain("同一の食事");
    expect(prompt).toContain("二重計上しない");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: FAIL — `buildVisionPrompt is not a function`.

- [ ] **Step 3: Implement `buildVisionPrompt`**

Add to `scripts/lib/vision.ts`:

```typescript
export function buildVisionPrompt(imagePaths: string[]): string {
  const pathList = imagePaths.map((p) => `- ${p}`).join("\n");
  return `あなたは栄養士アシスタントです。指定された画像群は同一の食事を複数の角度・タイミングで撮影したものです。全画像を参考に、1 食分として合算の栄養情報を推定してください。

画像:
${pathList}

複数画像の扱い:
- 同じ料理が別角度で写っている場合は二重計上しない（1 品として扱う）
- 別の料理（例: 丼 + サイドサラダ）が写っている場合は両方を合算する
- 食卓全景 + 個別アップの組み合わせなら、全景で品数を確認し個別アップで材料を特定する

以下の JSON だけを返してください。説明文や Markdown コードブロックは不要です。

{
  "dishName": "料理名（日本語、複数料理なら「メイン + サイド」のように連結）",
  "items": ["主な食材 推定量", ...],
  "kcal": 合計値,
  "protein": 合計値,
  "fat": 合計値,
  "carbs": 合計値,
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "低い場合の理由（オプション）"
}

推定の目安:
- 一般的な定食・丼・麺類など典型的な料理は high
- 具材が見えにくい / 複数皿が重なっている → medium
- 暗い / ピントが合っていない / 部分的に見切れている → low
- 同一料理か別料理かの判別が難しい → medium 以下`;
}
```

- [ ] **Step 4: Run test**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/vision.ts scripts/lib/vision.test.ts
git commit -m "feat(vision): add prompt builder for multi-image analysis"
```

---

## Task 5: vision.ts — `analyzeMealImages` の実装（オーケストレーション）

**Files:**
- Modify: `scripts/lib/vision.ts`

この関数は実際に `callClaude()` を呼ぶため、ユニットテストは別途（Task 6 でモック経由）。

- [ ] **Step 1: Implement `analyzeMealImages`**

Replace the stub in `scripts/lib/vision.ts`:

```typescript
import { callClaude } from "./claude.ts";

/**
 * 画像 URL のリストから 1 食分の栄養情報を推定する。
 * - 最大 MAX_IMAGES 枚。超過分は無視（コンソール警告）
 * - 一部のダウンロード失敗は許容（残った画像で続行）
 * - 全画像失敗なら例外
 * - JSON パース失敗時は 1 回だけリトライ
 */
export async function analyzeMealImages(
  imageUrls: string[],
  options: { pageId: string },
): Promise<MealVisionResult> {
  if (imageUrls.length === 0) {
    throw new Error("analyzeMealImages: imageUrls is empty");
  }

  const targetUrls = imageUrls.slice(0, MAX_IMAGES);
  if (imageUrls.length > MAX_IMAGES) {
    console.warn(
      `[vision] ${imageUrls.length}枚の画像があるため、先頭${MAX_IMAGES}枚のみ使用します（pageId=${options.pageId}）`,
    );
  }

  const downloads: DownloadedImage[] = [];
  try {
    // 並列ダウンロード
    const results = await Promise.all(
      targetUrls.map((url, i) => downloadImage(url, { pageId: options.pageId, index: i })),
    );
    for (const r of results) {
      if (r) downloads.push(r);
    }
    if (downloads.length === 0) {
      throw new Error("すべての画像のダウンロードに失敗しました");
    }

    const prompt = buildVisionPrompt(downloads.map((d) => d.path));

    // Claude 呼び出し（JSON パース失敗時は 1 回リトライ）
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callClaude([{ role: "user", content: prompt }], {
        model: "claude-haiku-4-5-20251001",
        maxTokens: 1024,
        allowedTools: ["Read"],
        maxTurns: 3,
      });
      try {
        return parseVisionJson(raw, downloads.length);
      } catch (e) {
        if (attempt === 1) throw e;
        console.warn(`[vision] JSON パース失敗、リトライします: ${(e as Error).message}`);
      }
    }
    // 到達不能（TypeScript 満足用）
    throw new Error("unreachable");
  } finally {
    for (const d of downloads) d.cleanup();
  }
}
```

- [ ] **Step 2: Run existing tests to confirm nothing broke**

```bash
bun test scripts/lib/vision.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/vision.ts
git commit -m "feat(vision): implement analyzeMealImages orchestrator"
```

---

## Task 6: notion-meal-analyze.ts — 対象判定ロジック（純関数）

**Files:**
- Create: `scripts/notion/notion-meal-analyze.ts`
- Create: `scripts/notion/notion-meal-analyze.test.ts`

- [ ] **Step 1: Write failing tests for target detection**

Create `scripts/notion/notion-meal-analyze.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import {
  extractImageUrls,
  blocksToPlainText,
  shouldAnalyze,
  ANALYSIS_MARKER,
} from "./notion-meal-analyze.ts";

describe("extractImageUrls", () => {
  test("extracts file-hosted image URL", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://s3/file.jpg" } } },
    ];
    expect(extractImageUrls(blocks)).toEqual(["https://s3/file.jpg"]);
  });

  test("extracts external image URL", () => {
    const blocks = [
      { type: "image", image: { type: "external", external: { url: "https://ext/img.png" } } },
    ];
    expect(extractImageUrls(blocks)).toEqual(["https://ext/img.png"]);
  });

  test("multiple image blocks in order", () => {
    const blocks = [
      { type: "paragraph", paragraph: {} },
      { type: "image", image: { type: "file", file: { url: "https://a" } } },
      { type: "image", image: { type: "external", external: { url: "https://b" } } },
    ];
    expect(extractImageUrls(blocks)).toEqual(["https://a", "https://b"]);
  });

  test("no image blocks → empty array", () => {
    const blocks = [{ type: "paragraph", paragraph: {} }];
    expect(extractImageUrls(blocks)).toEqual([]);
  });
});

describe("blocksToPlainText", () => {
  test("concatenates rich_text across block types", () => {
    const blocks = [
      { type: "heading_2", heading_2: { rich_text: [{ plain_text: "昼食" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "豚ロース 150g" }] } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "玉ねぎ 80g" }] } },
    ];
    const text = blocksToPlainText(blocks);
    expect(text).toContain("昼食");
    expect(text).toContain("豚ロース 150g");
    expect(text).toContain("玉ねぎ 80g");
  });

  test("handles blocks without rich_text", () => {
    const blocks = [{ type: "divider", divider: {} }];
    expect(blocksToPlainText(blocks)).toBe("");
  });

  test("handles empty rich_text array", () => {
    const blocks = [{ type: "paragraph", paragraph: { rich_text: [] } }];
    expect(blocksToPlainText(blocks)).toBe("");
  });
});

describe("shouldAnalyze", () => {
  test("image + no marker + no ingredient list → true", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
    ];
    expect(shouldAnalyze(blocks)).toBe(true);
  });

  test("image + marker present → false", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
      { type: "heading_2", heading_2: { rich_text: [{ plain_text: ANALYSIS_MARKER }] } },
    ];
    expect(shouldAnalyze(blocks)).toBe(false);
  });

  test("image + ingredient list (- X 150g) → false (self-cook)", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "豚ロース 150g" }] } },
    ];
    expect(shouldAnalyze(blocks)).toBe(false);
  });

  test("image + numeric kcal in body → false", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "~520 kcal" }] } },
    ];
    expect(shouldAnalyze(blocks)).toBe(false);
  });

  test("no image → false", () => {
    const blocks = [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "text" }] } }];
    expect(shouldAnalyze(blocks)).toBe(false);
  });

  test("ingredient with 個 unit → self-cook (false)", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "卵 2個" }] } },
    ];
    expect(shouldAnalyze(blocks)).toBe(false);
  });

  test("ingredient with 本 unit → self-cook (false)", () => {
    const blocks = [
      { type: "image", image: { type: "file", file: { url: "https://x" } } },
      { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "長ねぎ 1本" }] } },
    ];
    expect(shouldAnalyze(blocks)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement detection helpers in `notion-meal-analyze.ts`**

Create `scripts/notion/notion-meal-analyze.ts`:

```typescript
/**
 * Notion meals DB の画像エントリーを走査して、kcal/PFC を自動推定する。
 *
 * 対象判定:
 *   - ページ本文に image ブロックがある
 *   - ANALYSIS_MARKER（"## 推定（画像分析）"）が未記入（冪等性）
 *   - 材料リスト（"- X 数字g/個/本/枚"）が未記入（自炊除外）
 *   - 数値 kcal（"\d+\s*kcal"）が未記入
 */

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
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/notion/notion-meal-analyze.ts scripts/notion/notion-meal-analyze.test.ts
git commit -m "feat(meal-analyze): add target detection helpers"
```

---

## Task 7: notion-meal-analyze.ts — タイトル補強ルール

**Files:**
- Modify: `scripts/notion/notion-meal-analyze.ts`
- Modify: `scripts/notion/notion-meal-analyze.test.ts`

- [ ] **Step 1: Write failing tests for `computeEnhancedTitle`**

Append to `scripts/notion/notion-meal-analyze.test.ts`:

```typescript
import { computeEnhancedTitle } from "./notion-meal-analyze.ts";

describe("computeEnhancedTitle", () => {
  test("empty title → 外食（dishName）", () => {
    expect(computeEnhancedTitle("", "ラーメン")).toBe("外食（ラーメン）");
  });

  test("whitespace title → 外食（dishName）", () => {
    expect(computeEnhancedTitle("   ", "ラーメン")).toBe("外食（ラーメン）");
  });

  test("外食 alone → 外食（dishName）", () => {
    expect(computeEnhancedTitle("外食", "ラーメン")).toBe("外食（ラーメン）");
  });

  test("朝食 alone → 外食（dishName）", () => {
    expect(computeEnhancedTitle("朝食", "サンドイッチ")).toBe("外食（サンドイッチ）");
  });

  test("昼食 alone → 外食（dishName）", () => {
    expect(computeEnhancedTitle("昼食", "定食")).toBe("外食（定食）");
  });

  test("夕食 alone → 外食（dishName）", () => {
    expect(computeEnhancedTitle("夕食", "寿司")).toBe("外食（寿司）");
  });

  test("外食（既存内容） → unchanged", () => {
    expect(computeEnhancedTitle("外食（YUTAさん）", "ラーメン")).toBe("外食（YUTAさん）");
  });

  test("店名 → unchanged", () => {
    expect(computeEnhancedTitle("すすきや", "定食")).toBe("すすきや");
  });

  test("具体的な料理名 → unchanged", () => {
    expect(computeEnhancedTitle("担々麺", "担々麺")).toBe("担々麺");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: FAIL — `computeEnhancedTitle is not a function`.

- [ ] **Step 3: Implement `computeEnhancedTitle`**

Add to `scripts/notion/notion-meal-analyze.ts`:

```typescript
const GENERIC_TITLES = new Set(["外食", "朝食", "昼食", "夕食"]);

/**
 * 既存タイトルと推定料理名から、新しいタイトルを返す。
 * 変更不要なら既存タイトルをそのまま返す。
 */
export function computeEnhancedTitle(currentTitle: string, dishName: string): string {
  const trimmed = currentTitle.trim();

  if (trimmed === "") return `外食（${dishName}）`;
  if (GENERIC_TITLES.has(trimmed)) return `外食（${dishName}）`;

  // 外食（...） パターン → 既にユーザーが情報を入れているので触らない
  if (trimmed.startsWith("外食") && trimmed.includes("（")) return currentTitle;

  // それ以外（店名・具体料理名）は触らない
  return currentTitle;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/notion/notion-meal-analyze.ts scripts/notion/notion-meal-analyze.test.ts
git commit -m "feat(meal-analyze): add title enhancement rules"
```

---

## Task 8: notion-meal-analyze.ts — 書き戻し用ブロック生成

**Files:**
- Modify: `scripts/notion/notion-meal-analyze.ts`
- Modify: `scripts/notion/notion-meal-analyze.test.ts`

- [ ] **Step 1: Write failing tests for `buildAnalysisBlocks`**

Append to `scripts/notion/notion-meal-analyze.test.ts`:

```typescript
import { buildAnalysisBlocks } from "./notion-meal-analyze.ts";
import type { MealVisionResult } from "../lib/vision.ts";

describe("buildAnalysisBlocks", () => {
  const result: MealVisionResult = {
    dishName: "豚しょうが焼き定食",
    items: ["豚ロース 150g", "玉ねぎ 80g", "白米 200g"],
    kcal: 780,
    protein: 32,
    fat: 28,
    carbs: 95,
    confidence: "high",
    imageCount: 1,
  };

  test("produces heading, dish paragraph, ingredient bullets, summary, confidence quote", () => {
    const blocks = buildAnalysisBlocks(result);
    const types = blocks.map((b) => b.type);
    expect(types[0]).toBe("heading_2");
    expect(types).toContain("bulleted_list_item");
    expect(types).toContain("paragraph");
    expect(types[types.length - 1]).toBe("quote");
  });

  test("heading contains analysis marker", () => {
    const blocks = buildAnalysisBlocks(result);
    const h = blocks[0];
    const text = h.heading_2.rich_text[0].text.content;
    expect(text).toBe("推定（画像分析）");
  });

  test("summary paragraph contains kcal and PFC", () => {
    const blocks = buildAnalysisBlocks(result);
    const texts = blocks.flatMap((b) =>
      b[b.type]?.rich_text?.map((r: any) => r.text?.content) ?? [],
    );
    const joined = texts.join(" ");
    expect(joined).toContain("780");
    expect(joined).toContain("P: 32");
    expect(joined).toContain("F: 28");
    expect(joined).toContain("C: 95");
  });

  test("confidence high → 高", () => {
    const blocks = buildAnalysisBlocks(result);
    const quote = blocks[blocks.length - 1];
    const text = quote.quote.rich_text[0].text.content;
    expect(text).toContain("高");
  });

  test("confidence low with reason → 低 + reason", () => {
    const blocks = buildAnalysisBlocks({ ...result, confidence: "low", confidenceReason: "暗くて判別困難" });
    const quote = blocks[blocks.length - 1];
    const text = quote.quote.rich_text[0].text.content;
    expect(text).toContain("低");
    expect(text).toContain("暗くて判別困難");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: FAIL — `buildAnalysisBlocks is not a function`.

- [ ] **Step 3: Implement `buildAnalysisBlocks`**

Add to `scripts/notion/notion-meal-analyze.ts`:

```typescript
import type { MealVisionResult } from "../lib/vision.ts";

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

  // Notion の heading_2 は自動で H2 レンダリングされるため、テキスト自体に ## は付けない
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
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test scripts/notion/notion-meal-analyze.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/notion/notion-meal-analyze.ts scripts/notion/notion-meal-analyze.test.ts
git commit -m "feat(meal-analyze): add Notion block builder for analysis result"
```

---

## Task 9: notion-meal-analyze.ts — Notion API ラッパーと 1 件処理

**Files:**
- Modify: `scripts/notion/notion-meal-analyze.ts`

このタスクでは Notion API を叩く実際の関数を追加する。ユニットテストは純関数に限定、これらはオーケストレーションなので手動検証で担保する。

- [ ] **Step 1: Add Notion API wrappers**

Add to `scripts/notion/notion-meal-analyze.ts`:

```typescript
import { notionFetch, getApiKey, getMealsConfig, queryDbByDate } from "../lib/notion.ts";
import { analyzeMealImages } from "../lib/vision.ts";

async function fetchPageChildren(apiKey: string, pageId: string): Promise<NotionBlock[]> {
  const res = await notionFetch(apiKey, `/blocks/${pageId}/children?page_size=100`);
  return res.results ?? [];
}

async function appendBlocks(apiKey: string, pageId: string, blocks: NotionBlock[]): Promise<void> {
  // Notion API の append は 100 ブロック上限。今回は最大でも数十ブロック程度なので一括。
  await notionFetch(apiKey, `/blocks/${pageId}/children`, { children: blocks }, "PATCH");
}

async function fetchPage(apiKey: string, pageId: string): Promise<any> {
  return notionFetch(apiKey, `/pages/${pageId}`);
}

async function updatePageTitle(
  apiKey: string,
  pageId: string,
  titleProp: string,
  newTitle: string,
): Promise<void> {
  await notionFetch(
    apiKey,
    `/pages/${pageId}`,
    {
      properties: {
        [titleProp]: { title: [{ text: { content: newTitle } }] },
      },
    },
    "PATCH",
  );
}

function getPageTitle(page: any, titleProp: string): string {
  const prop = page.properties?.[titleProp];
  const rich = prop?.title;
  if (!Array.isArray(rich)) return "";
  return rich.map((r: any) => r.plain_text ?? "").join("");
}
```

- [ ] **Step 2: Add single-page processor**

Add to `scripts/notion/notion-meal-analyze.ts`:

```typescript
export interface AnalyzeOutcome {
  pageId: string;
  status: "analyzed" | "skipped" | "failed";
  reason?: string;
  dishName?: string;
}

export async function analyzePage(
  apiKey: string,
  pageId: string,
  titleProp: string,
  options: { dryRun: boolean },
): Promise<AnalyzeOutcome> {
  const [page, blocks] = await Promise.all([
    fetchPage(apiKey, pageId),
    fetchPageChildren(apiKey, pageId),
  ]);

  if (!shouldAnalyze(blocks)) {
    return { pageId, status: "skipped", reason: "対象外（マーカー or 材料リスト or kcal あり、または画像なし）" };
  }

  const imageUrls = extractImageUrls(blocks);
  if (options.dryRun) {
    return {
      pageId,
      status: "skipped",
      reason: `dry-run: ${imageUrls.length}枚の画像を分析予定`,
    };
  }

  let result;
  try {
    result = await analyzeMealImages(imageUrls, { pageId });
  } catch (e) {
    return { pageId, status: "failed", reason: `vision 失敗: ${(e as Error).message}` };
  }

  const analysisBlocks = buildAnalysisBlocks(result);
  await appendBlocks(apiKey, pageId, analysisBlocks);

  const currentTitle = getPageTitle(page, titleProp);
  const newTitle = computeEnhancedTitle(currentTitle, result.dishName);
  if (newTitle !== currentTitle) {
    await updatePageTitle(apiKey, pageId, titleProp, newTitle);
  }

  return { pageId, status: "analyzed", dishName: result.dishName };
}
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/notion/notion-meal-analyze.ts
git commit -m "feat(meal-analyze): add per-page analyze orchestrator"
```

---

## Task 10: notion-meal-analyze.ts — 複数ページ走査 + CLI

**Files:**
- Modify: `scripts/notion/notion-meal-analyze.ts`

- [ ] **Step 1: Add multi-page scan function**

Add to `scripts/notion/notion-meal-analyze.ts`:

```typescript
export interface AnalyzeRunResult {
  total: number;
  analyzed: number;
  skipped: number;
  failed: number;
  outcomes: AnalyzeOutcome[];
}

export async function analyzeRange(options: {
  from?: string;
  to?: string;
  date?: string;
  pageId?: string;
  dryRun: boolean;
}): Promise<AnalyzeRunResult> {
  const apiKey = getApiKey();
  const config = getMealsConfig();

  let pageIds: string[];
  if (options.pageId) {
    pageIds = [options.pageId];
  } else {
    const from = options.date ?? options.from;
    const to = options.date ?? options.to;
    if (!from || !to) {
      throw new Error("--date または --from/--to が必要です");
    }
    const pages = await queryDbByDate(apiKey, config.dbId, config.config.dateProp, from, to);
    pageIds = pages.map((p: any) => p.id);
  }

  const outcomes: AnalyzeOutcome[] = [];
  for (const pageId of pageIds) {
    const outcome = await analyzePage(apiKey, pageId, config.config.titleProp, {
      dryRun: options.dryRun,
    });
    outcomes.push(outcome);
  }

  return {
    total: outcomes.length,
    analyzed: outcomes.filter((o) => o.status === "analyzed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
}
```

- [ ] **Step 2: Verify `queryDbByDate` signature**

```bash
grep -n "export async function queryDbByDate" /workspaces/life/scripts/lib/notion.ts
```

Expected: Signature matches `queryDbByDate(apiKey, dbId, dateProp, from, to)`. If the real signature differs, update the call in Step 1 to match (e.g., passing config object).

- [ ] **Step 3: Add CLI entry point**

Add to the end of `scripts/notion/notion-meal-analyze.ts`:

```typescript
import { parseArgs } from "../lib/notion.ts";

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");

  try {
    const result = await analyzeRange({
      from: opts["from"],
      to: opts["to"],
      date: opts["date"],
      pageId: opts["page-id"],
      dryRun,
    });

    console.log(`対象: ${result.total}件`);
    for (const o of result.outcomes) {
      const label = o.status === "analyzed" ? "✅" : o.status === "skipped" ? "➖" : "❌";
      const detail = o.dishName ? ` → ${o.dishName}` : o.reason ? ` (${o.reason})` : "";
      console.log(`${label} ${o.pageId}${detail}`);
    }
    console.log(
      `\n成功: ${result.analyzed}件 / スキップ: ${result.skipped}件 / 失敗: ${result.failed}件`,
    );
    if (result.failed > 0) process.exit(1);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Manual dry-run smoke test**

```bash
bun run scripts/notion/notion-meal-analyze.ts --date 2026-04-24 --dry-run
```

Expected: Lists today's meals entries with their status. No API calls to Claude vision should be made.

If today has no meals entry with an image, use a past date. Or create a test page manually in Notion first.

- [ ] **Step 6: Commit**

```bash
git add scripts/notion/notion-meal-analyze.ts
git commit -m "feat(meal-analyze): add range scan and CLI entry point"
```

---

## Task 11: notion-pull.ts の enrich 拡張

**Files:**
- Modify: `scripts/notion/notion-pull.ts`

- [ ] **Step 1: Locate the enrich pipeline in `notion-pull.ts`**

```bash
grep -n "enrich\|--no-enrich" /workspaces/life/scripts/notion/notion-pull.ts | head -20
```

Identify:
- Where `--no-enrich` flag is parsed
- Where the enrichment functions (e.g., travel time, icons) are called
- The location to insert `enrichMealImages()`

- [ ] **Step 2: Add `enrichMealImages()` function**

Add to `scripts/notion/notion-pull.ts` (near other enrich helpers; exact position depends on file structure from Step 1):

```typescript
import { analyzeRange } from "./notion-meal-analyze.ts";

async function enrichMealImages(from: string, to: string, dryRun: boolean): Promise<void> {
  const result = await analyzeRange({ from, to, dryRun });
  if (result.total === 0) return;
  console.log(
    `  meal-images: ${result.analyzed}件分析 / ${result.skipped}件スキップ / ${result.failed}件失敗`,
  );
  for (const o of result.outcomes) {
    if (o.status === "analyzed") console.log(`    ✅ ${o.pageId} → ${o.dishName}`);
    else if (o.status === "failed") console.log(`    ❌ ${o.pageId} (${o.reason})`);
  }
}
```

- [ ] **Step 3: Wire into existing enrich flow**

Locate the section where other enrich functions are called (after the main pull but inside the `if (!noEnrich)` block). Add:

```typescript
  await enrichMealImages(fromDate, toDate, dryRun);
```

Use the same `fromDate`/`toDate` variables that exist in the pull logic. If dry-run state is passed as a flag, reuse it.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: No errors.

- [ ] **Step 5: Smoke test with `--dry-run`**

```bash
bun run scripts/notion/notion-pull.ts --dry-run --date 2026-04-24
```

Expected: Normal pull dry-run output, followed by a `meal-images:` line (may be `0件分析` if no image entries).

- [ ] **Step 6: Commit**

```bash
git add scripts/notion/notion-pull.ts
git commit -m "feat(notion-pull): integrate meal image analysis into enrich pipeline"
```

---

## Task 12: 手動エンドツーエンド検証

このタスクはコード変更を含まない。実運用での品質確認。

- [ ] **Step 1: Notion に検証用ページを作成**

Notion モバイルアプリで:
1. meals DB を開く
2. 新規ページを作成。タイトルは `外食` とだけ入れる
3. 日付プロパティを今日にセット
4. 本文に実際の外食写真を 1 枚貼る
5. ページを保存

- [ ] **Step 2: `--page-id` 指定で分析実行（本番モード）**

Notion ページの URL または ID を取得。

```bash
bun run scripts/notion/notion-meal-analyze.ts --page-id <PAGE_ID>
```

Expected:
- `✅ <PAGE_ID> → <推定された料理名>` と表示
- 数分以内に終了（画像 DL + Claude CLI 呼び出し）
- エラーなし

- [ ] **Step 3: Notion ページを確認**

Notion でそのページを開き、以下を確認:
1. 本文末尾に `推定（画像分析）` の見出しが追加されている
2. 料理名、食材リスト、kcal + PFC サマリ、信頼度の引用が表示されている
3. タイトルが `外食（料理名）` に更新されている（元が `外食` だった場合）
4. 元の画像ブロックはそのまま残っている

- [ ] **Step 4: 冪等性確認（再実行でスキップ）**

```bash
bun run scripts/notion/notion-meal-analyze.ts --page-id <PAGE_ID>
```

Expected:
- `➖ <PAGE_ID> (対象外: マーカー ...)` と表示
- Notion ページに変更なし

- [ ] **Step 5: 複数画像のテスト**

Notion で別の新規ページを作成し、**2〜3 枚の写真**（例: 料理の全景 + アップ）を貼る。

```bash
bun run scripts/notion/notion-meal-analyze.ts --page-id <PAGE_ID_2>
```

Expected:
- 合算 kcal/PFC が返る（同じ料理の別角度なら二重計上しない、別料理なら合算）

- [ ] **Step 6: `/from-notion` 経由の確認**

Notion でもう 1 件、画像だけのページを作成する（タイトル空でもよい）。

```bash
bun run scripts/notion/notion-pull.ts --date <今日> --dry-run
```

Expected:
- 通常の pull dry-run 出力
- `meal-images: 1件分析予定` のような行（dry-run なので実際の分析はなし）

本番実行（dry-run なし）:

```bash
bun run scripts/notion/notion-pull.ts --date <今日>
```

Expected:
- `meal-images: 1件分析 / 0件スキップ / 0件失敗`

- [ ] **Step 7: 自炊エントリーとの共存確認**

自炊ページ（材料リスト + kcal 記載済み）が meals DB に存在する日付で実行し、**自炊は対象外になる**ことを確認。

```bash
bun run scripts/notion/notion-meal-analyze.ts --date <自炊のある日付> --dry-run
```

Expected:
- 自炊ページは `➖ <id> (対象外: ...)` で表示される
- 画像のみのページがあればそちらは `dry-run: N枚の画像を分析予定` と表示される

- [ ] **Step 8: 検証ノートをコミット（任意）**

もし検証中に何か運用ノートが出てきたら `.ai/rules/` に追記:

```bash
# 例: .ai/rules/notion-workflow.md に追記（存在すれば）
```

コミット対象があれば:

```bash
git add .ai/rules/notion-workflow.md
git commit -m "docs: add meal image analysis operational notes"
```

---

## Self-Review Checklist（プラン完成時の確認）

**Spec coverage:**
- ✅ vision.ts（画像 URL → MealVisionResult）: Task 1-5
- ✅ 対象判定（画像あり + マーカーなし + 材料なし + kcal なし）: Task 6
- ✅ タイトル補強ルール: Task 7
- ✅ 書き戻しフォーマット（heading_2 / paragraph / bullets / summary / quote）: Task 8
- ✅ 単ページ分析オーケストレータ: Task 9
- ✅ 範囲スキャン + CLI（--date / --from/--to / --page-id / --dry-run）: Task 10
- ✅ notion-pull.ts enrich 統合: Task 11
- ✅ 手動 e2e 検証: Task 12
- ✅ 冪等性（ANALYSIS_MARKER）: Task 6, 12
- ✅ 最大 5 枚 + 警告 + 部分失敗許容: Task 5
- ✅ JSON パースリトライ 1 回: Task 5

**Placeholder scan:** All code steps contain actual code. Commands have expected outputs.

**Type consistency:**
- `MealVisionResult` は Task 1 で定義、Task 5, 8, 9 で使用 — 一致
- `NotionBlock` 型は Task 6 で内部定義、Task 8, 9 で使用 — 一致
- `AnalyzeOutcome` / `AnalyzeRunResult` は Task 9-10 で定義・使用 — 一致
- `analyzeMealImages(urls, { pageId })` の呼び出しシグネチャが Task 5 定義と Task 9 使用で一致

**注意点（実装時に確認）:**
- Task 10 Step 2 で `queryDbByDate` の実シグネチャを確認（コード中で他に例があるので参照）。引数が config オブジェクトでも OK
- Task 11 Step 1 で `notion-pull.ts` の enrich 実装場所を確認。構造によっては `enrichMealImages` の呼び出し位置がずれる
- `claude -p` で `allowedTools Read` が画像ファイルを読めるか（Task 12 Step 2 で実地検証）。読めない場合は代替プロンプト or 一時的に標準入力経由の別手段を検討
