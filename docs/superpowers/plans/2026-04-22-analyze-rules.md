# /analyze — ルール→コード分析スキル 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.ai/rules/` と `skills/` 内の自然言語ルールを構造化抽出し、コード化候補を検出・レポート・実装する `/analyze` スキルを作る

**Architecture:** TypeScript スクリプト (`scripts/analyze-rules.ts`) が Markdown ルールファイルをパースして個別ルールに分解し、パターン分類・メタデータ付与した JSON を出力。`/analyze` スキル (SKILL.md) がそのスクリプトを呼び、LLM 判断でレポート生成→ユーザー選択→実装まで一貫して行う。

**Tech Stack:** TypeScript (Bun), Markdown パーサー (正規表現ベース), Claude Code スキル

---

## ファイル構成

| 操作 | パス | 責務 |
|------|------|------|
| Create | `scripts/analyze-rules.ts` | ルール構造化抽出スクリプト（メイン） |
| Create | `scripts/lib/rule-parser.ts` | Markdown → ExtractedRule[] パース＆パターン分類ロジック |
| Create | `scripts/lib/rule-parser.test.ts` | rule-parser のテスト |
| Create | `skills/analyze/SKILL.md` | `/analyze` スキル定義 |
| Modify | `CLAUDE.md` | `/analyze` コマンドを Commands セクションに追加 |

---

### Task 1: ルールパーサーのコアロジック (`rule-parser.ts`)

**Files:**
- Create: `scripts/lib/rule-parser.ts`
- Create: `scripts/lib/rule-parser.test.ts`

- [ ] **Step 1: ExtractedRule 型と RulePattern 型を定義**

```typescript
// scripts/lib/rule-parser.ts
export type RulePattern =
  | "pre-check"
  | "post-check"
  | "format-enforce"
  | "fallback"
  | "prohibition"
  | "judgment"
  | "unknown";

export interface ExtractedRule {
  id: string;
  source: string;
  heading: string;
  body: string;
  isStrict: boolean;
  hasCodeBlock: boolean;
  hasConditional: boolean;
  relatedScripts: string[];
  patternType: RulePattern;
}
```

- [ ] **Step 2: パターン検出のテストを書く**

```typescript
// scripts/lib/rule-parser.test.ts
import { describe, test, expect } from "bun:test";
import { detectPattern } from "./rule-parser";

describe("detectPattern", () => {
  test("pre-check: 「〜する前に」パターンを検出", () => {
    expect(detectPattern("登録する前に必ず validate-entry.ts を実行する")).toBe("pre-check");
  });

  test("post-check: 「〜した後」パターンを検出", () => {
    expect(detectPattern("更新した後、notion-list.ts で確認する")).toBe("post-check");
  });

  test("format-enforce: フォーマット強制パターンを検出", () => {
    expect(detectPattern("時刻を含む場合は例外なく +09:00 を付けること")).toBe("format-enforce");
  });

  test("fallback: エラー時の代替パターンを検出", () => {
    expect(detectPattern("gh pr create が失敗した場合、gh api で直接 PR を作成する")).toBe("fallback");
  });

  test("prohibition: 禁止パターンを検出", () => {
    expect(detectPattern("main への直接コミット・プッシュ禁止")).toBe("prohibition");
  });

  test("judgment: 判断系パターンを検出", () => {
    expect(detectPattern("文脈に応じて適切に判断する")).toBe("judgment");
  });

  test("unknown: どのパターンにも該当しない", () => {
    expect(detectPattern("ユーザープロフィールは aspects/people/me.md に一元管理されている")).toBe("unknown");
  });
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: FAIL — `detectPattern` が未定義

- [ ] **Step 4: detectPattern を実装**

```typescript
// scripts/lib/rule-parser.ts に追加

const PATTERN_RULES: { pattern: RegExp; type: RulePattern }[] = [
  { pattern: /前に必ず|する前に|登録する前|作成する前|実行する前/, type: "pre-check" },
  { pattern: /した後[、に]|の後に必ず|後[、に].*確認|確認してから/, type: "post-check" },
  { pattern: /を付ける|形式にし|フォーマット|\+09:00|形式で/, type: "format-enforce" },
  { pattern: /失敗した場合|エラーが出たら|失敗したら|エラー時/, type: "fallback" },
  { pattern: /禁止|しない[。こと]|するな[。]|使わない[。こと]/, type: "prohibition" },
  { pattern: /判断|文脈|適切に|考慮して|状況に応じ/, type: "judgment" },
];

export function detectPattern(text: string): RulePattern {
  for (const { pattern, type } of PATTERN_RULES) {
    if (pattern.test(text)) return type;
  }
  return "unknown";
}
```

- [ ] **Step 5: テストを実行してパスを確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: PASS (7/7)

- [ ] **Step 6: コミット**

```bash
git add scripts/lib/rule-parser.ts scripts/lib/rule-parser.test.ts
git commit -m "feat: add rule pattern detection (detectPattern)"
```

---

### Task 2: Markdown 分解ロジック (`splitMarkdownIntoRules`)

**Files:**
- Modify: `scripts/lib/rule-parser.ts`
- Modify: `scripts/lib/rule-parser.test.ts`

- [ ] **Step 1: splitMarkdownIntoRules のテストを書く**

```typescript
// scripts/lib/rule-parser.test.ts に追加
import { splitMarkdownIntoRules } from "./rule-parser";

describe("splitMarkdownIntoRules", () => {
  test("## 見出しでルールを分割する", () => {
    const md = `# タイトル

## ルール1（厳守）

内容1

## ルール2

内容2
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/test.md");
    expect(rules).toHaveLength(2);
    expect(rules[0].heading).toBe("ルール1（厳守）");
    expect(rules[0].isStrict).toBe(true);
    expect(rules[0].body).toContain("内容1");
    expect(rules[1].heading).toBe("ルール2");
    expect(rules[1].isStrict).toBe(false);
  });

  test("見出しがない場合はリスト項目で分割しない（ファイル全体を1ルールとする）", () => {
    const md = `説明文

- ルールA
- ルールB
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/simple.md");
    expect(rules).toHaveLength(1);
    expect(rules[0].heading).toBe("simple");
  });

  test("コードブロックを検出する", () => {
    const md = `## コード例あり

\`\`\`bash
bun run scripts/validate-entry.ts
\`\`\`
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/code.md");
    expect(rules[0].hasCodeBlock).toBe(true);
  });

  test("scripts/ パス参照を検出する", () => {
    const md = `## スクリプト参照

\`scripts/notion/notion-add.ts\` を使う。\`scripts/cache-status.ts\` も実行する。
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/ref.md");
    expect(rules[0].relatedScripts).toEqual([
      "scripts/notion/notion-add.ts",
      "scripts/cache-status.ts",
    ]);
  });

  test("条件分岐パターンを検出する", () => {
    const md = `## 条件付きルール

エラーが出た場合は、notion-fetch で確認する。
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/cond.md");
    expect(rules[0].hasConditional).toBe(true);
  });

  test("id はファイル名 + 見出しから生成する", () => {
    const md = `## タイムゾーン付与

時刻には +09:00 を付けること。
`;
    const rules = splitMarkdownIntoRules(md, ".ai/rules/notion-workflow.md");
    expect(rules[0].id).toBe("notion-workflow--タイムゾーン付与");
    expect(rules[0].source).toBe(".ai/rules/notion-workflow.md");
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: FAIL — `splitMarkdownIntoRules` が未定義

- [ ] **Step 3: splitMarkdownIntoRules を実装**

```typescript
// scripts/lib/rule-parser.ts に追加
import { basename } from "path";

const CONDITIONAL_PATTERN = /の場合|の前に|する前|した後|したら|エラーが出/;
const SCRIPT_REF_PATTERN = /scripts\/[\w\-\/]+\.ts/g;
const STRICT_PATTERN = /厳守/;

export function splitMarkdownIntoRules(markdown: string, filePath: string): ExtractedRule[] {
  const fileBase = basename(filePath, ".md");
  const sections = splitByHeadings(markdown);

  if (sections.length === 0) {
    // 見出しなし → ファイル全体を1ルール
    return [buildRule(fileBase, fileBase, markdown, filePath)];
  }

  return sections.map(({ heading, body }) =>
    buildRule(`${fileBase}--${heading}`, heading, body, filePath)
  );
}

interface Section {
  heading: string;
  body: string;
}

function splitByHeadings(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
      }
      currentHeading = match[1].trim();
      currentBody = [];
    } else if (currentHeading) {
      currentBody.push(line);
    }
  }

  if (currentHeading) {
    sections.push({ heading: currentHeading, body: currentBody.join("\n").trim() });
  }

  return sections;
}

function buildRule(id: string, heading: string, body: string, source: string): ExtractedRule {
  const scriptRefs = [...body.matchAll(SCRIPT_REF_PATTERN)].map(m => m[0]);
  // deduplicate
  const relatedScripts = [...new Set(scriptRefs)];

  return {
    id,
    source,
    heading,
    body,
    isStrict: STRICT_PATTERN.test(heading) || STRICT_PATTERN.test(body.slice(0, 100)),
    hasCodeBlock: /```/.test(body),
    hasConditional: CONDITIONAL_PATTERN.test(body),
    relatedScripts,
    patternType: detectPattern(body),
  };
}
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/rule-parser.ts scripts/lib/rule-parser.test.ts
git commit -m "feat: add Markdown rule splitter (splitMarkdownIntoRules)"
```

---

### Task 3: 既存スクリプト突合ロジック

**Files:**
- Modify: `scripts/lib/rule-parser.ts`
- Modify: `scripts/lib/rule-parser.test.ts`

- [ ] **Step 1: findExistingScripts のテストを書く**

```typescript
// scripts/lib/rule-parser.test.ts に追加
import { findExistingScripts } from "./rule-parser";

describe("findExistingScripts", () => {
  test("scripts/ 配下の実ファイルリストを返す", async () => {
    const files = await findExistingScripts();
    expect(files).toContain("scripts/validate-entry.ts");
    expect(files).toContain("scripts/notion/notion-add.ts");
    expect(files.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: FAIL — `findExistingScripts` が未定義

- [ ] **Step 3: findExistingScripts を実装**

```typescript
// scripts/lib/rule-parser.ts に追加
import { Glob } from "bun";

export async function findExistingScripts(): Promise<string[]> {
  const glob = new Glob("scripts/**/*.ts");
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd() })) {
    files.push(file);
  }
  return files.sort();
}
```

- [ ] **Step 4: テスト実行してパスを確認**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/rule-parser.ts scripts/lib/rule-parser.test.ts
git commit -m "feat: add existing script discovery (findExistingScripts)"
```

---

### Task 4: メインスクリプト (`analyze-rules.ts`)

**Files:**
- Create: `scripts/analyze-rules.ts`

- [ ] **Step 1: analyze-rules.ts を作成**

```typescript
#!/usr/bin/env bun
/**
 * ルール構造化抽出スクリプト
 *
 * 使い方:
 *   bun run scripts/analyze-rules.ts
 *
 * .ai/rules/*.md, CLAUDE.md, skills/*/SKILL.md を読み込み、
 * 個別ルールに分解して JSON を stdout に出力する。
 */

import { Glob } from "bun";
import { splitMarkdownIntoRules, findExistingScripts, type ExtractedRule } from "./lib/rule-parser";

const TARGET_PATTERNS = [
  ".ai/rules/*.md",
  "CLAUDE.md",
  "skills/*/SKILL.md",
];

async function collectFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of TARGET_PATTERNS) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd: process.cwd() })) {
      files.push(file);
    }
  }
  return files.sort();
}

async function main() {
  const [targetFiles, existingScripts] = await Promise.all([
    collectFiles(),
    findExistingScripts(),
  ]);

  const allRules: ExtractedRule[] = [];
  const errors: string[] = [];

  for (const file of targetFiles) {
    try {
      const content = await Bun.file(file).text();
      const rules = splitMarkdownIntoRules(content, file);

      // Mark which referenced scripts actually exist
      for (const rule of rules) {
        rule.relatedScripts = rule.relatedScripts.filter(s => existingScripts.includes(s));
      }

      allRules.push(...rules);
    } catch (e) {
      const msg = `Warning: failed to read ${file}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      console.error(msg);
    }
  }

  const output = {
    scannedFiles: targetFiles.length,
    totalRules: allRules.length,
    rules: allRules,
  };

  console.log(JSON.stringify(output, null, 2));

  if (errors.length > 0) {
    process.exit(0); // still exit 0 — partial results are OK
  }
}

main();
```

- [ ] **Step 2: 実行して JSON 出力を確認**

Run: `cd /workspaces/life && bun run scripts/analyze-rules.ts | head -50`
Expected: JSON 出力（`scannedFiles`, `totalRules`, `rules` フィールドあり）

- [ ] **Step 3: パターン分類が正しく動いているか確認**

Run: `cd /workspaces/life && bun run scripts/analyze-rules.ts | bun -e "const d=JSON.parse(await Bun.stdin.text()); const counts={}; d.rules.forEach(r => counts[r.patternType]=(counts[r.patternType]||0)+1); console.log(counts)"`
Expected: `pre-check`, `post-check`, `format-enforce` 等が1件以上検出されている

- [ ] **Step 4: コミット**

```bash
git add scripts/analyze-rules.ts
git commit -m "feat: add analyze-rules.ts main script"
```

---

### Task 5: `/analyze` スキル作成

**Files:**
- Create: `skills/analyze/SKILL.md`

- [ ] **Step 1: スキルファイルを作成**

```markdown
---
name: analyze
description: ルールファイル（.ai/rules/・CLAUDE.md・skills/）を分析し、コードに置き換えた方が一貫性のある箇所を検出・レポート・実装する。「分析して」「リファクタして」に使う。
---

# /analyze — ルール→コード リファクタリング分析

自然言語ルールを分析し、TypeScript コードに置き換えた方が一貫性のある箇所を検出する。

## Step 1: 構造化抽出

以下を実行して JSON を取得する:

\`\`\`bash
bun run scripts/analyze-rules.ts
\`\`\`

JSON の構造:
- `scannedFiles`: スキャンしたファイル数
- `totalRules`: 抽出されたルール数
- `rules[]`: 各ルールの詳細（id, source, heading, body, isStrict, hasCodeBlock, hasConditional, relatedScripts, patternType）

## Step 2: LLM 判断（各ルールを評価）

JSON の各ルールについて以下を判定する:

### コード化可能性の判定

| patternType | コード化可能性 | 判定基準 |
|-------------|--------------|---------|
| pre-check | 高 | 「〜の前に〜を実行」→ スクリプトに前処理として組み込める |
| post-check | 高 | 「〜の後に〜を確認」→ スクリプトに後処理として組み込める |
| format-enforce | 高 | 「〜を付けろ」→ バリデーション/自動変換で強制できる |
| fallback | 高 | 「〜が失敗したら〜する」→ try-catch/条件分岐で実装できる |
| prohibition | 中 | 「〜するな」→ 既存スクリプトに guard を追加できるか検討 |
| judgment | 低（スキップ） | 「判断が必要」→ プロンプトに残す |
| unknown | 要検討 | LLM が内容を読んで判断 |

### 既にコード化済みかの判定

- `relatedScripts` が空でない → そのスクリプトを読んで、ルールの内容が既にコードで実装されているか確認
- 実装済みならスキップ候補とする

## Step 3: 違反履歴の推定

各ルールについて:

1. `git log --all --oneline --grep="learn" -- <source>` でそのファイルの変更履歴を確認
2. `/learn` 由来のコミット（コミットメッセージに「learn」「再発防止」「ミス」等を含む）があれば違反履歴ありとする
3. `~/.claude/projects/-workspaces-life/memory/` 内の `feedback_*.md` を読み、関連するルールがあれば紐付ける

## Step 4: 優先度スコアリング

各コード化候補に以下のスコアを付ける:

| 要素 | スコア |
|------|--------|
| コード化可能性 high | +3 |
| コード化可能性 mid | +2 |
| コード化可能性 low | +0 |
| 違反履歴あり | +2 |
| 厳守マーク | +1 |
| コード例あり（手順明確） | +1 |

スコア順にソートする。

## Step 5: レポート生成

`docs/analysis/YYYY-MM-DD-analyze.md` にレポートを保存する（YYYY-MM-DD は `TZ=Asia/Tokyo date +%Y-%m-%d` で取得）。

レポートフォーマット:

\`\`\`markdown
# Rules Analysis Report - YYYY-MM-DD

## Summary
- 分析対象: N ファイル, M ルール
- コード化候補: X 件（高: A, 中: B）
- スキップ: Y 件（判断系/既にコード化済み）

## 高優先度

### 1. [source] ルール名 (スコア: N)
- **現状**: ルール原文の要約
- **提案**: 具体的なコード化方法（どのスクリプトにどんなガードを追加するか）
- **違反履歴**: あり/なし（コミットハッシュ or feedback ファイル名）
- **想定実装**: 変更対象ファイルと概要

## 中優先度
（同様のフォーマット）

## スキップ
- [source] ルール名 — 理由（判断系/既にコード化済み/unknown で不要と判断）
\`\`\`

## Step 6: ユーザーに提示

レポートの高優先度・中優先度候補を表示する。

AskUserQuestion で「どれを実装しますか？（番号をカンマ区切りで選択、例: 1,3,5）」と聞く。

## Step 7: 実装

ユーザーが選んだ候補について:

1. 既存スクリプトに guard/バリデーションを追加するか、新しいスクリプトを作成する
2. テストを書いてから実装する（TDD）
3. 元のルールファイルの該当記述に `<!-- コード化済み: scripts/xxx.ts で強制 -->` コメントを追加する
4. コミットする
5. 全候補の実装が完了したら `/pr` で PR を作成する

## 注意事項

- skills/ 内のスキル自体は書き換えない（レポートで提案のみ）
- ルールを自動削除しない（「コード化済み」マークに書き換える or ユーザー承認後に削除）
- 実装時に既存スクリプトの変更が大きい場合、変更箇所を見せてユーザー承認を取る
```

- [ ] **Step 2: スキルが正しくロードされるか確認**

Run: `ls /workspaces/life/skills/analyze/SKILL.md`
Expected: ファイルが存在する

- [ ] **Step 3: コミット**

```bash
git add skills/analyze/SKILL.md
git commit -m "feat: add /analyze skill for rule-to-code refactoring"
```

---

### Task 6: CLAUDE.md にコマンド追加 + 最終テスト

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md の Commands セクションに `/analyze` を追加**

`CLAUDE.md` の `### Claude Code コマンド` セクションの `# その他` の下に追加:

```markdown
/analyze                 # ルール→コード リファクタリング分析
```

- [ ] **Step 2: analyze-rules.ts の全テストを実行**

Run: `cd /workspaces/life && bun test scripts/lib/rule-parser.test.ts`
Expected: ALL PASS

- [ ] **Step 3: analyze-rules.ts を実行して出力を確認**

Run: `cd /workspaces/life && bun run scripts/analyze-rules.ts | bun -e "const d=JSON.parse(await Bun.stdin.text()); console.log('Files:', d.scannedFiles, 'Rules:', d.totalRules); const counts={}; d.rules.forEach(r => counts[r.patternType]=(counts[r.patternType]||0)+1); console.log('Patterns:', counts)"`
Expected: Files: 30+ Rules: 40+ で、各パターンが分類されている

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md
git commit -m "docs: add /analyze command to CLAUDE.md"
```

- [ ] **Step 5: PR 作成**

`/pr` を実行する。
