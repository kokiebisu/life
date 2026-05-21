#!/usr/bin/env bun
/**
 * fetch-ticker-news — 既存の fetch-news.ts と yahoo-finance2 の per-ticker search を組み合わせて
 * 各 ticker のニュースを返す。
 *
 * 1. 既存の RSS feed を ticker キーワードでフィルタ
 * 2. RSS マッチが 3 件未満の ticker に対しては yahoo-finance2.search() で補完（per-ticker news）
 */

import YahooFinance from "yahoo-finance2";
import { fetchNews } from "./fetch-news";
import type { NewsItem, TickerNews } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const PER_TICKER_FALLBACK_THRESHOLD = 3; // RSS マッチがこれ未満なら Yahoo per-ticker を追加取得
const PER_TICKER_NEWS_LIMIT = 5;
const NEWS_FRESHNESS_DAYS = 30;

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
  const rssMap = filterByTicker(allNews, keys);

  // For tickers with low RSS match, fetch per-ticker news via yahoo-finance2.search
  const cutoff = Date.now() - NEWS_FRESHNESS_DAYS * 24 * 3600 * 1000;
  await Promise.all(
    keys.map(async (key) => {
      const upper = key.ticker.toUpperCase();
      const existing = rssMap.get(upper) ?? [];
      if (existing.length >= PER_TICKER_FALLBACK_THRESHOLD) return;
      try {
        const result = await yahooFinance.search(key.ticker, { newsCount: PER_TICKER_NEWS_LIMIT });
        const yahooNews: NewsItem[] = (result.news ?? [])
          .filter((n: any) => {
            const ts = n.providerPublishTime ? new Date(n.providerPublishTime).getTime() : 0;
            return ts >= cutoff;
          })
          .map((n: any): NewsItem => ({
            source: n.publisher ?? "Yahoo Finance",
            category: "株",
            lang: "en",
            title: n.title ?? "",
            link: n.link ?? "",
            pubDate: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : "",
            summary: "",
          }));
        // Dedupe by link
        const seen = new Set(existing.map((i) => i.link));
        const merged = [...existing];
        for (const n of yahooNews) {
          if (!seen.has(n.link)) {
            merged.push(n);
            seen.add(n.link);
          }
        }
        rssMap.set(upper, merged.slice(0, PER_TICKER_NEWS_LIMIT));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ticker-news] ${key.ticker} yahoo search failed: ${msg}`);
      }
    }),
  );

  return rssMap;
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
