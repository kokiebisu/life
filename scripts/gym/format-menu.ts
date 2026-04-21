#!/usr/bin/env bun
/**
 * ジムメニュー Notion ページ本文生成
 *
 * 種目データからスタイリング済みの Notion-flavored Markdown を生成する。
 * callout + 色付きテーブルで見やすいレイアウトにする。
 *
 * 使い方（CLIモード）:
 *   echo '{"session":{"date":"4/18（金）","time":"12:30〜14:00"},"exercises":[...]}' | bun run scripts/gym/format-menu.ts
 *
 * 使い方（ライブラリモード）:
 *   import { formatMenu, formatNotionContent, type Exercise } from "./scripts/gym/format-menu";
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

  if (VALID_FEEDBACK.includes(s as Feedback)) return s as Feedback;

  if (/余裕|楽|軽い|軽かった|簡単|イージー|easy/i.test(s)) return "余裕";
  if (/きつ|辛|つら|無理|ムリ|hard|heavy|重い|重かった|限界/i.test(s)) return "きつい";
  if (/まあまあ|普通|ふつう|そこそこ|ちょうど|ok|medium/i.test(s)) return "まあまあ";

  return "まあまあ";
}

// --- 種目データ型 ---

export interface StrengthExercise {
  type: "strength";
  name: string;
  weight: string;
  sets: number;
  reps: number;
  feedback?: string;
}

export interface CardioExercise {
  type: "cardio";
  name: string;
  duration: string;
  feedback?: string;
}

export type Exercise = StrengthExercise | CardioExercise;

export interface SessionInfo {
  date: string;   // e.g. "4/18（金）"
  time: string;   // e.g. "12:30〜14:00"
}

// --- Notion-flavored Markdown テーブル生成 ---

function strengthTableRows(exercises: StrengthExercise[]): string {
  return exercises.map((e, i) => {
    const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
    return `\t<tr>\n\t\t<td>${i + 1}</td>\n\t\t<td>${e.name}</td>\n\t\t<td>${e.weight}</td>\n\t\t<td>${e.sets}</td>\n\t\t<td>${e.reps}</td>\n\t\t<td>${fb}</td>\n\t</tr>`;
  }).join("\n");
}

function cardioTableRows(exercises: CardioExercise[]): string {
  return exercises.map((e, i) => {
    const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
    return `\t<tr>\n\t\t<td>${i + 1}</td>\n\t\t<td>${e.name}</td>\n\t\t<td>${e.duration}</td>\n\t\t<td>${fb}</td>\n\t</tr>`;
  }).join("\n");
}

/**
 * Notion ページ本文用のスタイリング済み Markdown を生成
 */
export function formatNotionContent(session: SessionInfo, exercises: Exercise[]): string {
  const strength = exercises.filter((e): e is StrengthExercise => e.type === "strength");
  const cardio = exercises.filter((e): e is CardioExercise => e.type === "cardio");

  const summaryParts: string[] = [];
  if (strength.length > 0) summaryParts.push(`筋トレ ${strength.length}種目`);
  if (cardio.length > 0) summaryParts.push(`有酸素 ${cardio.length}種目`);

  const parts: string[] = [];

  // Callout サマリー
  parts.push(`<callout icon="📊" color="blue_bg">\n\t**${session.date} ${session.time}** — ${summaryParts.join(" + ")}\n</callout>`);
  parts.push("---");

  // 筋トレテーブル
  if (strength.length > 0) {
    parts.push(`## 💪 筋トレ {color="blue"}`);
    parts.push(`<table fit-page-width="true" header-row="true">
\t<colgroup>
\t\t<col color="gray">
\t\t<col>
\t\t<col>
\t\t<col>
\t\t<col>
\t\t<col>
\t</colgroup>
\t<tr color="blue_bg">
\t\t<td>#</td>
\t\t<td>種目</td>
\t\t<td>重量（kg）</td>
\t\t<td>セット</td>
\t\t<td>回数</td>
\t\t<td>FB</td>
\t</tr>
${strengthTableRows(strength)}
</table>`);
  }

  // 有酸素テーブル
  if (cardio.length > 0) {
    parts.push(`## 🏃 有酸素 {color="green"}`);
    parts.push(`<table fit-page-width="true" header-row="true">
\t<colgroup>
\t\t<col color="gray">
\t\t<col>
\t\t<col>
\t\t<col>
\t</colgroup>
\t<tr color="green_bg">
\t\t<td>#</td>
\t\t<td>種目</td>
\t\t<td>時間</td>
\t\t<td>FB</td>
\t</tr>
${cardioTableRows(cardio)}
</table>`);
  }

  return parts.join("\n\n");
}

/**
 * プレーンMarkdownテーブルを生成（ローカルMD・コーチ報告用）
 */
export function formatMenu(exercises: Exercise[]): string {
  const strength = exercises.filter((e): e is StrengthExercise => e.type === "strength");
  const cardio = exercises.filter((e): e is CardioExercise => e.type === "cardio");

  const parts: string[] = [];

  if (strength.length > 0) {
    const lines = [
      "## 筋トレ", "",
      "| # | 種目 | 重量（kg） | セット | 回数 | FB |",
      "|---|------|------|--------|------|-----|",
    ];
    strength.forEach((e, i) => {
      const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
      lines.push(`| ${i + 1} | ${e.name} | ${e.weight} | ${e.sets} | ${e.reps} | ${fb} |`);
    });
    parts.push(lines.join("\n"));
  }

  if (cardio.length > 0) {
    const lines = [
      "## 有酸素", "",
      "| # | 種目 | 時間 | FB |",
      "|---|------|------|-----|",
    ];
    cardio.forEach((e, i) => {
      const fb = e.feedback ? normalizeFeedback(e.feedback) : "";
      lines.push(`| ${i + 1} | ${e.name} | ${e.duration} | ${fb} |`);
    });
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n");
}

// --- パース（Notion fetch 結果から種目を抽出） ---

export function parseMenu(text: string): Exercise[] {
  const exercises: Exercise[] = [];
  const lines = text.split("\n");

  let currentSection: "strength" | "cardio" | null = null;
  let inTable = false;
  let isHeaderRow = true;
  let cellBuffer: string[] = [];
  let inCell = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // セクション検出（Markdown見出し or Notion XML の見出し）
    if (/筋トレ/.test(trimmed) && !/有酸素/.test(trimmed)) {
      currentSection = "strength";
      inTable = false;
      isHeaderRow = true;
      continue;
    }
    if (/有酸素/.test(trimmed)) {
      currentSection = "cardio";
      inTable = false;
      isHeaderRow = true;
      continue;
    }

    if (!currentSection) continue;

    // Notion XML テーブル形式のパース
    if (trimmed.startsWith("<table")) { inTable = true; continue; }
    if (trimmed === "</table>") { inTable = false; continue; }

    if (inTable) {
      if (trimmed === "<tr>" || trimmed.startsWith("<tr ")) {
        cellBuffer = [];
        inCell = false;
        continue;
      }
      if (trimmed === "</tr>") {
        if (isHeaderRow) { isHeaderRow = false; continue; }
        if (currentSection === "strength" && cellBuffer.length >= 5) {
          exercises.push({
            type: "strength",
            name: cellBuffer[1],
            weight: cellBuffer[2],
            sets: Number(cellBuffer[3]) || 0,
            reps: Number(cellBuffer[4]) || 0,
            feedback: cellBuffer[5] || "",
          });
        } else if (currentSection === "cardio" && cellBuffer.length >= 3) {
          exercises.push({
            type: "cardio",
            name: cellBuffer[1],
            duration: cellBuffer[2],
            feedback: cellBuffer[3] || "",
          });
        }
        continue;
      }
      if (trimmed.startsWith("<td")) {
        // Inline <td>content</td>
        const match = trimmed.match(/<td[^>]*>(.*?)<\/td>/);
        if (match) {
          cellBuffer.push(match[1]);
        } else {
          inCell = true;
        }
        continue;
      }
      if (trimmed === "</td>") { inCell = false; continue; }
      if (inCell) { cellBuffer.push(trimmed); continue; }
    }

    // プレーン Markdown テーブル形式のパース（フォー���バック）
    if (trimmed.startsWith("|")) {
      if (trimmed.includes("種目")) continue;
      if (trimmed.match(/^\|[\s\-|]+\|$/)) continue;

      const cells = trimmed.split("|").filter(c => c.trim() !== "").map(c => c.trim());
      if (currentSection === "strength" && cells.length >= 5) {
        exercises.push({
          type: "strength", name: cells[1], weight: cells[2],
          sets: Number(cells[3]) || 0, reps: Number(cells[4]) || 0,
          feedback: cells[5] || "",
        });
      } else if (currentSection === "cardio" && cells.length >= 3) {
        exercises.push({
          type: "cardio", name: cells[1], duration: cells[2],
          feedback: cells[3] || "",
        });
      }
    }
  }

  return exercises;
}

// --- CLI mode ---
if (import.meta.main) {
  const input = await Bun.stdin.text();
  try {
    const data = JSON.parse(input);
    if (data.session && data.exercises) {
      // Notion content mode
      console.log(formatNotionContent(data.session, data.exercises));
    } else if (Array.isArray(data)) {
      // Plain markdown mode (backward compat)
      console.log(formatMenu(data));
    } else {
      throw new Error("Invalid input");
    }
  } catch {
    console.error("Usage:");
    console.error('  Notion: echo \'{"session":{"date":"4/18（金）","time":"12:30〜14:00"},"exercises":[...]}\' | bun run scripts/gym/format-menu.ts');
    console.error('  Plain:  echo \'[{"type":"strength","name":"ダンベルプレス","weight":"36kg","sets":3,"reps":8}]\' | bun run scripts/gym/format-menu.ts');
    process.exit(1);
  }
}
