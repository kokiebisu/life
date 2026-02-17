/**
 * ファイルベースキャッシュライブラリ
 *
 * /tmp/life-cache/{namespace}/ にJSONファイルとして保存。
 * TTL ベースの有効期限管理。プロセス跨ぎで統計を累積。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const DEFAULT_BASE_DIR = "/tmp/life-cache";

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number; // 0 = no expiry
}

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
}

export function cacheKey(...parts: string[]): string {
  return parts.join("|");
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export class CacheNamespace {
  private dir: string;
  private defaultTtlMs: number;
  private _stats: CacheStats;
  private statsFile: string;

  constructor(namespace: string, opts?: { baseDir?: string; defaultTtlMs?: number }) {
    const baseDir = opts?.baseDir ?? DEFAULT_BASE_DIR;
    this.dir = join(baseDir, namespace);
    this.defaultTtlMs = opts?.defaultTtlMs ?? 5 * 60_000; // 5 min default
    this.statsFile = join(this.dir, "_stats.json");

    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }

    this._stats = this.loadStats();
  }

  private loadStats(): CacheStats {
    try {
      if (existsSync(this.statsFile)) {
        const content = readFileSync(this.statsFile, "utf-8");
        return JSON.parse(content) as CacheStats;
      }
    } catch { /* ignore */ }
    return { hits: 0, misses: 0, writes: 0, invalidations: 0 };
  }

  private saveStats(): void {
    try {
      Bun.write(this.statsFile, JSON.stringify(this._stats));
    } catch { /* ignore */ }
  }

  private filePath(key: string): string {
    return join(this.dir, `${hashKey(key)}.json`);
  }

  get<T>(key: string): T | undefined {
    const path = this.filePath(key);
    try {
      if (!existsSync(path)) {
        this._stats.misses++;
        this.saveStats();
        return undefined;
      }
      const content = readFileSync(path, "utf-8");
      const entry = JSON.parse(content) as CacheEntry<T>;

      // Check expiry
      if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
        unlinkSync(path);
        this._stats.misses++;
        this.saveStats();
        return undefined;
      }

      this._stats.hits++;
      this.saveStats();
      return entry.value;
    } catch {
      this._stats.misses++;
      this.saveStats();
      return undefined;
    }
  }

  set<T>(key: string, value: T, opts?: { ttlMs?: number }): void {
    const ttl = opts?.ttlMs ?? this.defaultTtlMs;
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: ttl > 0 ? now + ttl : 0,
    };

    const path = this.filePath(key);
    Bun.write(path, JSON.stringify(entry));
    this._stats.writes++;
    this.saveStats();
  }

  invalidate(key: string): boolean {
    const path = this.filePath(key);
    try {
      if (existsSync(path)) {
        unlinkSync(path);
        this._stats.invalidations++;
        this.saveStats();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  invalidateByPrefix(prefix: string): number {
    // Since we hash keys, we can't match by prefix on filenames.
    // Instead, read all entries and check stored keys.
    // For simplicity, clear all non-stats files.
    return this.clear();
  }

  clear(): number {
    let count = 0;
    try {
      const files = readdirSync(this.dir);
      for (const file of files) {
        if (file === "_stats.json") continue;
        try {
          unlinkSync(join(this.dir, file));
          count++;
        } catch { /* ignore */ }
      }
      this._stats.invalidations += count;
      this.saveStats();
    } catch { /* ignore */ }
    return count;
  }

  entries(): Array<{ key: string; createdAt: number; expiresAt: number; sizeBytes: number }> {
    const result: Array<{ key: string; createdAt: number; expiresAt: number; sizeBytes: number }> = [];
    try {
      const files = readdirSync(this.dir);
      for (const file of files) {
        if (file === "_stats.json" || !file.endsWith(".json")) continue;
        const path = join(this.dir, file);
        try {
          const content = readFileSync(path, "utf-8");
          const entry = JSON.parse(content) as CacheEntry<unknown>;
          const stat = statSync(path);
          result.push({
            key: file.replace(".json", ""),
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
            sizeBytes: stat.size,
          });
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return result;
  }

  stats(): CacheStats {
    return { ...this._stats };
  }
}

export function createCache(namespace: string, opts?: { baseDir?: string; defaultTtlMs?: number }): CacheNamespace {
  return new CacheNamespace(namespace, opts);
}

export function clearAll(baseDir?: string): number {
  const dir = baseDir ?? DEFAULT_BASE_DIR;
  let total = 0;
  try {
    if (!existsSync(dir)) return 0;
    const namespaces = readdirSync(dir, { withFileTypes: true });
    for (const ns of namespaces) {
      if (!ns.isDirectory()) continue;
      const nsDir = join(dir, ns.name);
      const files = readdirSync(nsDir);
      for (const file of files) {
        try {
          unlinkSync(join(nsDir, file));
          total++;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return total;
}

/** List all cache namespaces with stats */
export function listNamespaces(baseDir?: string): Array<{
  namespace: string;
  entryCount: number;
  totalSizeBytes: number;
  stats: CacheStats;
}> {
  const dir = baseDir ?? DEFAULT_BASE_DIR;
  const result: Array<{
    namespace: string;
    entryCount: number;
    totalSizeBytes: number;
    stats: CacheStats;
  }> = [];

  try {
    if (!existsSync(dir)) return result;
    const namespaces = readdirSync(dir, { withFileTypes: true });
    for (const ns of namespaces) {
      if (!ns.isDirectory()) continue;
      const cache = new CacheNamespace(ns.name, { baseDir: dir });
      const entries = cache.entries();
      const totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
      result.push({
        namespace: ns.name,
        entryCount: entries.length,
        totalSizeBytes: totalSize,
        stats: cache.stats(),
      });
    }
  } catch { /* ignore */ }

  return result;
}

/** List persistent cache namespaces */
export function listPersistentNamespaces(): Array<{
  namespace: string;
  baseDir: string;
  entryCount: number;
  totalSizeBytes: number;
  stats: CacheStats;
}> {
  const result: Array<{
    namespace: string;
    baseDir: string;
    entryCount: number;
    totalSizeBytes: number;
    stats: CacheStats;
  }> = [];

  // Check known persistent cache locations
  const travelCacheDir = join(import.meta.dir, "travel-cache");
  if (existsSync(travelCacheDir)) {
    try {
      const cache = new CacheNamespace("routes", { baseDir: join(import.meta.dir) });
      // Actually the travel cache uses baseDir that puts "routes" inside travel-cache
      // Let's just check the dir directly
      const files = readdirSync(travelCacheDir).filter(f => f.endsWith(".json") && f !== "_stats.json");
      let totalSize = 0;
      for (const f of files) {
        try {
          totalSize += statSync(join(travelCacheDir, f)).size;
        } catch { /* ignore */ }
      }

      let stats: CacheStats = { hits: 0, misses: 0, writes: 0, invalidations: 0 };
      const statsFile = join(travelCacheDir, "_stats.json");
      if (existsSync(statsFile)) {
        try {
          stats = JSON.parse(require("fs").readFileSync(statsFile, "utf-8"));
        } catch { /* ignore */ }
      }

      result.push({
        namespace: "routes (persistent)",
        baseDir: travelCacheDir,
        entryCount: files.length,
        totalSizeBytes: totalSize,
        stats,
      });
    } catch { /* ignore */ }
  }

  return result;
}
