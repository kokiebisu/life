#!/usr/bin/env bun
/**
 * Notion meals DB の過去エントリから作り置きの消費を検出し、fridge.md を更新する
 *
 * 使い方:
 *   bun run scripts/notion/notion-fridge-consume.ts              # 昨日分を処理
 *   bun run scripts/notion/notion-fridge-consume.ts --from 2026-04-13 --to 2026-04-14
 *   bun run scripts/notion/notion-fridge-consume.ts --dry-run    # 確認のみ（書き込まない）
 *   bun run scripts/notion/notion-fridge-consume.ts --match-title # タイトル名でマッチ（マーカーなし時の代替）
 *
 * 検出モード（優先順）:
 *   1. マーカー方式: 「（作り置き1食目）」 or 「（作り置き: しぐれ煮風 1食目）」
 *   2. --match-title: タイトルに作り置き名が含まれる場合にマッチ
 *
 * 推奨: 今後の作り置き食事を Notion に登録するときは「（作り置きN食目）」をタイトルに付ける
 */

import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import {
  getScheduleDbConfig,
  queryDbByDateCached,
  normalizePages,
  parseArgs,
  todayJST,
} from "./lib/notion";

const FRIDGE_PATH = join(import.meta.dir, "../../aspects/diet/fridge.md");

// 作り置きタイトルパターン: （作り置き: <name> N食目） or （作り置きN食目）
const STORAGE_PATTERN = /（作り置き(?::\s*(.+?))?\s*\d+食目）/;

interface StorageItem {
  name: string;
  quantity: number;
  unit: string;
  notes: string;
  lineIdx: number;
}

function parseFridgeStorage(content: string): { items: StorageItem[]; lines: string[] } {
  const lines = content.split("\n");
  const items: StorageItem[] = [];
  let inStorage = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "## 作り置き") { inStorage = true; inTable = false; continue; }
    if (inStorage && line.startsWith("## ")) { inStorage = false; continue; }
    if (!inStorage) continue;
    if (line.match(/^\|\s*食材/)) { inTable = true; continue; }
    if (line.match(/^\|\s*[-–|]+/)) continue;
    if (!inTable || !line.startsWith("|")) continue;

    const cols = line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 2) continue;

    const name = cols[0];
    const quantityStr = cols[1];
    const notes = cols[2] || "";

    const qMatch = quantityStr.match(/^(\d+)\s*(.*)$/);
    if (!qMatch) continue;

    items.push({ name, quantity: parseInt(qMatch[1], 10), unit: qMatch[2].trim(), notes, lineIdx: i });
  }

  return { items, lines };
}

function updateFridgeLines(lines: string[], item: StorageItem, newQty: number | "delete", today: string): string {
  const result = [...lines];

  if (newQty === "delete") {
    result.splice(item.lineIdx, 1);
  } else {
    const cols = result[item.lineIdx].split("|");
    // cols: ["", " name ", " quantity ", " notes ", ""]
    if (cols.length >= 4) {
      cols[2] = cols[2].replace(/\d+/, String(newQty));
      result[item.lineIdx] = cols.join("|");
    }
  }

  return result.join("\n").replace(
    /^> 最終更新: \d{4}-\d{2}-\d{2}/m,
    `> 最終更新: ${today}`,
  );
}

async function main() {
  const { flags, opts } = parseArgs();
  const dryRun = flags.has("dry-run");
  const matchTitle = flags.has("match-title");
  const today = todayJST();

  const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("sv-SE");

  const fromDate = opts.from || yesterdayStr;
  const toDate = opts.to || yesterdayStr;

  console.log(`[fridge-consume] ${fromDate} 〜 ${toDate}${dryRun ? " (dry-run)" : ""}`);

  // fridge.md の作り置きを読み込む
  const fridgeContent = readFileSync(FRIDGE_PATH, "utf-8");
  const { items: storageItems, lines } = parseFridgeStorage(fridgeContent);

  if (storageItems.length === 0) {
    console.log("作り置きエントリなし。スキップ。");
    return;
  }

  console.log(`在庫: ${storageItems.map(i => `${i.name} ${i.quantity}${i.unit}`).join(", ")}`);

  // Notion meals DB を日付でクエリ
  const { apiKey, dbId, config } = getScheduleDbConfig("meals");
  const data = await queryDbByDateCached(apiKey, dbId, config, fromDate, toDate);
  const entries = normalizePages(data.results || [], config, "meals");

  // 作り置き消費をカウント（名前ごと）
  const consumptionByName = new Map<string | null, number>();
  for (const entry of entries) {
    // モード1: マーカー方式（優先）
    const m = entry.title.match(STORAGE_PATTERN);
    if (m) {
      const name = m[1]?.trim() || null;
      consumptionByName.set(name, (consumptionByName.get(name) || 0) + 1);
      console.log(`  [マーカー] "${entry.title}" → ${name ?? "（自動マッチ）"} 1食消費`);
      continue;
    }
    // モード2: --match-title（タイトルに作り置き名が含まれる場合）
    if (matchTitle) {
      for (const item of storageItems) {
        if (entry.title.includes(item.name)) {
          consumptionByName.set(item.name, (consumptionByName.get(item.name) || 0) + 1);
          console.log(`  [名前一致] "${entry.title}" → ${item.name} 1食消費`);
          break;
        }
      }
    }
  }

  if (consumptionByName.size === 0) {
    if (matchTitle) {
      console.log("作り置き消費なし。スキップ。");
    } else {
      console.log("作り置き消費なし。タイトルに「（作り置きN食目）」がない場合は --match-title を試してください。");
    }
    return;
  }

  // マッチングして fridge.md を更新
  let currentContent = fridgeContent;
  let currentLines = lines;
  let currentItems = storageItems;

  for (const [name, count] of consumptionByName) {
    let matched: StorageItem | null = null;

    if (name) {
      matched = currentItems.find(i => i.name.includes(name) || name.includes(i.name)) || null;
      if (!matched) {
        console.warn(`  ⚠️ "${name}" に一致する作り置きが見つかりません（在庫: ${currentItems.map(i => i.name).join(", ")}）`);
        continue;
      }
    } else {
      if (currentItems.length === 1) {
        matched = currentItems[0];
      } else {
        console.error(`  ❌ 作り置きが複数あります（${currentItems.map(i => i.name).join(", ")}）`);
        console.error(`     タイトルに「（作り置き: <名前> N食目）」の形式で名前を指定してください`);
        process.exit(1);
      }
    }

    const newQty = matched.quantity - count;
    const action = newQty <= 0 ? "delete" : newQty;
    console.log(`  ${matched.name}: ${matched.quantity}${matched.unit} - ${count}食 → ${action === "delete" ? "0（削除）" : `${newQty}${matched.unit}`}`);

    if (!dryRun) {
      currentContent = updateFridgeLines(currentLines, matched, action, today);
      // Re-parse for next iteration (line indices may have shifted)
      const reparsed = parseFridgeStorage(currentContent);
      currentLines = reparsed.lines;
      currentItems = reparsed.items;
    }
  }

  if (dryRun) {
    console.log("[dry-run] fridge.md は更新されません");
    return;
  }

  writeFileSync(FRIDGE_PATH, currentContent, "utf-8");
  console.log("✅ fridge.md 更新完了");
  console.log("次のステップ: /fridge-sync で Notion に反映してください");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
