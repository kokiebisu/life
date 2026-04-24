# /kondate 自動化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions cron で毎朝 Notion meals DB を確認し、今日〜3日後のエントリーが 2 件以下なら作り置きメニュー1品を自動生成して PR 経由で登録する仕組みを実装する。

**Architecture:** 既存の `scripts/notion/notion-add.ts` を呼び出すオーケストレーター `scripts/kondate/kondate-auto.ts` を新規作成。補助モジュール 3 本（空きスロット算出・履歴管理・メニュー生成）に分割。GitHub Actions workflow が毎朝 JST 03:00 に起動し、bun script を実行、bot token で PR を作成・squash merge する。

**Tech Stack:** Bun + TypeScript、`bun:test` 単体テスト、Claude API（`scripts/lib/llm.ts` の `callLLM` 経由）、Notion API（既存ラッパー再利用）、GitHub Actions（`ubuntu-latest`）。

**Spec:** `docs/superpowers/specs/2026-04-24-kondate-auto-design.md`

---

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `scripts/kondate/kondate-auto.ts` | 新規 | CLI エントリー。判定 → 生成 → 登録 → 履歴更新をオーケストレート |
| `scripts/kondate/lib/empty-slots.ts` | 新規 | 3日×3食枠から占有済みを除外して先頭 N スロットを返す純粋関数 |
| `scripts/kondate/lib/empty-slots.test.ts` | 新規 | `empty-slots.ts` の単体テスト |
| `scripts/kondate/lib/menu-history.ts` | 新規 | `kondate-history.md` の読み込み・追記 |
| `scripts/kondate/lib/menu-history.test.ts` | 新規 | `menu-history.ts` の単体テスト |
| `scripts/kondate/lib/generate-menu.ts` | 新規 | Claude API 呼び出し。プロンプト組み立て + JSON パース |
| `scripts/kondate/lib/generate-menu.test.ts` | 新規 | プロンプトビルダー・パーサの単体テスト（Claude 呼び出しはモック） |
| `aspects/diet/kondate-history.md` | 新規 | 生成履歴（初期は見出しのみ） |
| `.github/workflows/kondate-auto.yml` | 新規 | GH Actions cron workflow |

**既存流用（変更なし）:**

- `scripts/notion/notion-add.ts` — meals エントリー登録
- `scripts/notion/notion-list.ts` — 代わりに `lib/notion.ts` の `queryDbByDateCached` を直接呼び出す
- `scripts/notion/lib/notion.ts` — Notion API クライアント
- `scripts/lib/llm.ts` — Claude API ラッパー
- `scripts/create-pr.ts` — PR 作成フォールバック

---

## Task 0: Worktree 作成

- [ ] **Step 1: 現状の unstaged changes を退避**

```bash
cd /workspaces/life
git stash -u 2>&1 || echo "nothing to stash"
```

Expected: 既存の staged/untracked（aspects/tasks.md, aspects/study/..., aspects/gym/logs/...）が stash に退避される。

- [ ] **Step 2: worktree 作成**

```bash
cd /workspaces/life
BRANCH="feat/kondate-auto"
git worktree add .worktrees/$BRANCH -b $BRANCH main
cd .worktrees/$BRANCH
```

Expected: `.worktrees/feat/kondate-auto/` が main の最新状態で作成される。以降すべて このディレクトリで作業する。

- [ ] **Step 3: 作業ディレクトリ確認**

```bash
pwd
git status
git branch --show-current
```

Expected:
- `pwd` → `/workspaces/life/.worktrees/feat/kondate-auto`
- `git status` → clean working tree
- `git branch --show-current` → `feat/kondate-auto`

---

## Task 1: kondate-history.md 初期ファイル作成

**Files:**
- Create: `aspects/diet/kondate-history.md`

- [ ] **Step 1: 初期ファイル作成**

```bash
cat > aspects/diet/kondate-history.md <<'EOF'
# 自動生成メニュー履歴

> `/kondate-auto`（GitHub Actions cron）で生成されたメニューの履歴。
> 重複回避・単調化防止に使う。新しい日付が上。

EOF
```

- [ ] **Step 2: ファイル確認**

```bash
cat aspects/diet/kondate-history.md
```

Expected: 見出しと説明行のみ表示。

- [ ] **Step 3: commit**

```bash
git add aspects/diet/kondate-history.md
git commit -m "feat(kondate-auto): add empty kondate-history.md"
```

---

## Task 2: menu-history.ts（履歴読み書き）

**Files:**
- Create: `scripts/kondate/lib/menu-history.ts`
- Create: `scripts/kondate/lib/menu-history.test.ts`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p scripts/kondate/lib
```

- [ ] **Step 2: 失敗するテストを書く**

```bash
cat > scripts/kondate/lib/menu-history.test.ts <<'EOF'
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readHistory, appendHistoryEntry, type HistoryEntry } from "./menu-history";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "kondate-hist-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("readHistory", () => {
  test("returns empty array when file has only header", () => {
    const path = join(tmp, "history.md");
    writeFileSync(path, "# 自動生成メニュー履歴\n\n> 説明\n\n");
    expect(readHistory(path)).toEqual([]);
  });

  test("parses single entry", () => {
    const path = join(tmp, "history.md");
    writeFileSync(
      path,
      "# 自動生成メニュー履歴\n\n## 2026-04-24\n- [鶏むねハム](https://notion.so/abc)（和）\n",
    );
    expect(readHistory(path)).toEqual([
      { date: "2026-04-24", menu: "鶏むねハム", url: "https://notion.so/abc", cuisine: "和" },
    ]);
  });

  test("parses multiple entries across dates", () => {
    const path = join(tmp, "history.md");
    writeFileSync(
      path,
      "# 自動生成メニュー履歴\n\n## 2026-04-24\n- [豚生姜焼き](https://notion.so/b)（和）\n\n## 2026-04-21\n- [鶏むねハム](https://notion.so/a)（和）\n",
    );
    const entries = readHistory(path);
    expect(entries).toHaveLength(2);
    expect(entries[0].date).toBe("2026-04-24");
    expect(entries[1].date).toBe("2026-04-21");
  });

  test("returns empty when file does not exist", () => {
    expect(readHistory(join(tmp, "missing.md"))).toEqual([]);
  });
});

describe("appendHistoryEntry", () => {
  test("inserts new date section at top below header", () => {
    const path = join(tmp, "history.md");
    writeFileSync(path, "# 自動生成メニュー履歴\n\n> 説明\n\n");
    const entry: HistoryEntry = {
      date: "2026-04-24",
      menu: "鮭の塩焼き",
      url: "https://notion.so/xyz",
      cuisine: "和",
    };
    appendHistoryEntry(path, entry);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("## 2026-04-24");
    expect(content).toContain("- [鮭の塩焼き](https://notion.so/xyz)（和）");
  });

  test("prepends entry above existing dates", () => {
    const path = join(tmp, "history.md");
    writeFileSync(
      path,
      "# 自動生成メニュー履歴\n\n## 2026-04-21\n- [鶏むねハム](https://notion.so/a)（和）\n",
    );
    appendHistoryEntry(path, {
      date: "2026-04-24",
      menu: "豚生姜焼き",
      url: "https://notion.so/b",
      cuisine: "和",
    });
    const entries = readHistory(path);
    expect(entries[0].date).toBe("2026-04-24");
    expect(entries[1].date).toBe("2026-04-21");
  });
});
EOF
```

- [ ] **Step 3: テストが失敗することを確認**

```bash
bun test scripts/kondate/lib/menu-history.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module './menu-history'` または類似のエラー。

- [ ] **Step 4: 最小実装を書く**

```bash
cat > scripts/kondate/lib/menu-history.ts <<'EOF'
import { existsSync, readFileSync, writeFileSync } from "fs";

export interface HistoryEntry {
  date: string;
  menu: string;
  url: string;
  cuisine: string;
}

const ENTRY_RE = /^- \[(.+?)\]\((.+?)\)（(.+?)）\s*$/;
const DATE_RE = /^## (\d{4}-\d{2}-\d{2})\s*$/;

export function readHistory(path: string): HistoryEntry[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  const entries: HistoryEntry[] = [];
  let currentDate: string | null = null;
  for (const line of text.split("\n")) {
    const dm = DATE_RE.exec(line);
    if (dm) {
      currentDate = dm[1];
      continue;
    }
    const em = ENTRY_RE.exec(line);
    if (em && currentDate) {
      entries.push({
        date: currentDate,
        menu: em[1],
        url: em[2],
        cuisine: em[3],
      });
    }
  }
  return entries;
}

export function appendHistoryEntry(path: string, entry: HistoryEntry): void {
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "# 自動生成メニュー履歴\n\n";
  const lines = existing.split("\n");

  // Find insertion point: after the last "> " blockquote or after the title
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) insertAt = i + 1;
    if (lines[i].startsWith("> ")) insertAt = i + 1;
  }
  // Skip blank lines after header/blockquote
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;

  const block = [
    `## ${entry.date}`,
    `- [${entry.menu}](${entry.url})（${entry.cuisine}）`,
    "",
  ];

  const newLines = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
  writeFileSync(path, newLines.join("\n"));
}
EOF
```

- [ ] **Step 5: テストが通ることを確認**

```bash
bun test scripts/kondate/lib/menu-history.test.ts 2>&1 | tail -20
```

Expected: 全テスト pass（6 件以上）。失敗したら実装を修正。

- [ ] **Step 6: commit**

```bash
git add scripts/kondate/lib/menu-history.ts scripts/kondate/lib/menu-history.test.ts
git commit -m "feat(kondate-auto): add menu-history read/append utility"
```

---

## Task 3: empty-slots.ts（空きスロット算出）

**Files:**
- Create: `scripts/kondate/lib/empty-slots.ts`
- Create: `scripts/kondate/lib/empty-slots.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```bash
cat > scripts/kondate/lib/empty-slots.test.ts <<'EOF'
import { describe, test, expect } from "bun:test";
import { computeEmptySlots, type Slot, type ExistingEntry } from "./empty-slots";

describe("computeEmptySlots", () => {
  test("returns 9 slots across 3 days when no existing entries", () => {
    const slots = computeEmptySlots("2026-04-24", 3, []);
    expect(slots).toHaveLength(9);
    expect(slots[0]).toEqual({
      date: "2026-04-24",
      mealType: "朝",
      start: "08:00",
      end: "09:00",
    });
    expect(slots[1]).toEqual({
      date: "2026-04-24",
      mealType: "昼",
      start: "12:00",
      end: "13:00",
    });
    expect(slots[2]).toEqual({
      date: "2026-04-24",
      mealType: "晩",
      start: "19:00",
      end: "20:00",
    });
    expect(slots[8].date).toBe("2026-04-26");
  });

  test("excludes slot occupied by existing entry at 08:30 (breakfast window)", () => {
    const existing: ExistingEntry[] = [{ date: "2026-04-24", startTime: "08:30" }];
    const slots = computeEmptySlots("2026-04-24", 3, existing);
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({
      date: "2026-04-24",
      mealType: "昼",
      start: "12:00",
      end: "13:00",
    });
  });

  test("excludes slot occupied at 13:30 (lunch window)", () => {
    const existing: ExistingEntry[] = [{ date: "2026-04-24", startTime: "13:30" }];
    const slots = computeEmptySlots("2026-04-24", 3, existing);
    expect(slots.find((s) => s.date === "2026-04-24" && s.mealType === "昼")).toBeUndefined();
  });

  test("excludes slot at 19:30 (dinner window)", () => {
    const existing: ExistingEntry[] = [{ date: "2026-04-25", startTime: "19:30" }];
    const slots = computeEmptySlots("2026-04-24", 3, existing);
    expect(slots.find((s) => s.date === "2026-04-25" && s.mealType === "晩")).toBeUndefined();
  });

  test("handles multiple existing entries across days", () => {
    const existing: ExistingEntry[] = [
      { date: "2026-04-24", startTime: "08:30" },
      { date: "2026-04-24", startTime: "12:30" },
    ];
    const slots = computeEmptySlots("2026-04-24", 3, existing);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({
      date: "2026-04-24",
      mealType: "晩",
      start: "19:00",
      end: "20:00",
    });
  });

  test("picks first N slots via take(n)", () => {
    const slots = computeEmptySlots("2026-04-24", 3, []);
    const first3 = slots.slice(0, 3);
    expect(first3.map((s) => `${s.date} ${s.mealType}`)).toEqual([
      "2026-04-24 朝",
      "2026-04-24 昼",
      "2026-04-24 晩",
    ]);
  });
});
EOF
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
bun test scripts/kondate/lib/empty-slots.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module './empty-slots'`。

- [ ] **Step 3: 実装を書く**

```bash
cat > scripts/kondate/lib/empty-slots.ts <<'EOF'
export type MealType = "朝" | "昼" | "晩";

export interface Slot {
  date: string;
  mealType: MealType;
  start: string;
  end: string;
}

export interface ExistingEntry {
  date: string;
  startTime: string;
}

const MEAL_SLOTS: Array<{ type: MealType; start: string; end: string; window: [string, string] }> = [
  { type: "朝", start: "08:00", end: "09:00", window: ["05:00", "11:00"] },
  { type: "昼", start: "12:00", end: "13:00", window: ["11:00", "16:00"] },
  { type: "晩", start: "19:00", end: "20:00", window: ["16:00", "23:59"] },
];

function timeInRange(t: string, start: string, end: string): boolean {
  return t >= start && t < end;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function computeEmptySlots(
  startDate: string,
  days: number,
  existing: ExistingEntry[],
): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    for (const meal of MEAL_SLOTS) {
      const occupied = existing.some(
        (e) => e.date === date && timeInRange(e.startTime, meal.window[0], meal.window[1]),
      );
      if (!occupied) {
        slots.push({ date, mealType: meal.type, start: meal.start, end: meal.end });
      }
    }
  }
  return slots;
}
EOF
```

- [ ] **Step 4: テストが通ることを確認**

```bash
bun test scripts/kondate/lib/empty-slots.test.ts 2>&1 | tail -20
```

Expected: 全テスト pass。

- [ ] **Step 5: commit**

```bash
git add scripts/kondate/lib/empty-slots.ts scripts/kondate/lib/empty-slots.test.ts
git commit -m "feat(kondate-auto): add empty-slots computation"
```

---

## Task 4: generate-menu.ts（Claude API 呼び出し）

**Files:**
- Create: `scripts/kondate/lib/generate-menu.ts`
- Create: `scripts/kondate/lib/generate-menu.test.ts`

このタスクでは Claude API 呼び出し本体は `callLLM` に委譲し、テストは「プロンプト組み立て」と「JSON レスポンスパース」の純粋関数を対象にする。

- [ ] **Step 1: 失敗するテストを書く**

```bash
cat > scripts/kondate/lib/generate-menu.test.ts <<'EOF'
import { describe, test, expect } from "bun:test";
import { buildPrompt, parseMenuResponse, type MenuContext, type MenuResult } from "./generate-menu";

const baseContext: MenuContext = {
  pastMeals: [
    { date: "2026-04-22", title: "鶏むね蒸し" },
    { date: "2026-04-20", title: "鮭の塩焼き" },
  ],
  historyMenus: ["豚こま生姜焼き", "鮭の塩焼き"],
  fridge: "鶏むね肉 1枚\nキャベツ 1/2",
  nutritionTargets: "P: 920g/週 ...",
  ngIngredients: ["トマト", "マヨネーズ"],
  emptySlots: [
    { date: "2026-04-24", mealType: "朝", start: "08:00", end: "09:00" },
    { date: "2026-04-24", mealType: "昼", start: "12:00", end: "13:00" },
    { date: "2026-04-24", mealType: "晩", start: "19:00", end: "20:00" },
  ],
};

describe("buildPrompt", () => {
  test("includes priority ordering 美味しさ > 栄養 > 在庫", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("美味しさ > 栄養バランス > 在庫消化");
  });

  test("lists recipe sources", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("クラシル");
    expect(prompt).toContain("白ごはん.com");
    expect(prompt).toContain("Nadia");
    expect(prompt).toContain("DELISH KITCHEN");
  });

  test("excludes エスニック cuisine", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("和/洋/中");
    expect(prompt).toContain("エスニック");
    expect(prompt).toMatch(/エスニック.*(除外|禁止|避け)/);
  });

  test("lists past 14 days proteins to avoid", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("鶏むね蒸し");
    expect(prompt).toContain("鮭の塩焼き");
  });

  test("lists history menus to avoid duplication", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("豚こま生姜焼き");
  });

  test("lists NG ingredients", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("トマト");
    expect(prompt).toContain("マヨネーズ");
  });

  test("requests JSON output", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("menu_name");
    expect(prompt).toContain("cuisine");
    expect(prompt).toContain("recipe_url");
  });
});

describe("parseMenuResponse", () => {
  test("parses valid JSON response", () => {
    const response = JSON.stringify({
      menu_name: "豚の生姜焼き",
      cuisine: "和",
      recipe_url: "https://www.kurashiru.com/recipes/xxx",
      ingredients: [{ name: "豚こま", amount: "300g" }],
      steps: ["step1", "step2"],
      estimated_pfc: { p: 25, f: 15, c: 20, kcal: 350 },
    });
    const result = parseMenuResponse(response);
    expect(result.menu_name).toBe("豚の生姜焼き");
    expect(result.cuisine).toBe("和");
    expect(result.ingredients).toHaveLength(1);
  });

  test("parses JSON wrapped in markdown code fence", () => {
    const response = "```json\n" + JSON.stringify({
      menu_name: "鮭の塩焼き",
      cuisine: "和",
      recipe_url: "https://example.com/a",
      ingredients: [],
      steps: [],
      estimated_pfc: { p: 30, f: 10, c: 5, kcal: 250 },
    }) + "\n```";
    const result = parseMenuResponse(response);
    expect(result.menu_name).toBe("鮭の塩焼き");
  });

  test("throws on invalid JSON", () => {
    expect(() => parseMenuResponse("not json")).toThrow();
  });

  test("throws when menu_name is missing", () => {
    const response = JSON.stringify({ cuisine: "和" });
    expect(() => parseMenuResponse(response)).toThrow(/menu_name/);
  });

  test("throws when cuisine is エスニック", () => {
    const response = JSON.stringify({
      menu_name: "パッタイ",
      cuisine: "エスニック",
      recipe_url: "https://example.com",
      ingredients: [],
      steps: [],
      estimated_pfc: { p: 20, f: 10, c: 30, kcal: 300 },
    });
    expect(() => parseMenuResponse(response)).toThrow(/エスニック/);
  });
});
EOF
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
bun test scripts/kondate/lib/generate-menu.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module './generate-menu'`。

- [ ] **Step 3: 実装を書く**

```bash
cat > scripts/kondate/lib/generate-menu.ts <<'EOF'
import { callLLM } from "../../lib/llm";
import type { Slot } from "./empty-slots";

export interface PastMeal {
  date: string;
  title: string;
}

export interface Ingredient {
  name: string;
  amount: string;
}

export interface MenuResult {
  menu_name: string;
  cuisine: "和" | "洋" | "中";
  recipe_url: string;
  ingredients: Ingredient[];
  steps: string[];
  estimated_pfc: { p: number; f: number; c: number; kcal: number };
}

export interface MenuContext {
  pastMeals: PastMeal[];
  historyMenus: string[];
  fridge: string;
  nutritionTargets: string;
  ngIngredients: string[];
  emptySlots: Slot[];
}

export function buildPrompt(ctx: MenuContext): string {
  const pastMealsList = ctx.pastMeals.length
    ? ctx.pastMeals.map((m) => `- ${m.date}: ${m.title}`).join("\n")
    : "(なし)";
  const historyList = ctx.historyMenus.length
    ? ctx.historyMenus.map((m) => `- ${m}`).join("\n")
    : "(なし)";
  const ngList = ctx.ngIngredients.join("、");
  const slotsList = ctx.emptySlots
    .slice(0, 3)
    .map((s) => `- ${s.date} ${s.mealType}`)
    .join("\n");

  return `あなたは家庭料理に詳しい chef と dietitian のハイブリッドです。以下の条件で作り置き向きメニュー1品を選んでください。

## 優先順位（厳守）
1. **美味しさ > 栄養バランス > 在庫消化**
2. 作り置きに向いていて1週間で飽きにくいこと
3. 冷蔵・常温で保存がきく（煮物・焼き魚・蒸し鶏・常備菜・煮込み 等）

## レシピソース（以下のいずれかから評価の高いものを 1 つ選ぶ）
- クラシル (https://www.kurashiru.com/)
- 白ごはん.com (https://www.sirogohan.com/)
- Nadia (https://oceans-nadia.com/)
- DELISH KITCHEN (https://delishkitchen.tv/)

## 菜系制約
- 和/洋/中 のいずれか
- **エスニック（タイ・ベトナム・インド・韓国 等）は除外・禁止**
- 過去14日に出た菜系に偏っていれば反対系を優先

## 過去14日に作った料理（重複回避）
${pastMealsList}

## 過去の自動生成履歴（完全同一メニューは避ける）
${historyList}

## 冷蔵庫の在庫
${ctx.fridge}

## 今週の栄養バランス（参考）
${ctx.nutritionTargets}

## 食べられない食材
${ngList}

## 登録先スロット（3食分、作り置き servings=3）
${slotsList}

## 出力フォーマット（JSON、コードフェンス内）
\`\`\`json
{
  "menu_name": "メニュー名",
  "cuisine": "和 または 洋 または 中",
  "recipe_url": "https://...",
  "ingredients": [{"name": "食材", "amount": "100g"}],
  "steps": ["手順1", "手順2"],
  "estimated_pfc": {"p": 30, "f": 15, "c": 20, "kcal": 350}
}
\`\`\`

上記以外の文章は出力しないでください。JSON のみ。`;
}

export function parseMenuResponse(raw: string): MenuResult {
  let jsonStr = raw.trim();
  // Strip markdown code fence if present
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonStr);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${(e as Error).message}\nraw: ${raw.slice(0, 200)}`);
  }

  const p = parsed as Partial<MenuResult>;
  if (!p.menu_name) throw new Error("Missing menu_name in response");
  if (!p.cuisine) throw new Error("Missing cuisine in response");
  const cuisineStr = p.cuisine as string;
  if (cuisineStr === "エスニック") {
    throw new Error("エスニック cuisine is not allowed");
  }
  if (!["和", "洋", "中"].includes(cuisineStr)) {
    throw new Error(`Invalid cuisine: ${cuisineStr}`);
  }
  if (!p.recipe_url) throw new Error("Missing recipe_url");
  if (!Array.isArray(p.ingredients)) throw new Error("ingredients must be an array");
  if (!Array.isArray(p.steps)) throw new Error("steps must be an array");
  if (!p.estimated_pfc) throw new Error("Missing estimated_pfc");

  return p as MenuResult;
}

export async function generateMenu(ctx: MenuContext): Promise<MenuResult> {
  const prompt = buildPrompt(ctx);
  const response = await callLLM([{ role: "user", content: prompt }], {
    model: "claude-opus-4-7",
    maxTokens: 2048,
  });
  return parseMenuResponse(response);
}
EOF
```

- [ ] **Step 4: テストが通ることを確認**

```bash
bun test scripts/kondate/lib/generate-menu.test.ts 2>&1 | tail -30
```

Expected: 全テスト pass（12 件）。失敗したら実装を調整。

- [ ] **Step 5: typecheck 確認**

```bash
bun run typecheck 2>&1 | tail -10
```

Expected: エラーなし。型エラーがあれば修正。

- [ ] **Step 6: commit**

```bash
git add scripts/kondate/lib/generate-menu.ts scripts/kondate/lib/generate-menu.test.ts
git commit -m "feat(kondate-auto): add menu generation via Claude API"
```

---

## Task 5: daily-writer.ts（daily ファイル書き込み）

**Files:**
- Create: `scripts/kondate/lib/daily-writer.ts`
- Create: `scripts/kondate/lib/daily-writer.test.ts`

仕様: `aspects/diet/daily/YYYY-MM-DD.md` が存在しなければ作成し、該当食事セクション（朝食 / 昼食 / 夕食）にメニュー・材料・PFC を追記する。既存セクションは上書きしない。

- [ ] **Step 1: 失敗するテストを書く**

```bash
cat > scripts/kondate/lib/daily-writer.test.ts <<'EOF'
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { appendDailyMealEntry, mealTypeToSection } from "./daily-writer";
import type { MenuResult } from "./generate-menu";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "daily-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const menu: MenuResult = {
  menu_name: "鶏むねハム",
  cuisine: "和",
  recipe_url: "https://example.com",
  ingredients: [
    { name: "鶏むね肉", amount: "300g" },
    { name: "塩", amount: "小さじ1" },
  ],
  steps: ["下味", "茹でる"],
  estimated_pfc: { p: 40, f: 8, c: 2, kcal: 220 },
};

describe("mealTypeToSection", () => {
  test("朝 → 朝食", () => {
    expect(mealTypeToSection("朝")).toBe("朝食");
  });
  test("昼 → 昼食", () => {
    expect(mealTypeToSection("昼")).toBe("昼食");
  });
  test("晩 → 夕食", () => {
    expect(mealTypeToSection("晩")).toBe("夕食");
  });
});

describe("appendDailyMealEntry", () => {
  test("creates new file with date header and meal section", () => {
    const path = join(tmp, "2026-04-24.md");
    appendDailyMealEntry({
      date: "2026-04-24",
      mealType: "晩",
      start: "19:00",
      end: "20:00",
      menu,
      baseDir: tmp,
    });
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("# 2026-04-24");
    expect(content).toContain("## 夕食 19:00-20:00");
    expect(content).toContain("鶏むねハム");
    expect(content).toContain("鶏むね肉 300g");
    expect(content).toContain("P: 40g");
  });

  test("appends new meal section to existing file", () => {
    const path = join(tmp, "2026-04-24.md");
    writeFileSync(path, "# 2026-04-24\n\n## 朝食 08:00-09:00\nオートミール\n- オートミール 40g\n");
    appendDailyMealEntry({
      date: "2026-04-24",
      mealType: "晩",
      start: "19:00",
      end: "20:00",
      menu,
      baseDir: tmp,
    });
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("## 朝食 08:00-09:00");
    expect(content).toContain("## 夕食 19:00-20:00");
    expect(content).toContain("鶏むねハム");
  });

  test("does not overwrite existing meal section", () => {
    const path = join(tmp, "2026-04-24.md");
    writeFileSync(
      path,
      "# 2026-04-24\n\n## 夕食 19:00-20:00\n外食\n- ラーメン\n",
    );
    appendDailyMealEntry({
      date: "2026-04-24",
      mealType: "晩",
      start: "19:00",
      end: "20:00",
      menu,
      baseDir: tmp,
    });
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("外食");
    expect(content).toContain("ラーメン");
    expect(content).not.toContain("鶏むねハム");
  });
});
EOF
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
bun test scripts/kondate/lib/daily-writer.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module './daily-writer'`。

- [ ] **Step 3: 実装を書く**

```bash
cat > scripts/kondate/lib/daily-writer.ts <<'EOF'
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { MealType } from "./empty-slots";
import type { MenuResult } from "./generate-menu";

const DEFAULT_BASE_DIR = "/workspaces/life/aspects/diet/daily";

export function mealTypeToSection(m: MealType): string {
  if (m === "朝") return "朝食";
  if (m === "昼") return "昼食";
  return "夕食";
}

export interface AppendParams {
  date: string;
  mealType: MealType;
  start: string;
  end: string;
  menu: MenuResult;
  baseDir?: string;
}

function renderMealSection(params: AppendParams): string {
  const { start, end, menu } = params;
  const section = mealTypeToSection(params.mealType);
  const header = `## ${section} ${start}-${end}`;
  const lines = [header, menu.menu_name];
  for (const ing of menu.ingredients) {
    lines.push(`- ${ing.name} ${ing.amount}`);
  }
  const { p, f, c, kcal } = menu.estimated_pfc;
  lines.push(`- ~${kcal} kcal | P: ${p}g | F: ${f}g | C: ${c}g`);
  return lines.join("\n");
}

export function appendDailyMealEntry(params: AppendParams): void {
  const baseDir = params.baseDir ?? DEFAULT_BASE_DIR;
  const path = join(baseDir, `${params.date}.md`);
  const section = mealTypeToSection(params.mealType);
  const sectionHeader = `## ${section} `;

  let content = existsSync(path)
    ? readFileSync(path, "utf-8")
    : `# ${params.date}\n\n`;

  // Check if section already exists
  if (content.includes(sectionHeader)) {
    return; // Do not overwrite
  }

  const block = renderMealSection(params);
  if (!content.endsWith("\n")) content += "\n";
  if (!content.endsWith("\n\n")) content += "\n";
  content += block + "\n";
  writeFileSync(path, content);
}
EOF
```

- [ ] **Step 4: テストが通ることを確認**

```bash
bun test scripts/kondate/lib/daily-writer.test.ts 2>&1 | tail -15
```

Expected: 全テスト pass（5 件）。

- [ ] **Step 5: commit**

```bash
git add scripts/kondate/lib/daily-writer.ts scripts/kondate/lib/daily-writer.test.ts
git commit -m "feat(kondate-auto): add daily file writer"
```

---

## Task 6: kondate-auto.ts（オーケストレーター）

**Files:**
- Create: `scripts/kondate/kondate-auto.ts`

このファイルはサイドエフェクトが多いので、Task 6 での実環境 dry-run 検証でカバーする（単体テストは書かない）。

- [ ] **Step 1: 実装を書く**

```bash
cat > scripts/kondate/kondate-auto.ts <<'EOF'
#!/usr/bin/env bun
/**
 * /kondate 自動化
 *
 * 毎朝 GitHub Actions から呼ばれる。今日〜3日後の meals エントリーが 2 件以下なら
 * 作り置きメニューを Claude API で生成し、Notion meals DB に登録する。
 *
 * 使い方:
 *   bun run scripts/kondate/kondate-auto.ts            # 本番実行
 *   bun run scripts/kondate/kondate-auto.ts --dry-run  # 登録せずログのみ
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

import {
  getScheduleDbConfig,
  queryDbByDateCached,
  normalizePages,
  todayJST,
  parseArgs,
} from "../notion/lib/notion";
import { computeEmptySlots, type ExistingEntry, type Slot } from "./lib/empty-slots";
import { readHistory, appendHistoryEntry } from "./lib/menu-history";
import { generateMenu, type MenuContext, type MenuResult, type PastMeal } from "./lib/generate-menu";
import { appendDailyMealEntry } from "./lib/daily-writer";

const REPO_ROOT = "/workspaces/life";
const DISABLE_FLAG = join(REPO_ROOT, ".kondate-auto.disabled");
const HISTORY_PATH = join(REPO_ROOT, "aspects/diet/kondate-history.md");
const FRIDGE_PATH = join(REPO_ROOT, "aspects/diet/fridge.md");
const NUTRITION_PATH = join(REPO_ROOT, "aspects/diet/nutrition-targets.md");
const HEALTH_PATH = join(REPO_ROOT, "profile/health.md");

const NG_INGREDIENTS = ["トマト", "マヨネーズ", "ケチャップ", "マスタード"];
const WINDOW_DAYS = 3;
const ENTRY_THRESHOLD = 3; // 3件以上でスキップ
const SERVINGS = 3;

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function readOrEmpty(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

async function fetchMealsRange(startDate: string, endDate: string) {
  const { apiKey, dbId, config } = getScheduleDbConfig("meals");
  const data = await queryDbByDateCached(apiKey, dbId, config, startDate, endDate);
  return normalizePages(data.results, config, "meals");
}

function extractStartTime(iso: string | undefined): string {
  if (!iso || !iso.includes("T")) return "";
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function runNotionAdd(args: {
  title: string;
  date: string;
  start: string;
  end: string;
  servings: number;
  dryRun: boolean;
}): { pageId?: string; url?: string } {
  const cmd = [
    "bun",
    "run",
    "scripts/notion/notion-add.ts",
    "--db",
    "meals",
    "--title",
    args.title,
    "--date",
    args.date,
    "--start",
    args.start,
    "--end",
    args.end,
    "--servings",
    String(args.servings),
  ];
  if (args.dryRun) {
    console.log(`[dry-run] would run: ${cmd.join(" ")}`);
    return {};
  }
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`notion-add failed: ${result.stderr || result.stdout}`);
  }
  const pageIdMatch = /page.*id[:\s]+([a-f0-9-]{36})/i.exec(result.stdout);
  const urlMatch = /(https:\/\/(?:www\.)?notion\.so\/[^\s]+)/.exec(result.stdout);
  return {
    pageId: pageIdMatch?.[1],
    url: urlMatch?.[1],
  };
}

async function main() {
  const { flags } = parseArgs();
  const dryRun = flags.has("dry-run");

  // 0. Disable switch
  if (existsSync(DISABLE_FLAG)) {
    console.log("[skip] .kondate-auto.disabled exists");
    return;
  }

  const today = todayJST();
  const endDate = addDays(today, WINDOW_DAYS - 1);

  // 1. Trigger check
  const existing = await fetchMealsRange(today, endDate);
  console.log(`[check] ${today}..${endDate}: ${existing.length} entries`);
  if (existing.length >= ENTRY_THRESHOLD) {
    console.log(`[skip] ${existing.length} >= ${ENTRY_THRESHOLD} entries`);
    return;
  }

  // 2. Compute empty slots
  const existingEntries: ExistingEntry[] = existing.map((e) => ({
    date: e.start.slice(0, 10),
    startTime: extractStartTime(e.start),
  }));
  const emptySlots = computeEmptySlots(today, WINDOW_DAYS, existingEntries);
  if (emptySlots.length === 0) {
    console.log("[skip] no empty slots");
    return;
  }
  const targetSlots = emptySlots.slice(0, Math.min(SERVINGS, emptySlots.length));
  console.log(`[slots] filling ${targetSlots.length} slots:`, targetSlots);

  // 3. Gather context
  const past14Start = addDays(today, -14);
  const past14End = addDays(today, -1);
  const pastMealsData = await fetchMealsRange(past14Start, past14End);
  const pastMeals: PastMeal[] = pastMealsData.map((m) => ({
    date: m.start.slice(0, 10),
    title: m.title,
  }));
  const history = readHistory(HISTORY_PATH);
  const historyMenus = history.map((h) => h.menu);

  const ctx: MenuContext = {
    pastMeals,
    historyMenus,
    fridge: readOrEmpty(FRIDGE_PATH),
    nutritionTargets: readOrEmpty(NUTRITION_PATH),
    ngIngredients: NG_INGREDIENTS,
    emptySlots: targetSlots,
  };

  // 4. Generate menu
  console.log("[generate] calling Claude API...");
  const menu = await generateMenu(ctx);
  console.log(`[generated] ${menu.menu_name} (${menu.cuisine}) → ${menu.recipe_url}`);

  if (dryRun) {
    console.log("[dry-run] skipping Notion registration and history update");
    return;
  }

  // 5. Idempotency re-check
  const recheck = await fetchMealsRange(today, endDate);
  if (recheck.length >= ENTRY_THRESHOLD) {
    console.log(`[skip] re-check: ${recheck.length} >= ${ENTRY_THRESHOLD} (race)`);
    return;
  }

  // 6. Register in Notion + daily file (N servings across slots)
  const results: Array<{ slot: Slot; url?: string }> = [];
  for (const slot of targetSlots) {
    const r = runNotionAdd({
      title: menu.menu_name,
      date: slot.date,
      start: slot.start,
      end: slot.end,
      servings: SERVINGS,
      dryRun: false,
    });
    results.push({ slot, url: r.url });
    appendDailyMealEntry({
      date: slot.date,
      mealType: slot.mealType,
      start: slot.start,
      end: slot.end,
      menu,
    });
  }

  // 7. Append history (first URL as representative)
  const repUrl = results.find((r) => r.url)?.url ?? "";
  appendHistoryEntry(HISTORY_PATH, {
    date: today,
    menu: menu.menu_name,
    url: repUrl,
    cuisine: menu.cuisine,
  });

  console.log(`[done] registered ${results.length} entries`);
}

main().catch((e) => {
  console.error("[error]", e);
  process.exit(1);
});
EOF
```

- [ ] **Step 2: typecheck**

```bash
bun run typecheck 2>&1 | tail -10
```

Expected: エラーなし。あれば修正。

- [ ] **Step 3: dry-run 実行（Notion トークンなしでも動く箇所まで）**

```bash
bun run scripts/kondate/kondate-auto.ts --dry-run 2>&1 | tail -30
```

Expected: 以下いずれかのメッセージ
- `[skip] ... entries`（今日〜3日後に既にエントリーあり）
- `[generate] calling Claude API...` → `[generated] XXX` → `[dry-run] skipping ...`

失敗時は Notion API 認証エラー or Claude API 認証エラーが想定されるので、エラーメッセージを確認し、必要なら `.env.local` に API キーが設定されているか確認する。

- [ ] **Step 4: commit**

```bash
git add scripts/kondate/kondate-auto.ts
git commit -m "feat(kondate-auto): add main orchestrator script"
```

---

## Task 7: E2E dry-run 検証（強制実行）

**目的:** 既にエントリーがあって skip されるケースでも、メニュー生成ロジックの動作確認は必要。一時的に閾値を下げて動作確認する。

- [ ] **Step 1: 閾値を一時的に 999 に上げて強制実行**

```bash
# 一時的に ENTRY_THRESHOLD を書き換える（あとで戻す）
sed -i 's/const ENTRY_THRESHOLD = 3;/const ENTRY_THRESHOLD = 999;/' scripts/kondate/kondate-auto.ts
bun run scripts/kondate/kondate-auto.ts --dry-run 2>&1 | tee /tmp/kondate-dryrun.log
# 戻す
sed -i 's/const ENTRY_THRESHOLD = 999;/const ENTRY_THRESHOLD = 3;/' scripts/kondate/kondate-auto.ts
```

Expected output に以下が含まれる:
- `[check] ... entries`
- `[slots] filling N slots:`
- `[generate] calling Claude API...`
- `[generated] <メニュー名> (和|洋|中) → <URL>`
- `[dry-run] skipping Notion registration and history update`

- [ ] **Step 2: 生成されたメニューが妥当か目視確認**

```bash
grep -E "\[generated\]" /tmp/kondate-dryrun.log
```

チェック:
- メニュー名が日本語
- cuisine が 和/洋/中 のいずれか（エスニックでないこと）
- recipe_url が kurashiru/sirogohan/oceans-nadia/delishkitchen のいずれか

問題があれば `buildPrompt` を調整して再実行。

- [ ] **Step 3: 変更がないことを確認**

```bash
git status
git diff scripts/kondate/kondate-auto.ts
```

Expected: 変更なし（sed で書き換えて戻した）。

- [ ] **Step 4: (コミットなし、Task 7 は検証のみ)**

---

## Task 8: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/kondate-auto.yml`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: workflow ファイル作成**

```bash
cat > .github/workflows/kondate-auto.yml <<'EOF'
name: kondate-auto

on:
  schedule:
    # 毎日 JST 03:00 = UTC 18:00（前日）
    - cron: "0 18 * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run (no Notion write, no PR)"
        type: boolean
        default: false

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    env:
      TZ: Asia/Tokyo
      NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
      NOTION_MEALS_DB: ${{ secrets.NOTION_MEALS_DB }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Configure git
        run: |
          git config user.name "kondate-auto[bot]"
          git config user.email "kondate-auto@users.noreply.github.com"

      - name: Check disable flag
        id: check_disable
        run: |
          if [ -f .kondate-auto.disabled ]; then
            echo "disabled=true" >> $GITHUB_OUTPUT
          else
            echo "disabled=false" >> $GITHUB_OUTPUT
          fi

      - name: Run kondate-auto
        if: steps.check_disable.outputs.disabled != 'true'
        id: run
        run: |
          BRANCH="chore/kondate-auto-$(TZ=Asia/Tokyo date +%Y-%m-%d)"
          echo "branch=$BRANCH" >> $GITHUB_OUTPUT

          if [ "${{ inputs.dry_run }}" = "true" ]; then
            bun run scripts/kondate/kondate-auto.ts --dry-run
          else
            git checkout -b "$BRANCH"
            bun run scripts/kondate/kondate-auto.ts
          fi

      - name: Check for changes
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true
        id: changes
        run: |
          if git diff --quiet && git diff --cached --quiet; then
            echo "has_changes=false" >> $GITHUB_OUTPUT
          else
            echo "has_changes=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit, push, create and merge PR
        if: steps.check_disable.outputs.disabled != 'true' && inputs.dry_run != true && steps.changes.outputs.has_changes == 'true'
        run: |
          BRANCH="${{ steps.run.outputs.branch }}"
          TODAY=$(TZ=Asia/Tokyo date +%m/%d)
          END=$(TZ=Asia/Tokyo date -d '+2 days' +%m/%d)
          git add aspects/diet/kondate-history.md aspects/diet/daily/ 2>/dev/null || true
          git commit -m "chore(kondate-auto): auto-generate meals for $TODAY..$END

          Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
          git push -u origin "$BRANCH"

          PR_URL=$(gh pr create \
            --title "chore(kondate-auto): auto-generate meals for $TODAY..$END" \
            --body "自動生成された作り置きメニューを登録しました。" \
            --base main \
            --head "$BRANCH" 2>&1 | tail -1)

          # Fallback: gh api if gh pr create failed
          if ! echo "$PR_URL" | grep -q "^https://"; then
            PR_URL=$(gh api repos/${{ github.repository }}/pulls \
              --method POST \
              --field title="chore(kondate-auto): auto-generate meals for $TODAY..$END" \
              --field head="$BRANCH" \
              --field base="main" \
              --field body="自動生成された作り置きメニューを登録しました。" \
              --jq '.html_url')
          fi

          PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
          gh api repos/${{ github.repository }}/pulls/$PR_NUMBER/merge \
            --method PUT --field merge_method=squash
EOF
```

- [ ] **Step 3: YAML 構文チェック**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/kondate-auto.yml'))" && echo "OK"
```

Expected: `OK`。失敗したら YAML の構文を修正。

- [ ] **Step 4: commit**

```bash
git add .github/workflows/kondate-auto.yml
git commit -m "feat(kondate-auto): add GitHub Actions workflow"
```

---

## Task 9: PR 作成 & merge

- [ ] **Step 1: 全テストが通ることを確認**

```bash
bun test scripts/kondate/ 2>&1 | tail -15
bun run typecheck 2>&1 | tail -10
```

Expected: 全テスト pass、typecheck エラーなし。

- [ ] **Step 2: push**

```bash
git push -u origin feat/kondate-auto
```

- [ ] **Step 3: PR 作成**

```bash
gh pr create \
  --title "feat(kondate-auto): 献立自動生成の cron ジョブ" \
  --body "$(cat <<'BODY'
## Summary
- 毎日 JST 03:00 に Notion meals DB を確認し、今日〜3日後のエントリーが 2 件以下なら作り置きメニューを Claude API で自動生成
- 生成結果を Notion meals DB + `aspects/diet/kondate-history.md` に登録し、自動 PR でマージ
- エスニック除外、過去14日の重複回避、履歴ベースの単調化防止
- 無効化スイッチ: `.kondate-auto.disabled` ファイル作成で no-op

## Spec
docs/superpowers/specs/2026-04-24-kondate-auto-design.md

## Test plan
- [ ] `bun test scripts/kondate/` で全テスト pass
- [ ] `bun run scripts/kondate/kondate-auto.ts --dry-run` で Claude API が呼ばれメニューが生成される
- [ ] GitHub Actions workflow_dispatch で dry_run=true を実行し、ログ確認
- [ ] 本番 cron 稼働後、翌朝 meals DB にエントリーが追加され PR がマージされているか確認

## Secrets 要追加
- `NOTION_API_KEY`
- `NOTION_MEALS_DB`
- `ANTHROPIC_API_KEY`
BODY
)"
```

失敗した場合は `scripts/create-pr.ts` のフォールバックを使う。

- [ ] **Step 4: マージ**

PR 番号を控えて:

```bash
PR_NUM=<pr番号>
gh api repos/kokiebisu/life/pulls/$PR_NUM/merge --method PUT --field merge_method=squash
```

- [ ] **Step 5: main に戻って worktree 削除**

```bash
cd /workspaces/life
git worktree remove .worktrees/feat/kondate-auto --force
git branch -D feat/kondate-auto 2>/dev/null || true
rm /workspaces/life/docs/superpowers/plans/2026-04-24-kondate-auto.md 2>/dev/null; true
git pull origin main
git stash pop 2>&1 || echo "no stash to pop"
```

Expected: worktree 削除、main が最新、元の unstaged changes が復元。

---

## Task 10: GitHub Secrets 確認（手動）

> このタスクは GitHub UI で実行するため、このセッションではスキップ。ユーザーに依頼。

- [ ] **Step 1: GitHub Secrets に以下が設定されているか確認（ユーザー作業）**
  - `NOTION_API_KEY`
  - `NOTION_MEALS_DB`
  - `ANTHROPIC_API_KEY`

- [ ] **Step 2: workflow_dispatch で dry-run 実行**

GitHub Actions UI → kondate-auto → Run workflow → dry_run: true → 実行

ログで `[generated] ...` メッセージが出れば成功。

- [ ] **Step 3: 翌朝 03:00 JST の本番実行を待って結果を確認**

Notion meals DB に3エントリーが追加され、`chore/kondate-auto-YYYY-MM-DD` ブランチの PR が自動マージされていれば成功。
