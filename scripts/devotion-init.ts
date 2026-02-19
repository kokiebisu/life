#!/usr/bin/env bun
/**
 * devotion-init.ts — Devotion テンプレート生成
 *
 * Usage:
 *   bun run scripts/devotion-init.ts              # 自動で次の章・今日の日付
 *   bun run scripts/devotion-init.ts --chapter 20 # 章を指定
 *   bun run scripts/devotion-init.ts --date 2026-02-20 # 日付を指定
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs, todayJST } from "./lib/notion";

const DEVOTIONS_DIR = join(import.meta.dir, "../aspects/church/devotions");

function detectNextChapter(): number {
  const files = readdirSync(DEVOTIONS_DIR)
    .filter((f) => /^2\d{3}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error("Error: No existing devotion files found. Use --chapter to specify.");
    process.exit(1);
  }

  const latest = files[files.length - 1];
  const content = readFileSync(join(DEVOTIONS_DIR, latest), "utf-8");
  const match = content.match(/^# 箴言(\d+)章/m);

  if (!match) {
    console.error(`Error: Could not detect chapter number from ${latest}`);
    process.exit(1);
  }

  return parseInt(match[1], 10) + 1;
}

function generateTemplate(date: string, chapter: number): string {
  return `---
title: ${date} Devotion
date: ${date}
---

# 箴言${chapter}章 — テーマ

**Scripture:** 箴言${chapter}章 | **Key Verses:**

## 章の概要

箴言${chapter}章は4つの柱で構成される:

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

## 持ち帰り（箴言${chapter}章）

- **要点** — 説明
`;
}

// --- main ---
const { opts } = parseArgs();

const date = opts["date"] || todayJST();
const chapter = opts["chapter"] ? parseInt(opts["chapter"], 10) : detectNextChapter();

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

const template = generateTemplate(date, chapter);
await Bun.write(outputPath, template);

console.log(`✓ Created ${date}.md (箴言${chapter}章)`);
