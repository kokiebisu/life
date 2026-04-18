#!/usr/bin/env bun
/**
 * ジムメニューテーブル生成
 *
 * 種目データから統一フォーマットのMarkdownテーブルを生成する。
 * Notion ページ本文に書き込む用途で使う。
 *
 * 使い方（CLIモード）:
 *   echo '[{"name":"フィックスドプルダウン","weight":"65kg","sets":3,"reps":8}]' | bun run scripts/gym/format-menu.ts
 *
 * 使い方（ライブラリモード）:
 *   import { formatMenuTable, type GymExercise } from "./scripts/gym/format-menu";
 *   const markdown = formatMenuTable(exercises);
 */

export interface GymExercise {
  name: string;
  weight: string;   // e.g. "65kg", "—"
  sets: number | string;  // e.g. 3, "—"
  reps: number | string;  // e.g. 8, "15分"
  feedback?: string;      // e.g. "余裕！", ""
}

/**
 * 種目配列から統一フォーマットのMarkdownテーブルを生成
 */
export function formatMenuTable(exercises: GymExercise[]): string {
  const lines: string[] = [
    "## メニュー",
    "",
    "| # | 種目 | 重量 | セット | 回数 | FB |",
    "|---|------|------|--------|------|-----|",
  ];

  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    const fb = e.feedback ?? "";
    lines.push(`| ${i + 1} | ${e.name} | ${e.weight} | ${e.sets} | ${e.reps} | ${fb} |`);
  }

  return lines.join("\n");
}

/**
 * Notion ページ本文用の Block 配列を生成
 */
export function formatMenuBlocks(exercises: GymExercise[]): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Heading
  blocks.push({
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: "メニュー" } }] },
  });

  // Table
  const headerRow = {
    type: "table_row",
    table_row: {
      cells: ["#", "種目", "重量", "セット", "回数", "FB"].map(text => [
        { type: "text", text: { content: text } },
      ]),
    },
  };

  const dataRows = exercises.map((e, i) => ({
    type: "table_row",
    table_row: {
      cells: [
        String(i + 1),
        e.name,
        String(e.weight),
        String(e.sets),
        String(e.reps),
        e.feedback ?? "",
      ].map(text => [{ type: "text", text: { content: text } }]),
    },
  }));

  blocks.push({
    type: "table",
    table: {
      table_width: 6,
      has_column_header: true,
      has_row_header: false,
      children: [headerRow, ...dataRows],
    },
  });

  return blocks;
}

/**
 * Notion ページ本文のMarkdownテーブルから種目データをパースする
 */
export function parseMenuTable(markdown: string): GymExercise[] {
  const exercises: GymExercise[] = [];
  const lines = markdown.split("\n");

  // テーブル行を探す（ヘッダー + セパレータ + データ行）
  let inTable = false;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable) break; // テーブル終了
      continue;
    }

    if (!inTable) {
      // ヘッダー行検出（"種目" を含む行）
      if (trimmed.includes("種目")) {
        inTable = true;
        continue;
      }
      continue;
    }

    // セパレータ行をスキップ
    if (trimmed.match(/^\|[\s\-|]+\|$/)) {
      headerPassed = true;
      continue;
    }

    if (!headerPassed) continue;

    // データ行をパース: | # | 種目 | 重量 | セット | 回数 | FB |
    const cells = trimmed
      .split("|")
      .filter(c => c.trim() !== "")
      .map(c => c.trim());

    if (cells.length >= 5) {
      exercises.push({
        name: cells[1],
        weight: cells[2],
        sets: isNaN(Number(cells[3])) ? cells[3] : Number(cells[3]),
        reps: isNaN(Number(cells[4])) ? cells[4] : Number(cells[4]),
        feedback: cells[5] || "",
      });
    }
  }

  return exercises;
}

// --- CLI mode ---
if (import.meta.main) {
  const input = await Bun.stdin.text();
  try {
    const exercises: GymExercise[] = JSON.parse(input);
    console.log(formatMenuTable(exercises));
  } catch {
    console.error("Usage: echo '<JSON array>' | bun run scripts/gym/format-menu.ts");
    console.error('Example: echo \'[{"name":"ダンベルプレス","weight":"36kg","sets":3,"reps":8}]\' | bun run scripts/gym/format-menu.ts');
    process.exit(1);
  }
}
