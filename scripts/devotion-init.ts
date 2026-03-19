#!/usr/bin/env bun
/**
 * devotion-init.ts — Devotion テンプレート生成
 *
 * Usage:
 *   bun run scripts/devotion-init.ts              # 自動で次の書籍・章・今日の日付
 *   bun run scripts/devotion-init.ts --chapter 20 # 章を指定（書籍は自動検出）
 *   bun run scripts/devotion-init.ts --book "Mark" --chapter 1 # 書籍と章を指定
 *   bun run scripts/devotion-init.ts --date 2026-02-20 # 日付を指定
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs, todayJST } from "./lib/notion";

const DEVOTIONS_DIR = join(import.meta.dir, "../aspects/devotions");

// 書籍名の日本語マッピング
const BOOK_NAME_JA: Record<string, string> = {
  // 旧約
  Genesis: "創世記",
  Exodus: "出エジプト記",
  Leviticus: "レビ記",
  Numbers: "民数記",
  Deuteronomy: "申命記",
  Joshua: "ヨシュア記",
  Judges: "士師記",
  Ruth: "ルツ記",
  "1 Samuel": "サムエル記第一",
  "2 Samuel": "サムエル記第二",
  "1 Kings": "列王記第一",
  "2 Kings": "列王記第二",
  "1 Chronicles": "歴代誌第一",
  "2 Chronicles": "歴代誌第二",
  Ezra: "エズラ記",
  Nehemiah: "ネヘミヤ記",
  Esther: "エステル記",
  Job: "ヨブ記",
  Psalms: "詩篇",
  Proverbs: "箴言",
  Ecclesiastes: "伝道の書",
  "Song of Solomon": "雅歌",
  Isaiah: "イザヤ書",
  Jeremiah: "エレミヤ書",
  Lamentations: "哀歌",
  Ezekiel: "エゼキエル書",
  Daniel: "ダニエル書",
  Hosea: "ホセア書",
  Joel: "ヨエル書",
  Amos: "アモス書",
  Obadiah: "オバデヤ書",
  Jonah: "ヨナ書",
  Micah: "ミカ書",
  Nahum: "ナホム書",
  Habakkuk: "ハバクク書",
  Zephaniah: "ゼパニヤ書",
  Haggai: "ハガイ書",
  Zechariah: "ゼカリヤ書",
  Malachi: "マラキ書",
  // 新約
  Matthew: "マタイの福音書",
  Mark: "マルコの福音書",
  Luke: "ルカの福音書",
  John: "ヨハネの福音書",
  Acts: "使徒の働き",
  Romans: "ローマ人への手紙",
  "1 Corinthians": "コリント人への手紙第一",
  "2 Corinthians": "コリント人への手紙第二",
  Galatians: "ガラテヤ人への手紙",
  Ephesians: "エペソ人への手紙",
  Philippians: "ピリピ人への手紙",
  Colossians: "コロサイ人への手紙",
  "1 Thessalonians": "テサロニケ人への手紙第一",
  "2 Thessalonians": "テサロニケ人への手紙第二",
  "1 Timothy": "テモテへの手紙第一",
  "2 Timothy": "テモテへの手紙第二",
  Titus: "テトスへの手紙",
  Philemon: "ピレモンへの手紙",
  Hebrews: "ヘブル人への手紙",
  James: "ヤコブの手紙",
  "1 Peter": "ペテロの手紙第一",
  "2 Peter": "ペテロの手紙第二",
  "1 John": "ヨハネの手紙第一",
  "2 John": "ヨハネの手紙第二",
  "3 John": "ヨハネの手紙第三",
  Jude: "ユダの手紙",
  Revelation: "ヨハネの黙示録",
};

// 逆引きマッピング: 日本語 → 英語キー
const BOOK_NAME_EN: Record<string, string> = Object.fromEntries(
  Object.entries(BOOK_NAME_JA).map(([en, ja]) => [ja, en])
);

// 各書籍の章数
const BOOK_CHAPTERS: Record<string, number> = {
  Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
  Joshua: 24, Judges: 21, Ruth: 4, "1 Samuel": 31, "2 Samuel": 24,
  "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36,
  Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalms: 150,
  Proverbs: 31, Ecclesiastes: 12, "Song of Solomon": 8,
  Isaiah: 66, Jeremiah: 52, Lamentations: 5, Ezekiel: 48, Daniel: 12,
  Hosea: 14, Joel: 3, Amos: 9, Obadiah: 1, Jonah: 4, Micah: 7,
  Nahum: 3, Habakkuk: 3, Zephaniah: 3, Haggai: 2, Zechariah: 14, Malachi: 4,
  Matthew: 28, Mark: 16, Luke: 24, John: 21, Acts: 28,
  Romans: 16, "1 Corinthians": 16, "2 Corinthians": 13,
  Galatians: 6, Ephesians: 6, Philippians: 4, Colossians: 4,
  "1 Thessalonians": 5, "2 Thessalonians": 3,
  "1 Timothy": 6, "2 Timothy": 4, Titus: 3, Philemon: 1,
  Hebrews: 13, James: 5, "1 Peter": 5, "2 Peter": 3,
  "1 John": 5, "2 John": 1, "3 John": 1, Jude: 1, Revelation: 22,
};

const BOOK_ORDER = Object.keys(BOOK_CHAPTERS);

/** 最新のデボーションファイルから書籍と章番号を自動検出する */
function detectLatestBookAndChapter(): { book: string; chapter: number } | null {
  const files = readdirSync(DEVOTIONS_DIR)
    .filter((f) => /^2\d{3}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  for (let i = files.length - 1; i >= 0; i--) {
    const content = readFileSync(join(DEVOTIONS_DIR, files[i]), "utf-8");
    // "# マルコの福音書5章 — ..." のような見出しにマッチ
    const match = content.match(/^# (.+?)(\d+)章/m);
    if (match) {
      const bookJa = match[1].trim();
      const chapter = parseInt(match[2], 10);
      const book = BOOK_NAME_EN[bookJa];
      if (book) return { book, chapter };
    }
  }
  return null;
}

/** 自動で次の書籍・章を決定する（章数上限を超えたら次の書籍へ） */
function detectAutoNext(): { book: string; chapter: number } {
  const latest = detectLatestBookAndChapter();
  if (!latest) {
    console.error("Error: Could not detect current book/chapter. Use --book and --chapter to specify.");
    process.exit(1);
  }

  const { book, chapter } = latest;
  const maxChapter = BOOK_CHAPTERS[book] ?? 999;
  const nextChapter = chapter + 1;

  if (nextChapter <= maxChapter) {
    return { book, chapter: nextChapter };
  }

  // 章数上限を超えた → 次の書籍の第1章へ
  const currentIndex = BOOK_ORDER.indexOf(book);
  const nextBook = currentIndex === -1 || currentIndex === BOOK_ORDER.length - 1
    ? BOOK_ORDER[0]
    : BOOK_ORDER[currentIndex + 1];

  const bookJa = BOOK_NAME_JA[book] ?? book;
  const nextBookJa = BOOK_NAME_JA[nextBook] ?? nextBook;
  console.log(`ℹ ${bookJa}は全${maxChapter}章完了。次の書籍: ${nextBookJa}`);

  return { book: nextBook, chapter: 1 };
}

/** 指定書籍の次の章を検出する */
function detectNextChapterForBook(book: string): number {
  const bookJa = BOOK_NAME_JA[book] || book;
  const files = readdirSync(DEVOTIONS_DIR)
    .filter((f) => /^2\d{3}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  for (let i = files.length - 1; i >= 0; i--) {
    const content = readFileSync(join(DEVOTIONS_DIR, files[i]), "utf-8");
    const match = content.match(new RegExp(`^# ${bookJa}(\\d+)章`, "m"));
    if (match) {
      return parseInt(match[1], 10) + 1;
    }
  }

  console.error(`Error: Could not detect chapter for ${bookJa}. Use --chapter to specify.`);
  process.exit(1);
}

function generateTemplate(date: string, book: string, chapter: number): string {
  const bookJa = BOOK_NAME_JA[book] || book;
  return `---
title: ${date} Devotion
date: ${date}
---

# ${bookJa}${chapter}章 — テーマ

**Scripture:** ${bookJa}${chapter}章 | **Key Verses:**

## 章の概要

${bookJa}${chapter}章は4つの柱で構成される:

1. **柱1**（節）—
2. **柱2**（節）—
3. **柱3**（節）—
4. **柱4**（節）—

## Key Verses

> （聖句全文）（${chapter}:節）

## 節の深掘り — サブテーマ

> （聖句全文）

-

## SOAP

**S（Scripture）:**

**O（Observation）:**

**A（Application）:**

**P（Prayer）:**

## 実践ガイド — タイトル

### 基本姿勢

-

### 場面別の対処

-

## 持ち帰り（${bookJa}${chapter}章）

- **要点** — 説明
`;
}

// --- main ---
const { opts } = parseArgs();

const date = opts["date"] || todayJST();

let book: string;
let chapter: number;

if (opts["chapter"]) {
  // 章を明示指定
  book = opts["book"] || (() => {
    const latest = detectLatestBookAndChapter();
    return latest?.book ?? "Proverbs";
  })();
  chapter = parseInt(opts["chapter"], 10);
} else if (opts["book"]) {
  // 書籍を明示指定、章は自動検出
  book = opts["book"];
  chapter = detectNextChapterForBook(book);
} else {
  // 書籍・章ともに自動検出
  const next = detectAutoNext();
  book = next.book;
  chapter = next.chapter;
}

if (isNaN(chapter) || chapter < 1) {
  console.error("Error: Invalid chapter number.");
  process.exit(1);
}

const maxChapter = BOOK_CHAPTERS[book];
if (maxChapter && chapter > maxChapter) {
  const bookJa = BOOK_NAME_JA[book] ?? book;
  console.error(`Error: ${bookJa}は${maxChapter}章までです（指定: ${chapter}章）。`);
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Error: Date must be YYYY-MM-DD format.");
  process.exit(1);
}

const outputPath = join(DEVOTIONS_DIR, `${date}.md`);

if (existsSync(outputPath)) {
  console.error(`Error: ${date}.md already exists.`);
  process.exit(1);
}

const bookJa = BOOK_NAME_JA[book] || book;
const template = generateTemplate(date, book, chapter);
await Bun.write(outputPath, template);

console.log(`✓ Created ${date}.md (${bookJa}${chapter}章)`);
