# Life OS Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the personal `life` repo into a distributable `life-os` GitHub Template with a Manifest-driven aspect plugin system, enabling any user to fork, run `bun run setup`, and have a fully configured personal OS in minutes.

**Architecture:** Two-repo model — `life-os` is a public GitHub Template with universal aspects (diet, gym, study) plus infrastructure; `life` becomes a personal fork that adds private aspects (church, devotions, guitar, etc.) and pulls improvements from upstream. Each aspect declares its Notion databases via `aspect.json`; the `setup.ts` wizard reads these manifests to provision all databases automatically.

**Tech Stack:** TypeScript, Bun, Notion API, Claude Code CLI, devcontainer, GitHub CLI

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `aspects/gym/aspect.json` | Gym aspect manifest (Notion DB declarations) |
| `aspects/gym/CLAUDE.md` | Gym aspect instructions for Claude |
| `aspects/gym/profile.md` | Template: gym membership info |
| `aspects/gym/gyms/fitplace/minatomirai.md` | Personal: FIT PLACE24 machine list |
| `aspects/gym/logs/.gitkeep` | Placeholder for workout logs |
| `aspects/goal.md` | Shared goal file (moved from diet) — templated |
| `aspects/diet/aspect.json` | Diet aspect manifest |
| `aspects/study/aspect.json` | Study aspect manifest |
| `scripts/setup.ts` | Interactive setup wizard |
| `scripts/lib/setup-helpers.ts` | Notion DB creation helpers |
| `scripts/setup.test.ts` | Tests for setup helpers |
| `life.config.example.json` | Reference config committed to repo |

### Modified
| File | Change |
|------|--------|
| `.claude/skills/gym/SKILL.md` | Update 5x `aspects/diet/gym-logs/` → `aspects/gym/logs/` |
| `aspects/diet/CLAUDE.md` | Update directory table: `gym-logs/` row removed |
| `.gitignore` | Add `life.config.json`, `aspects/*/CLAUDE.local.md` |
| `package.json` | Add `"setup": "bun run scripts/setup.ts"` to scripts |

### Moved
| From | To |
|------|-----|
| `aspects/diet/gym-logs/*.md` | `aspects/gym/logs/*.md` |
| `aspects/diet/goal.md` | `aspects/goal.md` |

### Deleted
| File | Reason |
|------|--------|
| `aspects/diet/gym-menu.md` | Replaced by dynamic generation from logs + gym profile |

### Templated (personal data removed)
| File | Action |
|------|--------|
| `aspects/goal.md` | Remove 63kg/58kg numbers, replace with TODO placeholders |
| `aspects/gym/gyms/fitplace/minatomirai.md` | Personal data — stays in `life`, excluded from `life-os` push |

---

## Task 1: Move Gym Files

**Files:**
- Modify: `.claude/skills/gym/SKILL.md`
- Modify: `aspects/diet/CLAUDE.md`
- Create: `aspects/gym/logs/.gitkeep`
- Delete: `aspects/diet/gym-menu.md`
- Move: `aspects/diet/gym-logs/*.md` → `aspects/gym/logs/`
- Move: `aspects/diet/goal.md` → `aspects/goal.md`

- [ ] **Step 1: Create `aspects/gym/` directory structure**

```bash
mkdir -p aspects/gym/logs aspects/gym/gyms/fitplace
touch aspects/gym/logs/.gitkeep
touch aspects/gym/gyms/.gitkeep
```

- [ ] **Step 2: Move gym logs**

```bash
# Move all existing log files
for f in aspects/diet/gym-logs/*.md; do
  [ -f "$f" ] && git mv "$f" aspects/gym/logs/
done
# Remove now-empty directory
rmdir aspects/diet/gym-logs 2>/dev/null || true
```

Expected: `git status` shows renames from `aspects/diet/gym-logs/` to `aspects/gym/logs/`

- [ ] **Step 3: Move goal.md**

```bash
git mv aspects/diet/goal.md aspects/goal.md
```

- [ ] **Step 4: Extract machine list from `gym-menu.md` BEFORE deleting it**

Read `aspects/diet/gym-menu.md` and copy the content under `## 利用可能なマシン一覧（FIT PLACE24 みなとみらい）` into `aspects/gym/gyms/fitplace/minatomirai.md` (created in Task 2 Step 2). This must happen BEFORE Step 5 deletes the source file.

- [ ] **Step 5: Delete gym-menu.md**

```bash
git rm aspects/diet/gym-menu.md
```

- [ ] **Step 6: Update path references in `gym/SKILL.md`**

Open `.claude/skills/gym/SKILL.md` and replace ALL occurrences of `aspects/diet/gym-logs/` with `aspects/gym/logs/`.

Affected lines (5 total): 60, 80, 152, 155, 232.

Verify with:
```bash
grep -n "diet/gym-logs" .claude/skills/gym/SKILL.md
```
Expected: no output (all replaced)

- [ ] **Step 7: Update directory table in `diet/CLAUDE.md`**

In `aspects/diet/CLAUDE.md`, find the directory table row:
```
| `gym-logs/YYYY-MM-DD.md` | ジムセッションの実績ログ |
```
Delete this row entirely (gym logs are now managed by the `gym` aspect, not diet).

- [ ] **Step 8: Verify no remaining references to old path**

```bash
grep -r "diet/gym-logs" . --include="*.md" --include="*.ts"
```
Expected: only the spec/plan docs (OK to ignore those)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract gym aspect from diet (move logs, goal, delete gym-menu)"
```

---

## Task 2: Create `aspects/gym/` Content Files

**Files:**
- Create: `aspects/gym/profile.md`
- Create: `aspects/gym/gyms/fitplace/minatomirai.md`
- Create: `aspects/gym/CLAUDE.md`

- [ ] **Step 1: Create `aspects/gym/profile.md` (template for `life-os`)**

```markdown
# Gym Profile

## Membership

| Field | Value |
|-------|-------|
| Gym | <!-- TODO: e.g. FIT PLACE24 みなとみらい --> |
| Location | <!-- TODO: address or nearest station --> |
| Hours | <!-- TODO: e.g. 24h --> |
| Joined | <!-- TODO: YYYY-MM-DD --> |

## Goals

<!-- TODO: describe your gym goals, e.g. strength, weight loss, endurance -->

## Notes

<!-- TODO: injuries, constraints, preferences -->
```

- [ ] **Step 2: Create `aspects/gym/gyms/fitplace/minatomirai.md` (personal data for `life`)**

Create this file with the machine list content extracted in Task 1 Step 4. Use heading `# FIT PLACE24 みなとみらい — マシン一覧` and paste the content copied from `aspects/diet/gym-menu.md`.

(This file is personal and will NOT be pushed to `life-os`. It stays in `life` only.)

- [ ] **Step 3: Create `aspects/gym/CLAUDE.md`**

```markdown
# Gym Aspect

このディレクトリはジムセッションの記録と管理を担当します。

## ディレクトリ構成

| パス | 内容 |
|------|------|
| `logs/YYYY-MM-DD.md` | ジムセッション実績ログ |
| `gyms/<chain>/<location>.md` | ジムのマシン一覧・設備情報 |
| `profile.md` | ジム会員情報・個人目標 |
| `../goal.md` | 共有目標（diet と gym が参照） |

## メニュー生成

静的なメニューファイルは持たない。`/gym plan` 実行時に以下を動的参照してメニューを決定する:

1. `logs/` の直近3日のログ → 前回の種目・重量・フィードバック
2. `gyms/<location>.md` → 利用可能なマシン一覧
3. `../goal.md` → 現在の目標（重量・体組成）

## ログフォーマット

`logs/YYYY-MM-DD.md`:

```markdown
# ジムログ YYYY-MM-DD

## 種目名
- 重量: Xkg × Y回 × Zセット

メモ: （体感メモ）
```

詳細な操作手順は `.claude/skills/gym/SKILL.md` を参照。
```

- [ ] **Step 4: Commit**

```bash
git add aspects/gym/
git commit -m "feat: add aspects/gym content files (profile, CLAUDE.md, minatomirai machine list)"
```

---

## Task 3: Aspect Manifests

**Files:**
- Create: `aspects/diet/aspect.json`
- Create: `aspects/gym/aspect.json`
- Create: `aspects/study/aspect.json`

These manifests are read by `scripts/setup.ts` to know which Notion DBs to create for each aspect.

- [ ] **Step 1: Create `aspects/diet/aspect.json`**

```json
{
  "name": "diet",
  "description": "食事・冷蔵庫・買い出し管理",
  "notion": {
    "databases": [
      {
        "envKey": "NOTION_MEALS_DB",
        "displayName": "食事",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      },
      {
        "envKey": "NOTION_GROCERIES_DB",
        "displayName": "買い出し",
        "schema": {
          "件名": "title",
          "日付": "date"
        }
      },
      {
        "envKey": "NOTION_OTHER_DB",
        "displayName": "その他（活動記録）",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      }
    ]
  },
  "commands": ["meal", "kondate", "fridge-sync"],
  "postSetupNotes": [
    "Notion の「食事」DB に「カロリー (number)」「フィードバック (select)」プロパティを手動で追加してください"
  ]
}
```

- [ ] **Step 2: Create `aspects/gym/aspect.json`**

```json
{
  "name": "gym",
  "description": "ジムログ・ワークアウト管理",
  "notion": {
    "databases": [
      {
        "envKey": "NOTION_GYM_DB",
        "displayName": "ジム",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      }
    ]
  },
  "commands": ["gym"],
  "postSetupNotes": [
    "Notion の「ジム」DB に「種目 (select)」「重量 (number)」「セット数 (number)」「回数 (number)」「フィードバック (text)」プロパティを手動で追加してください"
  ]
}
```

- [ ] **Step 3: Create `aspects/study/aspect.json`**

```json
{
  "name": "study",
  "description": "学習セッション・ノート管理",
  "notion": {
    "databases": [
      {
        "envKey": "NOTION_STUDY_DB",
        "displayName": "学習",
        "schema": {
          "名前": "title",
          "日付": "date"
        }
      }
    ]
  },
  "commands": ["study"],
  "postSetupNotes": [
    "Notion の「学習」DB に「カテゴリ (select)」「本 (text)」「Chapter (number)」プロパティを手動で追加してください"
  ]
}
```

- [ ] **Step 4: Validate all manifests are valid JSON**

```bash
bun -e "
  const files = ['aspects/diet/aspect.json', 'aspects/gym/aspect.json', 'aspects/study/aspect.json']
  for (const f of files) {
    const data = JSON.parse(require('fs').readFileSync(f, 'utf-8'))
    console.log('✅', f, '— name:', data.name, 'dbs:', data.notion.databases.length)
  }
"
```

Expected output:
```
✅ aspects/diet/aspect.json — name: diet dbs: 3
✅ aspects/gym/aspect.json — name: gym dbs: 1
✅ aspects/study/aspect.json — name: study dbs: 1
```

- [ ] **Step 5: Commit**

```bash
git add aspects/diet/aspect.json aspects/gym/aspect.json aspects/study/aspect.json
git commit -m "feat: add aspect.json manifests for diet, gym, study"
```

---

## Task 4: Setup Script — Helpers (TDD)

**Files:**
- Create: `scripts/lib/setup-helpers.ts`
- Create: `scripts/setup.test.ts`

This task builds and tests the core logic of the setup wizard: loading manifests and generating output files. Notion API calls are mocked in tests.

- [ ] **Step 1: Write the failing tests**

Create `scripts/setup.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  loadAspectManifests,
  generateEnvLocal,
  generateLifeConfig,
} from "./lib/setup-helpers";

const TMP = join(import.meta.dir, "../.test-tmp");

beforeEach(() => {
  mkdirSync(join(TMP, "aspects/diet"), { recursive: true });
  mkdirSync(join(TMP, "aspects/gym"), { recursive: true });
  writeFileSync(
    join(TMP, "aspects/diet/aspect.json"),
    JSON.stringify({
      name: "diet",
      description: "食事管理",
      notion: {
        databases: [
          { envKey: "NOTION_MEALS_DB", displayName: "食事", schema: { 名前: "title", 日付: "date" } },
        ],
      },
      commands: ["meal"],
      postSetupNotes: [],
    })
  );
  writeFileSync(
    join(TMP, "aspects/gym/aspect.json"),
    JSON.stringify({
      name: "gym",
      description: "ジムログ",
      notion: {
        databases: [
          { envKey: "NOTION_GYM_DB", displayName: "ジム", schema: { 名前: "title", 日付: "date" } },
        ],
      },
      commands: ["gym"],
      postSetupNotes: ["Notion に種目プロパティを追加してください"],
    })
  );
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("loadAspectManifests", () => {
  test("loads manifests from aspects/ directory", async () => {
    const manifests = await loadAspectManifests(TMP);
    expect(manifests).toHaveLength(2);
    expect(manifests.map((m) => m.name).sort()).toEqual(["diet", "gym"]);
  });

  test("returns only aspects with aspect.json", async () => {
    // aspects/study exists but has no aspect.json
    mkdirSync(join(TMP, "aspects/study"), { recursive: true });
    const manifests = await loadAspectManifests(TMP);
    expect(manifests).toHaveLength(2); // still 2, not 3
  });
});

describe("generateEnvLocal", () => {
  test("generates .env.local content from DB map", () => {
    const dbMap = {
      NOTION_MEALS_DB: "abc-123",
      NOTION_GYM_DB: "def-456",
    };
    const result = generateEnvLocal("secret_token_xyz", dbMap);
    expect(result).toContain("NOTION_API_KEY=secret_token_xyz");
    expect(result).toContain("NOTION_MEALS_DB=abc-123");
    expect(result).toContain("NOTION_GYM_DB=def-456");
  });

  test("each entry is on its own line", () => {
    const result = generateEnvLocal("tok", { A: "1", B: "2" });
    const lines = result.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generateLifeConfig", () => {
  test("generates config with selected aspects enabled", () => {
    const result = generateLifeConfig(["diet", "gym"], {
      name: "Koki",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    const parsed = JSON.parse(result);
    expect(parsed.aspects.diet).toBe(true);
    expect(parsed.aspects.gym).toBe(true);
  });

  test("aspects not in selection are false", () => {
    const result = generateLifeConfig(["diet"], {
      name: "",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    const parsed = JSON.parse(result);
    expect(parsed.aspects.gym).toBe(false);
  });

  test("includes user config", () => {
    const result = generateLifeConfig([], {
      name: "Alice",
      timezone: "America/New_York",
      language: "en",
    });
    const parsed = JSON.parse(result);
    expect(parsed.user.name).toBe("Alice");
    expect(parsed.user.timezone).toBe("America/New_York");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test scripts/setup.test.ts
```

Expected: FAIL — `Cannot find module './lib/setup-helpers'`

- [ ] **Step 3: Implement `scripts/lib/setup-helpers.ts`**

```typescript
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AspectDatabase {
  envKey: string;
  displayName: string;
  schema: Record<string, string>;
}

export interface AspectManifest {
  name: string;
  description: string;
  notion: { databases: AspectDatabase[] };
  commands: string[];
  postSetupNotes: string[];
}

export async function loadAspectManifests(rootDir: string): Promise<AspectManifest[]> {
  const aspectsDir = join(rootDir, "aspects");
  const entries = readdirSync(aspectsDir, { withFileTypes: true });
  const manifests: AspectManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(aspectsDir, entry.name, "aspect.json");
    if (!existsSync(manifestPath)) continue;
    const data = JSON.parse(readFileSync(manifestPath, "utf-8")) as AspectManifest;
    manifests.push(data);
  }
  return manifests;
}

export function generateEnvLocal(
  apiKey: string,
  dbMap: Record<string, string>
): string {
  const lines = [`NOTION_API_KEY=${apiKey}`];
  for (const [key, id] of Object.entries(dbMap)) {
    lines.push(`${key}=${id}`);
  }
  return lines.join("\n") + "\n";
}

export function generateLifeConfig(
  selectedAspects: string[],
  user: { name: string; timezone: string; language: string }
): string {
  // Collect all known aspect names from the selection + hardcoded universe
  const allAspects = ["diet", "gym", "study", "daily", "events"];
  const aspects: Record<string, boolean> = {};
  for (const name of allAspects) {
    aspects[name] = selectedAspects.includes(name);
  }
  // Also include any selected aspects not in the hardcoded list
  for (const name of selectedAspects) {
    aspects[name] = true;
  }
  return JSON.stringify({ aspects, user }, null, 2) + "\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test scripts/setup.test.ts
```

Expected:
```
✓ loadAspectManifests > loads manifests from aspects/ directory
✓ loadAspectManifests > returns only aspects with aspect.json
✓ generateEnvLocal > generates .env.local content from DB map
✓ generateEnvLocal > each entry is on its own line
✓ generateLifeConfig > generates config with selected aspects enabled
✓ generateLifeConfig > aspects not in selection are false
✓ generateLifeConfig > includes user config

7 pass, 0 fail
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/setup-helpers.ts scripts/setup.test.ts
git commit -m "feat: add setup helpers with tests (manifest loading, env/config generation)"
```

---

## Task 5: Setup Script — Main Wizard

**Files:**
- Create: `scripts/setup.ts`
- Modify: `package.json`

This is the interactive CLI. It uses `setup-helpers.ts` for pure logic and calls the Notion API directly for DB creation.

- [ ] **Step 1: Create `scripts/setup.ts`**

```typescript
#!/usr/bin/env bun
/**
 * Life OS setup wizard.
 * Usage: bun run setup
 *
 * Guides a new user through:
 * 1. Notion API token entry + validation
 * 2. Aspect selection
 * 3. Notion DB creation
 * 4. .env.local + life.config.json generation
 */

import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { loadAspectManifests, generateEnvLocal, generateLifeConfig } from "./lib/setup-helpers";
import type { AspectManifest } from "./lib/setup-helpers";

const ROOT = join(import.meta.dir, "..");
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// ── helpers ──────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function notionRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error (${res.status}): ${err}`);
  }
  return res.json();
}

async function validateToken(apiKey: string): Promise<boolean> {
  try {
    await notionRequest("GET", "/users/me", apiKey);
    return true;
  } catch {
    return false;
  }
}

async function createNotionPage(apiKey: string, title: string): Promise<string> {
  const res = await notionRequest("POST", "/pages", apiKey, {
    parent: { type: "workspace", workspace: true },
    properties: {
      title: { title: [{ type: "text", text: { content: title } }] },
    },
  }) as { id: string };
  return res.id;
}

async function createNotionDatabase(
  apiKey: string,
  parentPageId: string,
  displayName: string,
  schema: Record<string, string>
): Promise<string> {
  const properties: Record<string, unknown> = {};
  for (const [colName, colType] of Object.entries(schema)) {
    if (colType === "title") {
      properties[colName] = { title: {} };
    } else if (colType === "date") {
      properties[colName] = { date: {} };
    }
  }
  const res = await notionRequest("POST", "/databases", apiKey, {
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: displayName } }],
    properties,
  }) as { id: string };
  return res.id;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Life OS セットアップ\n");

  // Guard: already set up?
  if (existsSync(join(ROOT, ".env.local"))) {
    const overwrite = await prompt("⚠️  .env.local がすでに存在します。上書きしますか？ [y/N]: ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("セットアップを中止しました。");
      process.exit(0);
    }
  }

  // Step 1: Notion API token
  const apiKey = await prompt("? Notion API トークンを入力してください (secret_...): ");
  if (!apiKey.startsWith("secret_")) {
    console.error("❌ トークンは secret_ で始まる必要があります。");
    process.exit(1);
  }
  process.stdout.write("  トークンを確認中...");
  const valid = await validateToken(apiKey);
  if (!valid) {
    console.error("\n❌ トークンが無効です。Notion の Integration ページで確認してください。");
    process.exit(1);
  }
  console.log(" ✅");

  // Step 2: Parent page
  console.log('\n? DB の親ページを指定してください');
  const parentInput = await prompt('  (Notion ページ URL を貼るか、Enter で "Life OS" ページを自動作成): ');
  let parentPageId: string;
  if (!parentInput) {
    process.stdout.write('  "Life OS" ページを作成中...');
    parentPageId = await createNotionPage(apiKey, "Life OS");
    console.log(` ✅ (id: ${parentPageId})`);
  } else {
    // Extract page ID from URL: https://notion.so/xxx-<id> or raw ID
    const match = parentInput.match(/([a-f0-9]{32}|[a-f0-9-]{36})(?:\?|$)/);
    if (!match) {
      console.error("❌ ページ URL からIDを抽出できませんでした。");
      process.exit(1);
    }
    parentPageId = match[1];
    console.log(`  ✅ 親ページID: ${parentPageId}`);
  }

  // Step 3: Aspect selection
  const allManifests = await loadAspectManifests(ROOT);
  console.log("\n? 使用する aspects を選択してください:");
  const selected: AspectManifest[] = [];
  for (const manifest of allManifests) {
    const answer = await prompt(`  ${manifest.name.padEnd(10)} — ${manifest.description} [Y/n]: `);
    if (answer.toLowerCase() !== "n") {
      selected.push(manifest);
      console.log(`  ✅ ${manifest.name}`);
    } else {
      console.log(`  ❌ ${manifest.name}`);
    }
  }

  // Step 4: User config
  const userName = await prompt("\n? あなたの名前: ");
  const tzAnswer = await prompt("? タイムゾーン [Asia/Tokyo]: ");
  const timezone = tzAnswer || "Asia/Tokyo";
  const langAnswer = await prompt("? 言語設定 [ja]: ");
  const language = langAnswer || "ja";

  // Step 5: Create Notion DBs
  console.log("\n📦 Notion DB を作成中...");
  const dbMap: Record<string, string> = {};
  const postSetupNotes: string[] = [];

  for (const manifest of selected) {
    for (const db of manifest.notion.databases) {
      process.stdout.write(`  ${db.displayName} DB...`);
      try {
        const dbId = await createNotionDatabase(apiKey, parentPageId, db.displayName, db.schema);
        dbMap[db.envKey] = dbId;
        console.log(` ✅ (id: ${dbId})`);
      } catch (e) {
        console.error(` ❌ 失敗: ${(e as Error).message}`);
        process.exit(1);
      }
    }
    postSetupNotes.push(...(manifest.postSetupNotes ?? []));
  }

  // Step 6: Write output files
  const envContent = generateEnvLocal(apiKey, dbMap);
  writeFileSync(join(ROOT, ".env.local"), envContent, "utf-8");
  console.log("\n✅ .env.local を生成しました");

  const configContent = generateLifeConfig(
    selected.map((m) => m.name),
    { name: userName, timezone, language }
  );
  writeFileSync(join(ROOT, "life.config.json"), configContent, "utf-8");
  console.log("✅ life.config.json を生成しました");

  // Step 7: Post-setup checklist
  if (postSetupNotes.length > 0) {
    console.log("\n📋 手動セットアップが必要な項目:");
    for (const note of postSetupNotes) {
      console.log(`  • ${note}`);
    }
  }

  console.log("\n🎉 セットアップ完了！");
  console.log("   次のステップ: ./dev でdevcontainerを起動してください\n");
}

main().catch((e) => {
  console.error("❌ 予期せぬエラー:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add setup script to `package.json`**

In `package.json`, add `"setup": "bun run scripts/setup.ts"` to the `scripts` object:

```json
{
  "name": "life",
  "module": "index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "setup": "bun run scripts/setup.ts"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Typecheck the new scripts**

```bash
bun run typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add scripts/setup.ts package.json
git commit -m "feat: add bun run setup wizard (Notion token, aspect selection, DB creation)"
```

---

## Task 6: `life.config.example.json` and `.gitignore`

**Files:**
- Create: `life.config.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `life.config.example.json`**

```json
{
  "aspects": {
    "diet": false,
    "gym": false,
    "study": false,
    "daily": true,
    "events": true
  },
  "user": {
    "name": "",
    "timezone": "Asia/Tokyo",
    "language": "ja"
  }
}
```

- [ ] **Step 2: Update `.gitignore`**

Append to the existing `.gitignore`:

```
# Life OS user config (generated by bun run setup)
life.config.json

# Aspect-local Claude instructions (fork-side customizations)
aspects/*/CLAUDE.local.md
```

- [ ] **Step 3: Verify `life.config.json` is ignored**

```bash
echo '{}' > life.config.json
git status life.config.json
```

Expected: `life.config.json` does NOT appear in `git status` output (it's ignored)

```bash
rm life.config.json
```

- [ ] **Step 4: Commit**

```bash
git add life.config.example.json .gitignore
git commit -m "chore: add life.config.example.json and update .gitignore"
```

---

## Task 7: Template Cleanup — Personal Data

**Files:**
- Modify: `aspects/goal.md` (strip personal numbers)
- Replace: `profile/basic.md`, `profile/health.md`, `profile/career.md`, `profile/goals.md`, `profile/personality.md`, `profile/love.md` (replace with TODO templates)
- Clear: `memory-bank/decisions.md` (replace with empty template)
- Clear: `aspects/diet/daily/*.md`, `aspects/events/*.md`, `aspects/daily/*.md` (delete and replace with `.gitkeep`)

> **Note:** This task strips all personal data from files that will be pushed to `life-os`. The structure and field names are preserved as templates so new users understand the format.

- [ ] **Step 1: Template `aspects/goal.md`**

Replace personal metrics (63kg, 58kg, dates) with generic TODO placeholders:

```markdown
# Goals

## メイン目標

<!-- TODO: e.g. 3ヶ月で5kg減量 -->

## マイルストーン

<!-- TODO:
- 1ヶ月目: -1.5kg
- 2ヶ月目: -2.0kg
- 3ヶ月目: -1.5kg
-->

## 基本方針

<!-- TODO: your approach to achieving the goal -->

## 現状

- 現在の体重: <!-- TODO: XXkg -->
- 目標体重: <!-- TODO: XXkg -->

## トラッキング

<!-- TODO: how you will track progress -->
```

- [ ] **Step 2: Template all `profile/` files**

Replace each profile file's personal content with TODO placeholders. Keep headings and field names intact — only replace values.

For each file (`profile/basic.md`, `profile/health.md`, `profile/career.md`, `profile/goals.md`, `profile/personality.md`, `profile/love.md`):

```bash
# Read each file first to understand its structure, then rewrite with TODO placeholders
# Example for basic.md:
```

```markdown
# Basic Profile

## Personal

- Name: <!-- TODO -->
- Location: <!-- TODO: city/area -->
- Timezone: <!-- TODO: e.g. Asia/Tokyo -->

## Life Rhythm

<!-- TODO: your typical daily schedule -->

## Faith / Beliefs

<!-- TODO: optional -->

## Hobbies

<!-- TODO -->
```

Apply the same pattern (headings preserved, values replaced with `<!-- TODO -->`) to all 6 files.

- [ ] **Step 3: Clear `memory-bank/decisions.md`**

Replace the contents with an empty template:

```markdown
# Design Decisions

Record important architectural decisions and their reasons here.

## Format

**Decision:** [what was decided]
**Why:** [the reason]
**Date:** YYYY-MM-DD
```

- [ ] **Step 4: Clear personal daily/event MD files, add `.gitkeep`**

```bash
# Delete all dated MD files in daily log directories
git rm aspects/diet/daily/*.md 2>/dev/null || true
git rm aspects/events/*.md 2>/dev/null || true
git rm aspects/daily/*.md 2>/dev/null || true

# Add .gitkeep to preserve directory structure
touch aspects/diet/daily/.gitkeep
touch aspects/events/.gitkeep
touch aspects/daily/.gitkeep
git add aspects/diet/daily/.gitkeep aspects/events/.gitkeep aspects/daily/.gitkeep
```

Verify:
```bash
ls aspects/diet/daily/ aspects/events/ aspects/daily/
```
Expected: only `.gitkeep` in each directory

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: template personal data for life-os (profile, goal, daily logs, decisions)"
```

---

## Task 8: Create `life-os` GitHub Repository

**No code changes.** This task creates the public GitHub repository and pushes the cleaned codebase.

- [ ] **Step 1: Verify no personal data in files that will be pushed**

```bash
# Check for hardcoded addresses / phone numbers / financial data in files meant for life-os
grep -r "桜木町\|花咲町\|野毛\|シェアヴィラ" aspects/ scripts/ .claude/ CLAUDE.md
```

Expected: no output from `aspects/`, `scripts/`, `.claude/` (address should only be in MEMORY.md which is not committed)

- [ ] **Step 2: Create the GitHub repository**

```bash
gh repo create kokiebisu/life-os \
  --public \
  --description "Personal Life OS — AI-powered personal operating system built on Claude Code + Notion" \
  --clone=false
```

- [ ] **Step 3: Push `life` as initial commit to `life-os`**

```bash
# Add life-os as a remote
git remote add life-os https://github.com/kokiebisu/life-os.git

# Push main branch
git push life-os main
```

- [ ] **Step 4: Enable Template Repository in GitHub settings**

```bash
gh api repos/kokiebisu/life-os -X PATCH -f is_template=true
```

Verify:
```bash
gh repo view kokiebisu/life-os --json isTemplate -q '.isTemplate'
```

Expected: `true`

- [ ] **Step 5: Add upstream remote to `life` for future syncs**

```bash
git remote add upstream https://github.com/kokiebisu/life-os.git
git remote -v
```

Expected output includes:
```
upstream  https://github.com/kokiebisu/life-os.git (fetch)
upstream  https://github.com/kokiebisu/life-os.git (push)
```

---

## Task 9: Verify End-to-End

Smoke test the full setup flow in a temporary directory to ensure a new user can follow the README and get running.

- [ ] **Step 1: Run the test manifest load**

```bash
bun -e "
  const { loadAspectManifests } = await import('./scripts/lib/setup-helpers.ts')
  const manifests = await loadAspectManifests('.')
  console.log('Found', manifests.length, 'aspect manifests:')
  manifests.forEach(m => console.log(' -', m.name, ':', m.notion.databases.length, 'databases'))
"
```

Expected:
```
Found 3 aspect manifests:
 - diet : 3 databases
 - gym : 1 databases
 - study : 1 databases
```

- [ ] **Step 2: Run full test suite**

```bash
bun test scripts/setup.test.ts
```

Expected: 7 pass, 0 fail

- [ ] **Step 3: Verify gym skill uses updated paths**

```bash
grep -c "aspects/gym/logs" .claude/skills/gym/SKILL.md
```

Expected: `5` (all 5 occurrences updated)

```bash
grep -c "diet/gym-logs" .claude/skills/gym/SKILL.md
```

Expected: `0`

- [ ] **Step 4: Verify aspect manifests are loadable**

```bash
bun -e "
  for (const f of ['aspects/diet/aspect.json', 'aspects/gym/aspect.json', 'aspects/study/aspect.json']) {
    const d = JSON.parse(require('fs').readFileSync(f, 'utf-8'))
    console.log('✅', d.name, '— dbs:', d.notion.databases.map(db => db.envKey).join(', '))
  }
"
```

Expected:
```
✅ diet — dbs: NOTION_MEALS_DB, NOTION_GROCERIES_DB, NOTION_OTHER_DB
✅ gym — dbs: NOTION_GYM_DB
✅ study — dbs: NOTION_STUDY_DB
```

- [ ] **Step 5: Final commit and PR**

```bash
# Run /pr to create PR for all changes in this session
```

---

## Summary of All Changes

| Task | What it does |
|------|-------------|
| 1 | Move gym files out of diet, update path refs |
| 2 | Create gym aspect content (CLAUDE.md, profile.md, machine list) |
| 3 | Add aspect.json manifests to diet, gym, study |
| 4 | Build + test setup helper functions |
| 5 | Build interactive setup wizard |
| 6 | Add life.config.example.json, update .gitignore |
| 7 | Template personal data in goal.md |
| 8 | Create life-os GitHub repo, push, enable template, add upstream |
| 9 | End-to-end verification |
