#!/usr/bin/env bun
/**
 * fetch-ticker-news — 既存の fetch-news.ts を呼び、各 ticker / company name を含む
 * news items を ticker ごとに分類して返す。
 *
 * MVP: RSS フィルタのみ。Phase 2 で WebSearch 連携を追加予定。
 */

import { fetchNews } from "./fetch-news";
import type { NewsItem, TickerNews } from "./types";

export interface TickerKey {
  ticker: string;
  /**
   * Match against title/summary. Include ticker plus company short name(s).
   * If null, only the ticker symbol is matched.
   */
  aliases?: string[];
}

export async function fetchTickerNews(keys: TickerKey[]): Promise<Map<string, NewsItem[]>> {
  const allNews = await fetchNews();
  return filterByTicker(allNews, keys);
}

export function filterByTicker(news: NewsItem[], keys: TickerKey[]): Map<string, NewsItem[]> {
  const map = new Map<string, NewsItem[]>();
  for (const key of keys) {
    const candidates = [key.ticker, ...(key.aliases ?? [])]
      .map((s) => s.toLowerCase())
      .filter((s) => s.length >= 2);
    const matched: NewsItem[] = [];
    for (const n of news) {
      const hay = `${n.title} ${n.summary}`.toLowerCase();
      const tickerLower = key.ticker.toLowerCase();
      const tickerRe = new RegExp(`(^|[^a-z0-9])${tickerLower}([^a-z0-9]|$)`);
      const isTickerMatch = tickerRe.test(hay);
      const isAliasMatch = (key.aliases ?? []).some((a) => hay.includes(a.toLowerCase()));
      if (isTickerMatch || isAliasMatch) matched.push(n);
    }
    map.set(key.ticker.toUpperCase(), matched.slice(0, 5));
  }
  return map;
}

export function buildTickerNewsItems(news: Map<string, NewsItem[]>): TickerNews[] {
  return [...news.entries()].map(([ticker, items]) => ({ ticker, items }));
}

if (import.meta.main) {
  const tickers: TickerKey[] = process.argv.slice(2).map((arg) => {
    const [ticker, aliasStr] = arg.split(":");
    return { ticker, aliases: aliasStr ? aliasStr.split(",") : [] };
  });
  if (tickers.length === 0) {
    console.error("Usage: bun run scripts/investment/fetch-ticker-news.ts AAPL:Apple AMZN:Amazon TSM:Taiwan");
    process.exit(1);
  }
  const result = await fetchTickerNews(tickers);
  for (const [t, items] of result.entries()) {
    console.log(`\n=== ${t} (${items.length} items) ===`);
    items.forEach((i) => console.log(`  [${i.source}] ${i.title}`));
  }
}
