# レシピN食分対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/kondate` で作成される Notion 食事ページのレシピを、実際に作る食数分（N食分）の分量・手順で生成する。

**Architecture:** `notion-recipe-gen.ts` に `--servings N` オプションを追加し、Claude API の SYSTEM_PROMPT を動的に切り替える。`notion-add.ts` が `--servings` を受け取り recipe-gen に中継する。`/kondate` スキルの指示を更新して `--servings` を渡すようにする。

**Tech Stack:** TypeScript (Bun), Notion API, Claude API

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/notion/notion-recipe-gen.ts` | Modify | `--servings` 引数の受け取り、SYSTEM_PROMPT の動的生成、callout への食数表示 |
| `scripts/notion/notion-add.ts` | Modify | `--servings` 引数の受け取り、`runRecipeGen` への中継 |
| `skills/kondate/SKILL.md` | Modify | Step 4a のコマンド例に `--servings` を追加 |

---

### Task 1: `notion-recipe-gen.ts` に `--servings` オプションを追加

**Files:**
- Modify: `scripts/notion/notion-recipe-gen.ts:28-39` (RecipeData 型)
- Modify: `scripts/notion/notion-recipe-gen.ts:43-77` (SYSTEM_PROMPT)
- Modify: `scripts/notion/notion-recipe-gen.ts:79-121` (searchAndGenerateRecipe)
- Modify: `scripts/notion/notion-recipe-gen.ts:193-292` (buildNotionBlocks)
- Modify: `scripts/notion/notion-recipe-gen.ts:359-426` (main)

- [ ] **Step 1: SYSTEM_PROMPT を関数に変更**

`SYSTEM_PROMPT` を定数から関数に変更し、servings 引数に応じてプロンプトを動的に生成する。

```typescript
// Replace the const SYSTEM_PROMPT = `...` (lines 43-77) with:

function buildSystemPrompt(servings: number): string {
  const servingsRule = servings >= 2
    ? `1. **材料は${servings}食分で記載**: 元レシピの人数に関わらず、${servings}食分の分量に換算してください`
    : `1. **材料は1人前に換算**: 元レシピが2人前なら半分に、4人前なら1/4に`;

  const servingsJson = servings >= 2
    ? `\n  "servings": ${servings},`
    : `\n  "servings": 1,`;

  return `あなたはレシピフォーマットアシスタントです。
レシピサイトの内容から、構造化JSONを生成します。

## ルール

${servingsRule}
2. **手順は簡潔に**: 各ステップを1文で${servings >= 2 ? `。分量は${servings}食分で記載する（例: 「水600ml入れる」）` : ""}
3. **コツは重要なものだけ**: 失敗しやすいポイント、美味しくなるコツ
4. **調理時間**: 下準備+調理の合計時間
5. **出典サイト名**: クラシル、白ごはん.com、Nadia、DELISH KITCHENなど

## 出力フォーマット

以下のJSON構造で出力してください（JSONのみ、他のテキスト不要）:

{
  "title": "鶏むね肉のソテー",
  "sourceUrl": "https://...",
  "sourceSite": "クラシル",
  "cookingTime": "20分",${servingsJson}
  "ingredients": [
    { "name": "鶏むね肉", "quantity": "${servings >= 2 ? `${150 * servings}g` : "150g"}" },
    { "name": "ブロッコリー", "quantity": "${servings >= 2 ? `${servings}株` : "1/2株"}" },
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
  ]
}`;
}
```

- [ ] **Step 2: RecipeData 型に servings を追加**

```typescript
// Replace the RecipeData interface (lines 28-39) with:

interface RecipeData {
  title: string;
  sourceUrl: string;
  sourceSite: string;
  cookingTime: string;
  servings: number;
  ingredients: Array<{
    name: string;
    quantity: string;
  }>;
  steps: string[];
  tips: string[];
}
```

- [ ] **Step 3: searchAndGenerateRecipe に servings 引数を追加**

```typescript
// Replace the function signature and SYSTEM_PROMPT usage (lines 79-104) with:

async function searchAndGenerateRecipe(
  menuName: string,
  servings: number = 1,
): Promise<RecipeData> {
  console.log(`🔍 Searching and generating recipe for: ${menuName}${servings >= 2 ? ` (${servings}食分)` : ""}`);

  const userPrompt = `「${menuName}」のレシピを探して、構造化JSONを生成してください。

## 手順
1. WebSearch で「${menuName} レシピ クラシル」を検索
2. 検索結果から最も適切なレシピページの URL を取得
3. WebFetch でそのページの内容を取得
4. 取得した内容を元に、指定フォーマットの JSON を生成

## 重要
- 必ず実在するレシピサイトから情報を取得してください
- JSON のみを出力してください（他のテキスト不要）`;

  const response = await callClaude(
    [{ role: "user", content: userPrompt }],
    {
      system: buildSystemPrompt(servings),
      model: "claude-sonnet-4-5-20250929",
      allowedTools: ["WebSearch", "WebFetch"],
      maxTurns: 10,
    },
  );
```

- [ ] **Step 4: buildNotionBlocks に servings 表示を追加**

callout ヘッダーに食数を表示する（servings >= 2 の場合のみ）。

```typescript
// Replace the header callout block in buildNotionBlocks (lines 196-209) with:

function buildNotionBlocks(data: RecipeData, stockItems: string[] = []): any[] {
  const blocks: any[] = [];

  const servings = data.servings || 1;

  // Header callout (green background)
  const calloutSegments = [
    { text: data.sourceSite, bold: true, url: data.sourceUrl },
  ];
  if (servings >= 2) {
    calloutSegments.push({ text: ` | 🍽️ ${servings}食分`, bold: true, color: "blue" });
  }
  calloutSegments.push(
    { text: " | 調理時間 " },
    { text: data.cookingTime, bold: true, color: "orange" },
  );

  blocks.push({
    object: "block",
    type: "callout",
    callout: {
      rich_text: styledText(calloutSegments),
      icon: { type: "emoji", emoji: "📋" },
      color: "green_background",
    },
  });

  // ... rest of function unchanged
```

- [ ] **Step 5: main() で --servings を受け取り渡す**

```typescript
// In the main function, after line 365 (const dryRun = ...), add:

  const servings = parseInt(args.opts["servings"] || "1", 10);
  if (isNaN(servings) || servings < 1) {
    console.error("Error: --servings must be a positive integer");
    process.exit(1);
  }

// Then update line 393 (the searchAndGenerateRecipe call):
  const recipeData = await searchAndGenerateRecipe(menuName, servings);

// And update the console.log output (after line 395):
  if (servings >= 2) {
    console.log(`🍽️  Servings: ${servings}食分`);
  }
```

- [ ] **Step 6: ドキュメントコメントを更新**

```typescript
// Update the file header comment (lines 1-13) to include --servings:

#!/usr/bin/env bun
/**
 * レシピ自動生成・Notion食事ページ更新
 *
 * メニュー名 → レシピ検索 → Claude API → Notion 食事ページ本文
 *
 * 使い方:
 *   bun run scripts/notion-recipe-gen.ts --page-id <id>
 *   bun run scripts/notion-recipe-gen.ts --page-id <id> --servings 3
 *   bun run scripts/notion-recipe-gen.ts --date 2026-02-17 --meal 昼
 *   bun run scripts/notion-recipe-gen.ts --page-id <id> --dry-run
 *
 * オプション:
 *   --servings N  食数（デフォルト: 1）。N食分の分量でレシピを生成する。
 *
 * メニュー名はページタイトルから自動取得。レシピURLも自動検索。
 */
```

- [ ] **Step 7: Commit**

```bash
git add scripts/notion/notion-recipe-gen.ts
git commit -m "feat: notion-recipe-gen に --servings オプション追加"
```

---

### Task 2: `notion-add.ts` で `--servings` を recipe-gen に中継

**Files:**
- Modify: `scripts/notion/notion-add.ts:148-163` (runRecipeGen)
- Modify: `scripts/notion/notion-add.ts:273-280` (meals DB section in main)

- [ ] **Step 1: runRecipeGen に servings 引数を追加**

```typescript
// Replace runRecipeGen (lines 148-163) with:

async function runRecipeGen(pageId: string, servings?: number): Promise<void> {
  console.log(`\n🍳 レシピ自動生成中...`);
  const cmd = ["bun", "run", "notion/notion-recipe-gen.ts", "--page-id", pageId];
  if (servings && servings >= 2) {
    cmd.push("--servings", String(servings));
  }
  const proc = Bun.spawn(cmd, {
    cwd: import.meta.dir + "/..",
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`レシピ生成に失敗しました（exit code: ${exitCode}）。ページは作成済みです。`);
  }
}
```

- [ ] **Step 2: main() で --servings を取得し runRecipeGen に渡す**

```typescript
// In the meals DB section (lines 273-280), update the runRecipeGen call:

  // meals DB → 自動レシピ生成
  if (dbName === "meals" && !flags.has("no-recipe")) {
    if (shouldSkipRecipe(opts.title)) {
      console.log(`📝 レシピ不要（${opts.title}）— スキップ`);
    } else {
      const servings = opts.servings ? parseInt(opts.servings, 10) : undefined;
      await runRecipeGen(data.id, servings);
    }
  }
```

- [ ] **Step 3: ドキュメントコメントを更新**

```typescript
// Add --servings to the usage comment at the top of the file (after line 11):
//   bun run scripts/notion-add.ts --title "鮭のバター醤油ソテー" --date 2026-04-22 --start 19:00 --end 20:00 --db meals --servings 3
//
// meals DB の場合、--servings N を指定するとN食分のレシピを生成する。
```

- [ ] **Step 4: Commit**

```bash
git add scripts/notion/notion-add.ts
git commit -m "feat: notion-add で --servings を recipe-gen に中継"
```

---

### Task 3: `/kondate` スキルの SKILL.md を更新

**Files:**
- Modify: `skills/kondate/SKILL.md:156-169` (Step 4a)

- [ ] **Step 1: Step 4a のコマンド例に `--servings` を追加**

Step 4a の `notion-add.ts` コマンド例を更新し、`--servings` の説明を追加する。

```markdown
### 4a. Notion meals DB に登録

**外食エントリは Notion に登録しない**。外食の食事枠は daily ファイルのみに記載し、`notion-add.ts` を実行しないこと。

自炊食事のみを `notion-add.ts` で登録する（`notion-add.ts` が内部で重複チェックとレシピ生成を自動実行するため、別途 `validate-entry.ts` や `notion-recipe-gen.ts` は手動実行しない）:

```bash
bun run scripts/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM --servings N
```

- **`--servings N`（必須）**: パック基準表で決定した食数をセットする（例: 鮭3切れパック → `--servings 3`）。レシピの材料・手順がN食分の分量で生成される
- 1食分の場合は `--servings 1` を渡す
```

- [ ] **Step 2: Commit**

```bash
git add skills/kondate/SKILL.md
git commit -m "docs: /kondate スキルに --servings の指示を追加"
```

---

### Task 4: 手動テスト

- [ ] **Step 1: `notion-recipe-gen.ts` の dry-run テスト（1食分 = デフォルト）**

既存の Notion 食事ページで dry-run して、従来動作が壊れていないことを確認する。

```bash
# 既存ページで dry-run（servings 未指定 = 1食分）
bun run scripts/notion/notion-recipe-gen.ts --page-id <existing-meal-page-id> --dry-run
```

Expected: 従来通り1人前の分量でブロックが生成される。callout に「食分」表示がない。

- [ ] **Step 2: `notion-recipe-gen.ts` の dry-run テスト（3食分）**

```bash
bun run scripts/notion/notion-recipe-gen.ts --page-id <existing-meal-page-id> --servings 3 --dry-run
```

Expected: 材料が3食分の分量。callout に「🍽️ 3食分」が表示される。手順内の分量も3食分。

- [ ] **Step 3: 確認結果を報告**

テスト結果をユーザーに報告し、問題があれば修正する。
