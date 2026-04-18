#!/usr/bin/env bun
/**
 * ジムメニューテーブル生成
 *
 * 種目データから統一フォーマットのMarkdownテーブルを生成する。
 * 筋トレと有酸素を別テーブルに分離し、FBは固定選択肢でバリデーションする。
 *
 * 使い方（CLIモード）:
 *   echo '[{"type":"strength","name":"フィックスドプルダウン","weight":"65kg","sets":3,"reps":8,"feedback":"余裕"}]' | bun run scripts/gym/format-menu.ts
 *
 * 使い方（ライブラリモード）:
 *   import { formatMenu, type StrengthExercise, type CardioExercise } from "./scripts/gym/format-menu";
 *   const markdown = formatMenu(exercises);
 */

// --- FB 選択肢 ---

const VALID_FEEDBACK = ["余裕", "まあまあ", "きつい", ""] as const;
export type Feedback = (typeof VALID_FEEDBACK)[number];

/**
 * 自由入力テキストを正規化された FB 値に変換する
 */
export function normalizeFeedback(raw: string): Feedback {
  const s = raw.trim();
  if (!s) return "";

  // 完全一致
  if (VALID_FEEDBACK.includes(s as Feedback)) return s as Feedback;

  // 余裕系
  if (/余裕|楽|軽い|軽かった|簡単|イージー|easy/i.test(s)) return "余裕";
  // きつい系
  if (/きつ|辛|つら|無理|ムリ|hard|heavy|重い|重かった|限界/i.test(s)) return "きつい";
  // まあまあ系
  if (/まあまあ|普通|ふつう|そこそこ|ちょうど|ok|medium/i.test(s)) return "まあまあ";

  // マッチしない → まあまあ（デフォルト）
  return "まあまあ";
}

// --- 種目データ型 ---

export interface StrengthExercise {
  type: "strength";
  name: string;
  weight: string;        // e.g. "65kg"
  sets: number;
  reps: number;
  feedback?: string;
}

export interface CardioExercise {
  type: "cardio";
  name: string;
  duration: string;      // e.g. "15分"
  feedback?: string;
}

export type Exercise = StrengthExercise | CardioExercise;

// --- テーブル生成 ---

function formatStrengthTable(exercises: StrengthExercise[]): string {
  if (exercises.length === 0) return "";
  const lines: string[] = [
    "## 筋トレ",
    "",
    "| # | 種目 | 重量 | セット | 回数 | FB |",
    "|---|------|------|--------|------|-----|",
  ];
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
    lines.push(`| ${i + 1} | ${e.name} | ${e.weight} | ${e.sets} | ${e.reps} | ${fb} |`);
  }
  return lines.join("\n");
}

function formatCardioTable(exercises: CardioExercise[]): string {
  if (exercises.length === 0) return "";
  const lines: string[] = [
    "## 有酸素",
    "",
    "| # | 種目 | 時間 | FB |",
    "|---|------|------|-----|",
  ];
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
    lines.push(`| ${i + 1} | ${e.name} | ${e.duration} | ${fb} |`);
  }
  return lines.join("\n");
}

/**
 * 種目配列から統一フォーマットのMarkdownテーブルを生成
 * 筋トレと有酸素を自動分離する
 */
export function formatMenu(exercises: Exercise[]): string {
  const strength = exercises.filter((e): e is StrengthExercise => e.type === "strength");
  const cardio = exercises.filter((e): e is CardioExercise => e.type === "cardio");

  const parts: string[] = [];
  if (strength.length > 0) parts.push(formatStrengthTable(strength));
  if (cardio.length > 0) parts.push(formatCardioTable(cardio));

  return parts.join("\n\n");
}

// --- パース ---

export function parseMenu(text: string): Exercise[] {
  const exercises: Exercise[] = [];
  const lines = text.split("\n");

  let currentSection: "strength" | "cardio" | null = null;
  let headerPassed = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // セクション見出し検出
    if (/##\s*筋トレ/.test(trimmed) || trimmed.includes("筋トレ")) {
      currentSection = "strength";
      headerPassed = false;
      continue;
    }
    if (/##\s*有酸素/.test(trimmed) || trimmed.includes("有酸素")) {
      currentSection = "cardio";
      headerPassed = false;
      continue;
    }

    if (!currentSection) continue;
    if (!trimmed.startsWith("|")) continue;

    // ヘッダー行（種目を含む）をスキップ
    if (trimmed.includes("種目")) {
      continue;
    }

    // セパレータ行をスキップ
    if (trimmed.match(/^\|[\s\-|]+\|$/)) {
      headerPassed = true;
      continue;
    }

    if (!headerPassed) continue;

    const cells = trimmed
      .split("|")
      .filter(c => c.trim() !== "")
      .map(c => c.trim());

    if (currentSection === "strength" && cells.length >= 5) {
      exercises.push({
        type: "strength",
        name: cells[1],
        weight: cells[2],
        sets: Number(cells[3]) || 0,
        reps: Number(cells[4]) || 0,
        feedback: cells[5] || "",
      });
    } else if (currentSection === "cardio" && cells.length >= 3) {
      exercises.push({
        type: "cardio",
        name: cells[1],
        duration: cells[2],
        feedback: cells[3] || "",
      });
    }
  }

  return exercises;
}

// --- CLI mode ---
if (import.meta.main) {
  const input = await Bun.stdin.text();
  try {
    const exercises: Exercise[] = JSON.parse(input);
    console.log(formatMenu(exercises));
  } catch {
    console.error("Usage: echo '<JSON array>' | bun run scripts/gym/format-menu.ts");
    console.error('Example: echo \'[{"type":"strength","name":"ダンベルプレス","weight":"36kg","sets":3,"reps":8}]\' | bun run scripts/gym/format-menu.ts');
    process.exit(1);
  }
}
