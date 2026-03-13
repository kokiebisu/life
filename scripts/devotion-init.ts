#!/usr/bin/env bun
/**
 * devotion-init.ts — Devotion テンプレート生成
 *
 * Usage:
 *   bun run scripts/devotion-init.ts              # 自動で次の章・今日の日付
 *   bun run scripts/devotion-init.ts --chapter 20 # 章を指定（箴言）
 *   bun run scripts/devotion-init.ts --book "Mark" --chapter 1 # 書籍と章を指定
 *   bun run scripts/devotion-init.ts --date 2026-02-20 # 日付を指定
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs, todayJST } from "./lib/notion";

const DEVOTIONS_DIR = join(import.meta.dir, "../aspects/church/devotions");

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

function detectNextChapter(book: string): { chapter: number } {
  const bookJa = BOOK_NAME_JA[book] || book;
  const files = readdirSync(DEVOTIONS_DIR)
    .filter((f) => /^2\d{3}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error("Error: No existing devotion files found. Use --chapter to specify.");
    process.exit(1);
  }

  // 最新ファイルから対象書籍の章を検出
  for (let i = files.length - 1; i >= 0; i--) {
    const content = readFileSync(join(DEVOTIONS_DIR, files[i]), "utf-8");
    const match = content.match(new RegExp(`^# ${bookJa}(\\d+)章`, "m"));
    if (match) {
      return { chapter: parseInt(match[1], 10) + 1 };
    }
  }

  // 箴言のフォールバック（旧形式）
  if (book === "Proverbs") {
    const latest = files[files.length - 1];
    const content = readFileSync(join(DEVOTIONS_DIR, latest), "utf-8");
    const match = content.match(/^# 箴言(\d+)章/m);
    if (match) {
      return { chapter: parseInt(match[1], 10) + 1 };
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
const book = opts["book"] || "Proverbs";
const chapter = opts["chapter"]
  ? parseInt(opts["chapter"], 10)
  : detectNextChapter(book).chapter;

if (isNaN(chapter) || chapter < 1) {
  console.error("Error: Invalid chapter number.");
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
