#!/usr/bin/env bun
/**
 * キャッシュステータス確認・管理
 *
 * 使い方:
 *   bun run scripts/cache-status.ts              # ステータス表示
 *   bun run scripts/cache-status.ts --clear      # /tmp キャッシュクリア
 *   bun run scripts/cache-status.ts --clear --all # 永続キャッシュも含めてクリア
 *   bun run scripts/cache-status.ts --analyze    # ヒット率・節約効果分析
 *   bun run scripts/cache-status.ts --json       # JSON出力
 */

import { clearAll, listNamespaces, listPersistentNamespaces, CacheNamespace } from "./lib/cache";
import { existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Set<string>();
  for (const arg of args) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
  }
  return flags;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  const flags = parseArgs();
  const json = flags.has("json");
  const clear = flags.has("clear");
  const all = flags.has("all");
  const analyze = flags.has("analyze");

  if (clear) {
    const count = clearAll();
    let persistentCount = 0;

    if (all) {
      // Also clear persistent caches
      const travelCacheDir = join(import.meta.dir, "lib", "travel-cache");
      if (existsSync(travelCacheDir)) {
        try {
          const files = readdirSync(travelCacheDir);
          for (const file of files) {
            try {
              unlinkSync(join(travelCacheDir, file));
              persistentCount++;
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
    }

    if (json) {
      console.log(JSON.stringify({ cleared: count, persistentCleared: persistentCount }));
    } else {
      console.log(`Cleared ${count} cache entries from /tmp`);
      if (all) {
        console.log(`Cleared ${persistentCount} persistent cache entries`);
      }
    }
    return;
  }

  const namespaces = listNamespaces();
  const persistent = listPersistentNamespaces();

  if (json) {
    console.log(JSON.stringify({ namespaces, persistent }, null, 2));
    return;
  }

  if (analyze) {
    console.log("Cache Analysis");
    console.log("==============\n");

    let totalHits = 0, totalMisses = 0, totalWrites = 0;

    for (const ns of [...namespaces, ...persistent]) {
      const { hits, misses, writes } = ns.stats;
      totalHits += hits;
      totalMisses += misses;
      totalWrites += writes;

      const total = hits + misses;
      const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A";

      console.log(`[${ns.namespace}]`);
      console.log(`  Hit rate: ${hitRate}% (${hits} hits / ${misses} misses)`);
      console.log(`  Writes: ${writes}`);
      console.log(`  Entries: ${ns.entryCount} (${formatBytes(ns.totalSizeBytes)})`);

      // Estimate API calls saved
      if (hits > 0) {
        console.log(`  API calls saved: ~${hits}`);
      }
      console.log();
    }

    const grandTotal = totalHits + totalMisses;
    const overallRate = grandTotal > 0 ? ((totalHits / grandTotal) * 100).toFixed(1) : "N/A";
    console.log("--- Overall ---");
    console.log(`  Hit rate: ${overallRate}% (${totalHits} hits / ${totalMisses} misses)`);
    console.log(`  Total API calls saved: ~${totalHits}`);
    return;
  }

  // Default: status
  console.log("Cache Status");
  console.log("============\n");

  if (namespaces.length === 0 && persistent.length === 0) {
    console.log("No cache entries found.");
    return;
  }

  for (const ns of namespaces) {
    const { hits, misses } = ns.stats;
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A";
    console.log(`[${ns.namespace}] ${ns.entryCount} entries, ${formatBytes(ns.totalSizeBytes)}, hit rate: ${hitRate}%`);
  }

  for (const ns of persistent) {
    const { hits, misses } = ns.stats;
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A";
    console.log(`[${ns.namespace}] ${ns.entryCount} entries, ${formatBytes(ns.totalSizeBytes)}, hit rate: ${hitRate}%`);
  }

  const totalEntries = [...namespaces, ...persistent].reduce((sum, ns) => sum + ns.entryCount, 0);
  const totalSize = [...namespaces, ...persistent].reduce((sum, ns) => sum + ns.totalSizeBytes, 0);
  console.log(`\nTotal: ${totalEntries} entries, ${formatBytes(totalSize)}`);
}

main();
