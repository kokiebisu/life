# Portfolio Rebalance Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `/rebalance` skill + `scripts/investment/rebalance.ts` orchestrator that reads `portfolio.csv` + `cash.csv` + optional `candidates/*.json`, evaluates each holding (BUY/ADD/HOLD/TRIM/SELL) with news-first priority and Investor Profile (30 / aggressive growth), allocates cash with position sizing rules, and writes a markdown report + Notion entry.

**Architecture:** 7-stage pipeline (load → fetch-news → fetch-data → sanity-check → evaluate-holdings → allocate-cash → write-report). Reuses existing `scripts/investment/` assets (`fetch-fundamentals.ts`, `sanity-check.ts`, `fetch-news.ts`, `util-json.ts`). Two new Claude-calling stages, one new news-filtering stage, four new deterministic stages, one new orchestrator.

**Tech Stack:** Bun (TypeScript runtime), yahoo-finance2 (financial data), Notion API (via `scripts/lib/notion.ts`), Claude API (via `scripts/lib/claude.ts`).

**Spec:** [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../specs/2026-05-21-portfolio-rebalance-command-design.md)

---

## Task 1: gitignore + directory scaffold

**Files:**
- Modify: `.gitignore`
- Create: `aspects/investment/candidates/.gitkeep`

- [ ] **Step 1: Add gitignore entries**

Edit `.gitignore`. Find the existing block:
```
# Investment portfolio holdings — 資産情報のためコミットしない
aspects/investment/portfolio.csv
```

Replace with:
```
# Investment portfolio holdings — 資産情報のためコミットしない
aspects/investment/portfolio.csv
aspects/investment/cash.csv
aspects/investment/candidates/
aspects/investment/reports/*-rebalance.md
```

- [ ] **Step 2: Create candidates directory**

```bash
mkdir -p /workspaces/life/aspects/investment/candidates
touch /workspaces/life/aspects/investment/candidates/.gitkeep
```

- [ ] **Step 3: Verify**

Run: `git check-ignore -v aspects/investment/cash.csv aspects/investment/candidates/foo.json aspects/investment/reports/2026-05-21-rebalance.md`
Expected: each line prefixed with `.gitignore:` and the matching rule (proves the patterns work). `.gitkeep` itself must NOT be ignored — run `git status --porcelain aspects/investment/candidates/.gitkeep` and expect `??` (untracked, not ignored).

- [ ] **Step 4: Commit**

```bash
git add .gitignore aspects/investment/candidates/.gitkeep
git commit -m "chore(investment): gitignore rebalance artifacts + candidates dir"
```

---

## Task 2: Extend types.ts for rebalance domain

**Files:**
- Modify: `scripts/investment/types.ts`

- [ ] **Step 1: Add new interfaces to types.ts**

Append to the end of `scripts/investment/types.ts`:

```typescript
// ============================================================
// Rebalance domain types
// ============================================================

export interface CashRow {
  currency: "USD" | "CAD";
  amount: number;
  updatedOn: string; // YYYY-MM-DD
}

export interface PortfolioRow {
  ticker: string;
  quantity: number;
  avgCost: number;
  currency: "USD" | "CAD";
  account: "TFSA" | "RRSP" | "Non-Registered" | "FHSA";
  acquiredOn: string;
  note: string;
}

export interface DiscoveryCandidate {
  ticker: string;
  thesis: string;
  confidence: "High" | "Med" | "Low";
  recentNews: { date: string; headline: string; url: string }[];
  sources: string[];
  strategy: string; // file name without date/ext, e.g. "growth"
  generatedAt: string; // ISO
}

export interface TickerNews {
  ticker: string;
  items: NewsItem[]; // filtered by ticker keyword
}

export type RebalanceAction = "BUY" | "ADD" | "HOLD" | "TRIM" | "SELL" | "SKIP";

export interface HoldingDecision {
  ticker: string;
  account: PortfolioRow["account"];
  quantity: number;
  avgCost: number;
  currency: PortfolioRow["currency"];
  action: RebalanceAction;
  confidence: "High" | "Med" | "Low";
  thesis: string;
  recentNews: NewsItem[]; // top 1-3, kept for report rendering
  sources: string[]; // at least 1 URL
  technicals: {
    return3m: number | null;
    return6m: number | null;
    return12m: number | null;
    drawdownPct: number | null;
  };
  fundamentals: Fundamentals;
  sanity?: SanityFlag;
}

export interface BuyDecision {
  ticker: string;
  source: "existing-holding" | string; // "existing-holding" for ADD, strategy name for BUY
  action: "BUY" | "ADD";
  amount: number;
  currency: "USD" | "CAD";
  confidence: "High" | "Med" | "Low";
  thesis: string;
  recentNews: NewsItem[] | { date: string; headline: string; url: string }[];
  sources: string[];
}

export interface PortfolioHealth {
  totalValueUSD: number;
  totalValueCAD: number;
  sectorBreakdown: { sector: string; pct: number }[];
  currencyBreakdown: { currency: string; pct: number }[];
  accountBreakdown: { account: string; pct: number }[];
}

export interface RebalanceReport {
  date: string;
  cash: CashRow[];
  cashStale: boolean; // updated_on > 30 days ago
  holdings: PortfolioRow[];
  portfolioHealth: PortfolioHealth;
  holdingDecisions: HoldingDecision[];
  buyDecisions: BuyDecision[];
  candidatesUsed: DiscoveryCandidate[];
  cashRemainder: { currency: "USD" | "CAD"; amount: number }[];
}
```

- [ ] **Step 2: Type-check by running an existing entrypoint**

Run: `bun run scripts/investment/daily-report.ts --help 2>&1 | head -5 || true`
Expected: no TypeScript errors (the `--help` flag isn't implemented but the script should still parse and exit early. The key is that `bun` doesn't print TS errors).

Then run: `bun run --no-install scripts/investment/types.ts || true` — `types.ts` exports only, so it should run silently with exit code 0. Any TS error will print to stderr.

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/types.ts
git commit -m "feat(investment): add rebalance domain types"
```

---

## Task 3: Add `rebalance` to Notion ScheduleDbName

**Files:**
- Modify: `scripts/lib/notion.ts`

- [ ] **Step 1: Locate the ScheduleDbName type**

Read `scripts/lib/notion.ts` line ~73:
```typescript
export type ScheduleDbName = "devotion" | "events" | "meals" | "groceries" | "todo" | "other" | "study" | "topic" | "interview" | "investment";
```

- [ ] **Step 2: Add `rebalance` to the union**

Replace the line with:
```typescript
export type ScheduleDbName = "devotion" | "events" | "meals" | "groceries" | "todo" | "other" | "study" | "topic" | "interview" | "investment" | "rebalance";
```

- [ ] **Step 3: Add the SCHEDULE_DB_CONFIGS entry**

Find the `SCHEDULE_DB_CONFIGS` object (around line 86) and add a new entry directly after the `investment:` line:

```typescript
  investment: { envKey: "NOTION_INVESTMENT_DB", titleProp: "名前", dateProp: "日付", descProp: "", defaultIcon: "📈" },
  rebalance:  { envKey: "NOTION_REBALANCE_DB", titleProp: "名前", dateProp: "日付", descProp: "", defaultIcon: "♻️" },
```

- [ ] **Step 4: Verify type-check**

Run: `bun run scripts/investment/daily-report.ts --dry-run 2>&1 | head -10`
Expected: starts the daily-report (or fails on network, not on type errors). The point is to confirm `notion.ts` still compiles.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/notion.ts
git commit -m "feat(notion): add rebalance schedule db config"
```

---

## Task 4: load-context.ts — read portfolio, cash, candidates

**Files:**
- Create: `scripts/investment/load-context.ts`

- [ ] **Step 1: Implement load-context.ts**

```typescript
#!/usr/bin/env bun
/**
 * Load rebalance context — portfolio.csv + cash.csv + candidates/*.json を読む。
 *
 * すべて gitignored の個人ファイル。存在しなければエラー。
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { PortfolioRow, CashRow, DiscoveryCandidate } from "./types";

const PORTFOLIO_PATH = "aspects/investment/portfolio.csv";
const CASH_PATH = "aspects/investment/cash.csv";
const CANDIDATES_DIR = "aspects/investment/candidates";
const CANDIDATES_TTL_DAYS = 14;
const CASH_STALE_DAYS = 30;

export interface LoadedContext {
  portfolio: PortfolioRow[];
  cash: CashRow[];
  cashStale: boolean;
  candidates: DiscoveryCandidate[];
}

function parseCsv(text: string): string[][] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.map((line) => {
    // Simple CSV split — no quoted fields needed for our schema
    return line.split(",").map((c) => c.trim());
  });
}

export function loadPortfolio(path = PORTFOLIO_PATH): PortfolioRow[] {
  if (!existsSync(path)) {
    throw new Error(
      `portfolio.csv not found at ${path}. See spec: docs/superpowers/specs/2026-05-21-investment-portfolio-csv-design.md`,
    );
  }
  const rows = parseCsv(readFileSync(path, "utf-8"));
  if (rows.length < 2) return [];
  const header = rows[0];
  const expected = ["ticker", "quantity", "avg_cost", "currency", "account", "acquired_on", "note"];
  for (const col of expected) {
    if (!header.includes(col)) {
      throw new Error(`portfolio.csv missing column "${col}". Got: ${header.join(",")}`);
    }
  }
  return rows.slice(1).map((r) => {
    const obj = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]));
    return {
      ticker: obj.ticker,
      quantity: parseFloat(obj.quantity),
      avgCost: parseFloat(obj.avg_cost),
      currency: obj.currency as PortfolioRow["currency"],
      account: obj.account as PortfolioRow["account"],
      acquiredOn: obj.acquired_on,
      note: obj.note ?? "",
    };
  });
}

export function loadCash(path = CASH_PATH): { cash: CashRow[]; stale: boolean } {
  if (!existsSync(path)) {
    const sample = `currency,amount,updated_on\nUSD,5000,${new Date().toISOString().slice(0, 10)}\nCAD,2000,${new Date().toISOString().slice(0, 10)}`;
    throw new Error(
      `cash.csv not found at ${path}.\n\nSample format:\n${sample}\n\nCreate this file with your current Wealthsimple Cash balances.`,
    );
  }
  const rows = parseCsv(readFileSync(path, "utf-8"));
  if (rows.length < 2) return { cash: [], stale: false };
  const header = rows[0];
  for (const col of ["currency", "amount", "updated_on"]) {
    if (!header.includes(col)) {
      throw new Error(`cash.csv missing column "${col}". Got: ${header.join(",")}`);
    }
  }
  const cash: CashRow[] = rows.slice(1).map((r) => {
    const obj = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]));
    return {
      currency: obj.currency as CashRow["currency"],
      amount: parseFloat(obj.amount),
      updatedOn: obj.updated_on,
    };
  });
  const now = Date.now();
  const stale = cash.some((c) => {
    const d = Date.parse(c.updatedOn);
    if (Number.isNaN(d)) return true;
    return (now - d) / (24 * 3600 * 1000) > CASH_STALE_DAYS;
  });
  return { cash, stale };
}

export function loadCandidates(dir = CANDIDATES_DIR): DiscoveryCandidate[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const now = Date.now();
  const out: DiscoveryCandidate[] = [];
  for (const file of files) {
    const fullPath = join(dir, file);
    try {
      const data = JSON.parse(readFileSync(fullPath, "utf-8")) as {
        generated_at: string;
        strategy: string;
        candidates: Array<{
          ticker: string;
          thesis: string;
          confidence: "High" | "Med" | "Low";
          recent_news?: { date: string; headline: string; url: string }[];
          sources: string[];
        }>;
      };
      const generated = Date.parse(data.generated_at);
      if (Number.isNaN(generated)) {
        console.warn(`[load-candidates] ${file}: invalid generated_at, skipping`);
        continue;
      }
      const ageDays = (now - generated) / (24 * 3600 * 1000);
      if (ageDays > CANDIDATES_TTL_DAYS) {
        console.warn(`[load-candidates] ${file}: too old (${ageDays.toFixed(0)}d > ${CANDIDATES_TTL_DAYS}d), skipping`);
        continue;
      }
      for (const c of data.candidates) {
        out.push({
          ticker: c.ticker,
          thesis: c.thesis,
          confidence: c.confidence,
          recentNews: c.recent_news ?? [],
          sources: c.sources ?? [],
          strategy: data.strategy,
          generatedAt: data.generated_at,
        });
      }
    } catch (err) {
      console.warn(`[load-candidates] ${file}: parse failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}

export function loadContext(opts: { portfolioPath?: string; cashPath?: string; candidatesPath?: string } = {}): LoadedContext {
  const portfolio = loadPortfolio(opts.portfolioPath);
  const { cash, stale } = loadCash(opts.cashPath);
  let candidates: DiscoveryCandidate[];
  if (opts.candidatesPath) {
    candidates = opts.candidatesPath.endsWith(".json")
      ? loadSingleCandidateFile(opts.candidatesPath)
      : loadCandidates(opts.candidatesPath);
  } else {
    candidates = loadCandidates();
  }
  return { portfolio, cash, cashStale: stale, candidates };
}

function loadSingleCandidateFile(path: string): DiscoveryCandidate[] {
  // Reuse the loop body from loadCandidates by faking a directory of one file
  const dirOfOne = path; // path is full file path
  if (!existsSync(dirOfOne)) {
    console.warn(`[load-candidates] explicit file not found: ${dirOfOne}`);
    return [];
  }
  try {
    const data = JSON.parse(readFileSync(dirOfOne, "utf-8")) as {
      generated_at: string;
      strategy: string;
      candidates: Array<{
        ticker: string;
        thesis: string;
        confidence: "High" | "Med" | "Low";
        recent_news?: { date: string; headline: string; url: string }[];
        sources: string[];
      }>;
    };
    return data.candidates.map((c) => ({
      ticker: c.ticker,
      thesis: c.thesis,
      confidence: c.confidence,
      recentNews: c.recent_news ?? [],
      sources: c.sources ?? [],
      strategy: data.strategy,
      generatedAt: data.generated_at,
    }));
  } catch (err) {
    console.warn(`[load-candidates] ${dirOfOne}: parse failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

if (import.meta.main) {
  // Sample harness — runs against real files in repo
  try {
    const ctx = loadContext();
    console.log(JSON.stringify(ctx, null, 2));
    if (ctx.cashStale) {
      console.error(`⚠️  cash.csv は ${CASH_STALE_DAYS} 日以上更新されていません`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Create test fixtures**

```bash
mkdir -p /tmp/rebalance-test
cat > /tmp/rebalance-test/portfolio.csv <<'EOF'
ticker,quantity,avg_cost,currency,account,acquired_on,note
AAPL,7.0031,271.07,USD,TFSA,2026-05-21,
AMZN,19,234.16,USD,TFSA,2026-05-21,
EOF
cat > /tmp/rebalance-test/cash.csv <<'EOF'
currency,amount,updated_on
USD,5000,2026-05-21
CAD,2000,2026-05-21
EOF
mkdir -p /tmp/rebalance-test/candidates
cat > /tmp/rebalance-test/candidates/2026-05-20-growth.json <<'EOF'
{
  "generated_at": "2026-05-20T09:00:00+09:00",
  "strategy": "growth",
  "candidates": [
    {
      "ticker": "TSM",
      "thesis": "AI semis tailwind",
      "confidence": "High",
      "recent_news": [{"date": "2026-05-18", "headline": "TSMC raises capex", "url": "https://example.com/tsm"}],
      "sources": ["https://example.com/tsm"]
    }
  ]
}
EOF
```

- [ ] **Step 3: Run with test fixtures**

```bash
bun -e 'import { loadContext } from "/workspaces/life/scripts/investment/load-context"; console.log(JSON.stringify(loadContext({ portfolioPath: "/tmp/rebalance-test/portfolio.csv", cashPath: "/tmp/rebalance-test/cash.csv", candidatesPath: "/tmp/rebalance-test/candidates" }), null, 2));'
```

Expected: JSON output with 2 portfolio rows (AAPL, AMZN), 2 cash rows (USD, CAD), `cashStale: false`, 1 candidate (TSM).

- [ ] **Step 4: Test stale cash detection**

```bash
sed -i 's/2026-05-21/2025-01-01/' /tmp/rebalance-test/cash.csv
bun -e 'import { loadContext } from "/workspaces/life/scripts/investment/load-context"; console.log(loadContext({ portfolioPath: "/tmp/rebalance-test/portfolio.csv", cashPath: "/tmp/rebalance-test/cash.csv", candidatesPath: "/tmp/rebalance-test/candidates" }).cashStale);'
```

Expected: `true`.

- [ ] **Step 5: Test old candidate is skipped**

```bash
# Make candidate 30 days old
cat > /tmp/rebalance-test/candidates/2026-05-20-growth.json <<'EOF'
{
  "generated_at": "2026-04-01T09:00:00+09:00",
  "strategy": "growth",
  "candidates": [{"ticker": "TSM", "thesis": "x", "confidence": "High", "sources": []}]
}
EOF
bun -e 'import { loadCandidates } from "/workspaces/life/scripts/investment/load-context"; console.log(loadCandidates("/tmp/rebalance-test/candidates"));'
```

Expected: `[]` (empty array — file skipped due to TTL) and a warning printed to stderr.

- [ ] **Step 6: Cleanup test fixtures and commit**

```bash
rm -rf /tmp/rebalance-test
git add scripts/investment/load-context.ts
git commit -m "feat(investment): add load-context for portfolio + cash + candidates"
```

---

## Task 5: fetch-ticker-news.ts — filter general news per ticker

**Files:**
- Create: `scripts/investment/fetch-ticker-news.ts`

- [ ] **Step 1: Implement fetch-ticker-news.ts**

```typescript
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
      // Word-boundary match for ticker to avoid "AAPL" matching "Apple's"
      const tickerLower = key.ticker.toLowerCase();
      const tickerRe = new RegExp(`(^|[^a-z0-9])${tickerLower}([^a-z0-9]|$)`);
      const isTickerMatch = tickerRe.test(hay);
      const isAliasMatch = (key.aliases ?? []).some((a) => hay.includes(a.toLowerCase()));
      if (isTickerMatch || isAliasMatch) matched.push(n);
    }
    map.set(key.ticker.toUpperCase(), matched.slice(0, 5)); // cap at 5 per ticker
  }
  return map;
}

export function buildTickerNewsItems(news: Map<string, NewsItem[]>): TickerNews[] {
  return [...news.entries()].map(([ticker, items]) => ({ ticker, items }));
}

if (import.meta.main) {
  const tickers: TickerKey[] = process.argv.slice(2).map((arg) => {
    // Format: AAPL or AAPL:Apple,iPhone
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
```

- [ ] **Step 2: Verify with a unit-style test of filterByTicker**

```bash
bun -e '
import { filterByTicker } from "/workspaces/life/scripts/investment/fetch-ticker-news";
const news = [
  { source: "X", category: "株", lang: "en", title: "AAPL beats earnings", link: "", pubDate: "", summary: "" },
  { source: "X", category: "株", lang: "en", title: "Microsoft launches MSFT update", link: "", pubDate: "", summary: "Microsoft new product" },
  { source: "X", category: "株", lang: "en", title: "TSMC ramps 3nm", link: "", pubDate: "", summary: "Taiwan Semiconductor" },
];
const result = filterByTicker(news as any, [
  { ticker: "AAPL", aliases: ["Apple"] },
  { ticker: "MSFT", aliases: ["Microsoft"] },
  { ticker: "TSM", aliases: ["TSMC", "Taiwan Semi"] },
]);
console.log("AAPL:", result.get("AAPL")?.map(n => n.title));
console.log("MSFT:", result.get("MSFT")?.map(n => n.title));
console.log("TSM:", result.get("TSM")?.map(n => n.title));
'
```

Expected:
```
AAPL: [ "AAPL beats earnings" ]
MSFT: [ "Microsoft launches MSFT update" ]
TSM: [ "TSMC ramps 3nm" ]
```

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/fetch-ticker-news.ts
git commit -m "feat(investment): add fetch-ticker-news for per-ticker RSS filter"
```

---

## Task 6: fetch-price-history.ts — compute 3/6/12-month returns + drawdown

**Files:**
- Create: `scripts/investment/fetch-price-history.ts`

- [ ] **Step 1: Implement fetch-price-history.ts**

```typescript
#!/usr/bin/env bun
/**
 * fetch-price-history — 各 ticker の 12 ヶ月価格履歴を取得し、3/6/12 ヶ月リターン + drawdown を返す。
 */

import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface PriceMetrics {
  ticker: string;
  return3m: number | null;
  return6m: number | null;
  return12m: number | null;
  drawdownPct: number | null; // 12-month high からの drawdown
  currentPrice: number | null;
  fetchError?: string;
}

const HISTORY_DAYS = 380; // ~ 1 year + buffer

export async function fetchPriceHistory(tickers: string[]): Promise<Map<string, PriceMetrics>> {
  const out = new Map<string, PriceMetrics>();
  const now = new Date();
  const start = new Date(now.getTime() - HISTORY_DAYS * 24 * 3600 * 1000);

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const hist = await yahooFinance.chart(ticker, { period1: start, period2: now, interval: "1d" });
        const quotes = (hist.quotes ?? []).filter((q: any) => q.close !== null && q.close !== undefined);
        if (quotes.length < 30) {
          out.set(ticker.toUpperCase(), {
            ticker,
            return3m: null,
            return6m: null,
            return12m: null,
            drawdownPct: null,
            currentPrice: null,
            fetchError: `only ${quotes.length} data points`,
          });
          return;
        }
        const closes = quotes.map((q: any) => q.close as number);
        const lastClose = closes[closes.length - 1];
        const high12m = Math.max(...closes);
        const drawdownPct = ((lastClose - high12m) / high12m) * 100;

        const pickReturn = (daysAgo: number): number | null => {
          const idx = quotes.length - 1 - daysAgo;
          if (idx < 0) return null;
          const prev = closes[idx];
          if (prev <= 0) return null;
          return ((lastClose - prev) / prev) * 100;
        };

        out.set(ticker.toUpperCase(), {
          ticker,
          return3m: pickReturn(63),  // ~3 trading months
          return6m: pickReturn(126),
          return12m: pickReturn(252),
          drawdownPct,
          currentPrice: lastClose,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[price-history] ${ticker} failed: ${msg}`);
        out.set(ticker.toUpperCase(), {
          ticker,
          return3m: null,
          return6m: null,
          return12m: null,
          drawdownPct: null,
          currentPrice: null,
          fetchError: msg,
        });
      }
    }),
  );

  return out;
}

if (import.meta.main) {
  const tickers = process.argv.slice(2);
  if (tickers.length === 0) {
    console.error("Usage: bun run scripts/investment/fetch-price-history.ts AAPL AMZN");
    process.exit(1);
  }
  const result = await fetchPriceHistory(tickers);
  for (const [t, m] of result.entries()) {
    if (m.fetchError) {
      console.log(`${t}: ERROR ${m.fetchError}`);
    } else {
      console.log(`${t}: price=${m.currentPrice?.toFixed(2)} 3m=${m.return3m?.toFixed(1)}% 6m=${m.return6m?.toFixed(1)}% 12m=${m.return12m?.toFixed(1)}% drawdown=${m.drawdownPct?.toFixed(1)}%`);
    }
  }
}
```

- [ ] **Step 2: Verify against live yahoo-finance2**

```bash
bun run scripts/investment/fetch-price-history.ts AAPL MSFT
```

Expected: 2 lines, each with `price=` and `3m=`/`6m=`/`12m=`/`drawdown=` percentages. Values vary but should be finite numbers.

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/fetch-price-history.ts
git commit -m "feat(investment): add fetch-price-history for 3/6/12m returns + drawdown"
```

---

## Task 7: evaluate-holdings.ts — Claude prompt for Hold/Trim/Sell/Add

**Files:**
- Create: `scripts/investment/evaluate-holdings.ts`

- [ ] **Step 1: Implement evaluate-holdings.ts**

```typescript
/**
 * evaluate-holdings — 各保有銘柄について Hold / Trim / Sell / Add を判定する。
 *
 * 直近ニュースを最優先軸とし、Investor Profile (30 / 中長期 / aggressive growth) を
 * プロンプトで明示。Sources URL 必須。
 */

import { callClaude } from "../lib/claude";
import { extractJson } from "./util-json";
import type {
  PortfolioRow,
  Fundamentals,
  NewsItem,
  SanityFlag,
  HoldingDecision,
  RebalanceAction,
} from "./types";
import type { PriceMetrics } from "./fetch-price-history";

const SYSTEM = `あなたは 30 歳・中長期投資・aggressive growth tilt の投資家のためのポートフォリオ・アドバイザーです。

**Investor Profile（必ず遵守）:**
- リスク許容度: 高い。横ばい配当株より成長株を優先する
- 時間軸: 3 ヶ月〜数年の中長期。日次トレードではない
- バイアス: 売上成長率・カタリスト・テーマ性を重視。バリュー指標は下値リスクのスクリーニング用
- 集中度: やや集中許容（1 銘柄 max 15% portfolio、確信があれば厚く張ってよい）
- 配当志向: 弱い

**評価軸の優先順位:**
1. **直近のニュース・sentiment（最優先）** — 過去 30 日の earnings、ガイダンス、規制、訴訟、insider 取引、アナリスト評価変更。カタリストの有無が判定の主軸
2. テクニカル / 価格モメンタム — 3/6/12 ヶ月リターン、drawdown
3. ファンダメンタル — 売上成長率を最重視（低 PER ≠ 買い）
4. portfolio 全体の健全性 — aggressive profile 前提で多少の偏りは許容

**重要ルール:**
- 直近 30 日にネガティブなニュース（earnings miss + ガイダンス下方修正、訴訟、規制ショック等）がある銘柄は、ファンダが割安でも SELL / TRIM を優先する
- 直近に強いカタリストが出た銘柄は、高 PER でも HOLD / ADD を許容する
- **すべての thesis に少なくとも 1 つの URL ソースを付ける。** ソース無しの判定は不可
- ニュースが取得できなかった銘柄は Action=HOLD、Confidence=Low とし、thesis に「ニュース取得失敗、判定保留」と書く
- sanity-check 警告がある銘柄は、その警告内容を thesis の最上位根拠として引用する（無視しない）`;

interface HoldingInput {
  row: PortfolioRow;
  fundamentals: Fundamentals;
  news: NewsItem[];
  technicals: PriceMetrics;
  sanity?: SanityFlag;
}

function fmt(v: number | null, mode: "raw" | "pct" | "money" = "raw"): string {
  if (v === null) return "—";
  if (mode === "pct") return `${(v * 100).toFixed(1)}%`;
  if (mode === "money") {
    if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    return v.toFixed(0);
  }
  return Number.isInteger(v) ? v.toString() : v.toFixed(2);
}

function formatHolding(h: HoldingInput): string {
  const lines: string[] = [];
  lines.push(`## ${h.row.ticker} (${h.row.account})`);
  lines.push(`- 保有: ${h.row.quantity} 株 @ avg ${fmt(h.row.avgCost)} ${h.row.currency}`);
  lines.push(`- 現在価格: ${fmt(h.technicals.currentPrice)} ${h.fundamentals.currency}`);
  lines.push(`- セクター: ${h.fundamentals.sector ?? "—"} / 業種: ${h.fundamentals.industry ?? "—"}`);
  lines.push(`- ファンダ: PER(trail/fwd)=${fmt(h.fundamentals.trailingPE)}/${fmt(h.fundamentals.forwardPE)}, PBR=${fmt(h.fundamentals.priceToBook)}, ROE=${fmt(h.fundamentals.returnOnEquity, "pct")}, 配当=${fmt(h.fundamentals.dividendYield, "pct")}, D/E=${fmt(h.fundamentals.debtToEquity)}, FCF=${fmt(h.fundamentals.freeCashFlow, "money")}`);
  lines.push(`- テクニカル: 3m=${fmt(h.technicals.return3m)}%, 6m=${fmt(h.technicals.return6m)}%, 12m=${fmt(h.technicals.return12m)}%, drawdown(12m高値)=${fmt(h.technicals.drawdownPct)}%`);
  if (h.sanity && h.sanity.warnings.length > 0) {
    lines.push(`- 🚨 sanity-check 警告:`);
    h.sanity.warnings.forEach((w) => lines.push(`    - ${w}`));
  }
  if (h.news.length === 0) {
    lines.push(`- 直近ニュース: 取得できず`);
  } else {
    lines.push(`- 直近ニュース（${h.news.length} 件）:`);
    h.news.slice(0, 5).forEach((n) => {
      lines.push(`    - [${n.pubDate}] ${n.title} — ${n.link}`);
    });
  }
  return lines.join("\n");
}

export async function evaluateHoldings(inputs: HoldingInput[]): Promise<HoldingDecision[]> {
  if (inputs.length === 0) return [];

  const portfolioSection = inputs.map(formatHolding).join("\n\n");

  const userPrompt = `以下は現在の保有銘柄リストです。各銘柄について Hold / Trim / Sell / Add のいずれかを判定してください。

${portfolioSection}

**各銘柄について以下を判定:**

- \`action\`: "HOLD" | "TRIM" | "SELL" | "ADD"
- \`confidence\`: "High" | "Med" | "Low"
- \`thesis\`: なぜその action か。**直近ニュースを最上位根拠として引用**。2-4 文
- \`sources\`: thesis の根拠となる URL を 1 つ以上（ニュース項目の link を使用、空配列は不可）

**判定の優先順位（最優先 → 補助）:**
1. 直近 30 日のニュース・カタリスト
2. テクニカル / 価格モメンタム
3. ファンダメンタル（成長率重視、PER は割高警告として）
4. sanity-check 警告（あれば必ず最上位根拠として参照）

ニュースが 0 件の銘柄は action=HOLD, confidence=Low、thesis に「ニュース取得失敗、判定保留」と明記し、sources はファンダの参照として yahoo finance URL "https://finance.yahoo.com/quote/<ticker>" を使ってよい。

**出力は以下の JSON のみ**（コードフェンス・前置きなし）:
{
  "decisions": [
    {
      "ticker": "AAPL",
      "action": "HOLD",
      "confidence": "High",
      "thesis": "...",
      "sources": ["https://...", "https://..."]
    }
  ]
}`;

  const raw = await callClaude(
    [{ role: "user", content: userPrompt }],
    { system: SYSTEM, maxTurns: 1, model: "claude-opus-4-7", maxTokens: 8192 },
  );

  const parsed = extractJson(raw) as {
    decisions: Array<{
      ticker: string;
      action: RebalanceAction;
      confidence: "High" | "Med" | "Low";
      thesis: string;
      sources: string[];
    }>;
  };

  if (!parsed.decisions || !Array.isArray(parsed.decisions)) {
    throw new Error(`evaluate-holdings: invalid JSON from Claude:\n${raw}`);
  }

  const inputMap = new Map(inputs.map((h) => [h.row.ticker.toUpperCase(), h]));
  return parsed.decisions
    .map((d): HoldingDecision | null => {
      const h = inputMap.get(d.ticker.toUpperCase());
      if (!h) return null;
      if (!d.sources || d.sources.length === 0) {
        console.warn(`[evaluate-holdings] ${d.ticker}: no sources, marking confidence Low`);
        d.sources = [`https://finance.yahoo.com/quote/${d.ticker}`];
      }
      return {
        ticker: h.row.ticker,
        account: h.row.account,
        quantity: h.row.quantity,
        avgCost: h.row.avgCost,
        currency: h.row.currency,
        action: d.action,
        confidence: d.confidence,
        thesis: d.thesis,
        recentNews: h.news.slice(0, 3),
        sources: d.sources,
        technicals: {
          return3m: h.technicals.return3m,
          return6m: h.technicals.return6m,
          return12m: h.technicals.return12m,
          drawdownPct: h.technicals.drawdownPct,
        },
        fundamentals: h.fundamentals,
        sanity: h.sanity,
      };
    })
    .filter((d): d is HoldingDecision => d !== null);
}
```

- [ ] **Step 2: Sanity check — confirm callClaude signature**

Run: `grep -A5 "export async function callClaude" /workspaces/life/scripts/lib/claude.ts | head -20`
Expected: confirms parameter shape `(messages, options)`. If the signature differs from what this script uses, adjust the call site here before continuing.

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/evaluate-holdings.ts
git commit -m "feat(investment): add evaluate-holdings Claude prompt"
```

---

## Task 8: allocate-cash.ts — Claude prompt for cash distribution

**Files:**
- Create: `scripts/investment/allocate-cash.ts`

- [ ] **Step 1: Implement allocate-cash.ts**

```typescript
/**
 * allocate-cash — cash 残高を Add / Buy 候補に position sizing ルールで配分する。
 *
 * Investor Profile (aggressive growth) に合わせて緩めの sizing。
 */

import { callClaude } from "../lib/claude";
import { extractJson } from "./util-json";
import type {
  CashRow,
  HoldingDecision,
  DiscoveryCandidate,
  BuyDecision,
  PortfolioRow,
} from "./types";

const SYSTEM = `あなたは 30 歳・中長期・aggressive growth tilt の投資家の cash 配分担当です。
保有銘柄評価で ADD が付いた銘柄と、discovery skill が提案した BUY 候補に、現金を配分します。`;

interface AllocateInput {
  cash: CashRow[];
  portfolioTotals: { ticker: string; currency: "USD" | "CAD"; valueInCurrency: number; sector: string | null }[];
  portfolioTotalUSD: number;
  portfolioTotalCAD: number;
  adds: HoldingDecision[]; // action === "ADD"
  buys: DiscoveryCandidate[];
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return Number.isInteger(v) ? v.toString() : v.toFixed(2);
}

function buildPrompt(input: AllocateInput): string {
  const cashLines = input.cash.map((c) => `- ${c.currency}: $${fmt(c.amount)}`).join("\n");
  const sectorTotals = new Map<string, number>();
  for (const t of input.portfolioTotals) {
    const k = t.sector ?? "Unknown";
    sectorTotals.set(k, (sectorTotals.get(k) ?? 0) + t.valueInCurrency);
  }
  const totalAll = input.portfolioTotalUSD + input.portfolioTotalCAD; // rough — sizing rules use this
  const sectorPct = [...sectorTotals.entries()]
    .map(([s, v]) => `  - ${s}: ${((v / totalAll) * 100).toFixed(1)}%`)
    .join("\n");

  const addLines = input.adds.length === 0
    ? "（ADD 推奨なし）"
    : input.adds.map((a) => `- ${a.ticker} (${a.currency}, ${a.account}) confidence=${a.confidence}: ${a.thesis}`).join("\n");
  const buyLines = input.buys.length === 0
    ? "（BUY 候補なし）"
    : input.buys.map((b) => `- ${b.ticker} (strategy=${b.strategy}) confidence=${b.confidence}: ${b.thesis} | sources=${b.sources.slice(0, 2).join(", ")}`).join("\n");

  return `**現在の cash:**
${cashLines}

**Portfolio 概況:**
- 合計（rough、USD と CAD を単純合算）: $${fmt(totalAll)}
- セクター分布:
${sectorPct}

**ADD 推奨銘柄（保有銘柄の買い増し候補）:**
${addLines}

**BUY 候補（discovery skill 出力、新規銘柄）:**
${buyLines}

**Position Sizing ルール（必ず遵守。30 歳 / aggressive growth 向けに緩め）:**
- 1 銘柄あたり portfolio 占有率 ≤ 15%（既存保有分も含めて）
- 1 セクター ≤ 40%
- 1 銘柄あたり cash の配分 ≤ 60%
- confidence Low の銘柄には配分しない
- currency マッチ厳守: USD cash → USD 銘柄、CAD cash → CAD 銘柄
- cash 残し率 0% でも OK。ただし confidence High の候補が無い currency は残してよい

ルールに違反する候補は配分せず thesis に「制約違反のため見送り」と書く。

**出力は以下の JSON のみ**（コードフェンス・前置きなし）:
{
  "buyDecisions": [
    {
      "ticker": "TSM",
      "source": "existing-holding" or strategy name (例: "growth"),
      "action": "BUY" or "ADD",
      "amount": 1200,
      "currency": "USD",
      "confidence": "High",
      "thesis": "配分根拠（ADD/BUY それぞれの thesis を 2-3 文）",
      "sources": ["https://..."]
    }
  ],
  "remainder": [
    {"currency": "USD", "amount": 1500},
    {"currency": "CAD", "amount": 2000}
  ]
}

source 値の規則:
- ADD の場合: "existing-holding"
- BUY の場合: 候補の strategy 名（例: "growth", "value"）`;
}

export async function allocateCash(input: AllocateInput): Promise<{ buyDecisions: BuyDecision[]; remainder: { currency: "USD" | "CAD"; amount: number }[] }> {
  if (input.adds.length === 0 && input.buys.length === 0) {
    return { buyDecisions: [], remainder: input.cash.map((c) => ({ currency: c.currency, amount: c.amount })) };
  }

  const userPrompt = buildPrompt(input);

  const raw = await callClaude(
    [{ role: "user", content: userPrompt }],
    { system: SYSTEM, maxTurns: 1, model: "claude-opus-4-7", maxTokens: 4096 },
  );

  const parsed = extractJson(raw) as {
    buyDecisions: Array<{
      ticker: string;
      source: string;
      action: "BUY" | "ADD";
      amount: number;
      currency: "USD" | "CAD";
      confidence: "High" | "Med" | "Low";
      thesis: string;
      sources: string[];
    }>;
    remainder: { currency: "USD" | "CAD"; amount: number }[];
  };

  if (!parsed.buyDecisions || !Array.isArray(parsed.buyDecisions)) {
    throw new Error(`allocate-cash: invalid JSON from Claude:\n${raw}`);
  }

  // Map thesis enrichment from input candidates / adds (preserve recent news)
  const addMap = new Map(input.adds.map((a) => [a.ticker.toUpperCase(), a]));
  const buyMap = new Map(input.buys.map((b) => [b.ticker.toUpperCase(), b]));

  const buyDecisions: BuyDecision[] = parsed.buyDecisions.map((d) => {
    const tickerUpper = d.ticker.toUpperCase();
    const add = addMap.get(tickerUpper);
    const buy = buyMap.get(tickerUpper);
    const recentNews = add ? add.recentNews : buy ? buy.recentNews : [];
    const baseSources = add ? add.sources : buy ? buy.sources : [];
    const mergedSources = [...new Set([...d.sources, ...baseSources])];
    return {
      ticker: d.ticker,
      source: d.source as BuyDecision["source"],
      action: d.action,
      amount: d.amount,
      currency: d.currency,
      confidence: d.confidence,
      thesis: d.thesis,
      recentNews,
      sources: mergedSources.length > 0 ? mergedSources : ["https://finance.yahoo.com/quote/" + d.ticker],
    };
  });

  return { buyDecisions, remainder: parsed.remainder ?? [] };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/investment/allocate-cash.ts
git commit -m "feat(investment): add allocate-cash Claude prompt"
```

---

## Task 9: write-rebalance-report.ts — render markdown

**Files:**
- Create: `scripts/investment/write-rebalance-report.ts`

- [ ] **Step 1: Implement write-rebalance-report.ts**

```typescript
/**
 * write-rebalance-report — RebalanceReport を markdown に整形してファイル出力する。
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { RebalanceReport, HoldingDecision, BuyDecision, NewsItem } from "./types";

const REPORTS_DIR = "aspects/investment/reports";

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function fmtPctRaw(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null, mode: "raw" | "money" = "raw"): string {
  if (v === null) return "—";
  if (mode === "money") {
    if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    return v.toFixed(0);
  }
  return Number.isInteger(v) ? v.toString() : v.toFixed(2);
}

function fmtMoney(v: number): string {
  return `$${v.toLocaleString("en-US")}`;
}

function newsLinks(items: NewsItem[] | { date: string; headline: string; url: string }[]): string[] {
  return items.slice(0, 3).map((n) => {
    if ("title" in n) {
      return `${n.pubDate}: ${n.title} ([source](${n.link}))`;
    }
    return `${n.date}: ${n.headline} ([source](${n.url}))`;
  });
}

function renderHoldingBlock(d: HoldingDecision): string {
  const lines: string[] = [];
  const flagged = d.sanity && d.sanity.warnings.length > 0 ? " 🚨" : "";
  lines.push(`### ${d.ticker} — ${d.action}${flagged}（Confidence: ${d.confidence}）`);
  lines.push(`- **Qty:** ${d.quantity} / **Avg Cost:** $${fmtNum(d.avgCost)} ${d.currency} / **Account:** ${d.account}`);
  if (d.sanity && d.sanity.warnings.length > 0) {
    lines.push(`- **🚨 sanity-check:** ${d.sanity.warnings.join(" / ")}`);
  }
  if (d.recentNews.length === 0) {
    lines.push(`- **直近ニュース:** 取得できず`);
  } else {
    lines.push(`- **直近ニュース（30日）:**`);
    newsLinks(d.recentNews).forEach((l) => lines.push(`  - ${l}`));
  }
  lines.push(`- **テクニカル:** 3m=${fmtPct(d.technicals.return3m)} / 6m=${fmtPct(d.technicals.return6m)} / 12m=${fmtPct(d.technicals.return12m)} / drawdown=${fmtPct(d.technicals.drawdownPct)}`);
  lines.push(`- **ファンダ:** PER(trail/fwd)=${fmtNum(d.fundamentals.trailingPE)}/${fmtNum(d.fundamentals.forwardPE)}, ROE=${fmtPctRaw(d.fundamentals.returnOnEquity)}, FCF=${fmtNum(d.fundamentals.freeCashFlow, "money")}`);
  lines.push(`- **Thesis:** ${d.thesis}`);
  lines.push(`- **Sources:** ${d.sources.map((s, i) => `[${i + 1}](${s})`).join(" ")}`);
  return lines.join("\n");
}

function renderBuyBlock(b: BuyDecision): string {
  const lines: string[] = [];
  lines.push(`### ${b.ticker} — ${b.action} ${fmtMoney(b.amount)} ${b.currency}（Confidence: ${b.confidence}）`);
  lines.push(`- **Source:** ${b.source}`);
  if (b.recentNews.length === 0) {
    lines.push(`- **直近ニュース:** —`);
  } else {
    lines.push(`- **直近ニュース:**`);
    newsLinks(b.recentNews as NewsItem[]).forEach((l) => lines.push(`  - ${l}`));
  }
  lines.push(`- **Thesis:** ${b.thesis}`);
  lines.push(`- **Sources:** ${b.sources.map((s, i) => `[${i + 1}](${s})`).join(" ")}`);
  return lines.join("\n");
}

export function renderRebalanceMarkdown(report: RebalanceReport): string {
  const lines: string[] = [];
  lines.push(`# Portfolio Rebalance — ${report.date}`);
  lines.push("");
  lines.push(`> ⚠️ これは投資助言ではありません。最終的な投資判断はユーザー本人が公式 IR / 証券会社の分析で確認した上で行ってください。`);
  lines.push(`> Investor Profile: 30 歳 / 中長期 / aggressive growth`);
  lines.push("");

  const flagged = report.holdingDecisions.filter((d) => d.sanity && d.sanity.warnings.length > 0);
  const counts = {
    BUY: report.buyDecisions.filter((b) => b.action === "BUY").length,
    ADD: report.buyDecisions.filter((b) => b.action === "ADD").length,
    HOLD: report.holdingDecisions.filter((d) => d.action === "HOLD").length,
    TRIM: report.holdingDecisions.filter((d) => d.action === "TRIM").length,
    SELL: report.holdingDecisions.filter((d) => d.action === "SELL").length,
  };
  lines.push("## Summary");
  lines.push(`- 保有銘柄: ${report.holdingDecisions.length}（うち sanity-check 警告: ${flagged.length}）`);
  const cashStr = report.cash.map((c) => `${fmtMoney(c.amount)} ${c.currency}`).join(" / ");
  const cashDate = report.cash.length > 0 ? report.cash[0].updatedOn : "—";
  lines.push(`- Cash: ${cashStr}（cash.csv: ${cashDate} 更新${report.cashStale ? " ⚠️ stale" : ""}）`);
  lines.push(`- 推奨 actions: BUY ${counts.BUY} / ADD ${counts.ADD} / HOLD ${counts.HOLD} / TRIM ${counts.TRIM} / SELL ${counts.SELL}`);
  lines.push("");

  if (flagged.length > 0) {
    lines.push(`> 🚨 **sanity-check 警告銘柄**: ${flagged.map((d) => d.ticker).join(", ")}。直近の値動き異常を確認してください。`);
    lines.push("");
  }

  lines.push("## Portfolio Health");
  for (const s of report.portfolioHealth.sectorBreakdown.slice(0, 5)) {
    lines.push(`- セクター: ${s.sector} ${s.pct.toFixed(1)}%`);
  }
  lines.push(`- Currency: ${report.portfolioHealth.currencyBreakdown.map((c) => `${c.currency} ${c.pct.toFixed(1)}%`).join(" / ")}`);
  lines.push(`- 口座分散: ${report.portfolioHealth.accountBreakdown.map((a) => `${a.account} ${a.pct.toFixed(1)}%`).join(" / ")}`);
  lines.push("");

  lines.push("## Holdings Review");
  lines.push("");
  for (const d of report.holdingDecisions) {
    lines.push(renderHoldingBlock(d));
    lines.push("");
  }

  if (report.buyDecisions.length > 0) {
    lines.push("## New Buy / Add");
    lines.push("");
    for (const b of report.buyDecisions) {
      lines.push(renderBuyBlock(b));
      lines.push("");
    }
  }

  lines.push("## Cash Allocation");
  // Group by currency
  const allocsByCcy = new Map<string, BuyDecision[]>();
  for (const b of report.buyDecisions) {
    if (!allocsByCcy.has(b.currency)) allocsByCcy.set(b.currency, []);
    allocsByCcy.get(b.currency)!.push(b);
  }
  for (const c of report.cash) {
    const allocs = allocsByCcy.get(c.currency) ?? [];
    const allocStr = allocs.length === 0
      ? "配分なし"
      : allocs.map((b) => `${b.action} ${b.ticker} ${fmtMoney(b.amount)}`).join(" / ");
    const remainder = report.cashRemainder.find((r) => r.currency === c.currency)?.amount ?? 0;
    lines.push(`- ${c.currency} ${fmtMoney(c.amount)} → ${allocStr}${remainder > 0 ? ` / 残 ${fmtMoney(remainder)}（次回機会用）` : ""}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function writeRebalanceReport(report: RebalanceReport): string {
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  const filename = `${report.date}-rebalance.md`;
  const fullPath = join(REPORTS_DIR, filename);
  const md = renderRebalanceMarkdown(report);
  writeFileSync(fullPath, md, "utf-8");
  return fullPath;
}
```

- [ ] **Step 2: Render with mock data**

```bash
bun -e '
import { renderRebalanceMarkdown } from "/workspaces/life/scripts/investment/write-rebalance-report";

const mockReport = {
  date: "2026-05-21",
  cash: [{ currency: "USD", amount: 5000, updatedOn: "2026-05-21" }],
  cashStale: false,
  holdings: [],
  portfolioHealth: {
    totalValueUSD: 50000,
    totalValueCAD: 10000,
    sectorBreakdown: [{ sector: "Technology", pct: 42 }],
    currencyBreakdown: [{ currency: "USD", pct: 78 }, { currency: "CAD", pct: 22 }],
    accountBreakdown: [{ account: "TFSA", pct: 60 }],
  },
  holdingDecisions: [
    {
      ticker: "NVDA", account: "TFSA", quantity: 5, avgCost: 480, currency: "USD",
      action: "TRIM", confidence: "Med",
      thesis: "急騰しすぎ、利確検討",
      recentNews: [{ source: "Bloomberg", category: "株", lang: "en", title: "NVDA beats Q1", link: "https://example.com/nvda", pubDate: "2026-05-15", summary: "" }],
      sources: ["https://example.com/nvda"],
      technicals: { return3m: 25, return6m: 85, return12m: 120, drawdownPct: -5 },
      fundamentals: { ticker: "NVDA", name: "NVIDIA", currency: "USD", price: 850, marketCap: 2.1e12, trailingPE: 70, forwardPE: 38, priceToBook: 50, returnOnEquity: 0.45, dividendYield: 0.002, debtToEquity: 0.4, freeCashFlow: 25e9, fiftyTwoWeekLow: 400, fiftyTwoWeekHigh: 900, sector: "Technology", industry: "Semiconductors" },
    },
  ],
  buyDecisions: [
    { ticker: "TSM", source: "growth", action: "BUY", amount: 1200, currency: "USD", confidence: "High", thesis: "AI semis tailwind", recentNews: [], sources: ["https://example.com/tsm"] },
  ],
  candidatesUsed: [],
  cashRemainder: [{ currency: "USD", amount: 3800 }],
};

console.log(renderRebalanceMarkdown(mockReport as any));
' | head -60
```

Expected: a markdown report with `# Portfolio Rebalance — 2026-05-21`, Summary section, Portfolio Health, Holdings Review (NVDA — TRIM block), New Buy / Add (TSM — BUY block), Cash Allocation. No `undefined` or `[object Object]`.

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/write-rebalance-report.ts
git commit -m "feat(investment): add write-rebalance-report markdown renderer"
```

---

## Task 10: register-rebalance-notion.ts — Notion DB writer

**Files:**
- Create: `scripts/investment/register-rebalance-notion.ts`

- [ ] **Step 1: Implement register-rebalance-notion.ts**

```typescript
/**
 * register-rebalance-notion — RebalanceReport を Notion DB「Portfolio Rebalance」に登録する。
 *
 * DB は事前に手作成済み（NOTION_REBALANCE_DB env）。プロパティ:
 *   名前 (title) / 日付 (date) / 保有銘柄数 (number) / Cash USD (number) / Cash CAD (number)
 *   / 警告銘柄 (multi_select) / ステータス (select)
 *
 * ページ本文には markdown report を rich_text に分解して書き込む。
 */

import { getScheduleDbConfig, notionFetch, pickCover } from "../lib/notion";
import type { RebalanceReport } from "./types";
import { renderRebalanceMarkdown } from "./write-rebalance-report";

type Block = Record<string, unknown>;

const p = (text = ""): Block => ({
  type: "paragraph",
  paragraph: { rich_text: text ? [{ type: "text", text: { content: text } }] : [] },
});
const code = (text: string, language = "markdown"): Block => ({
  type: "code",
  code: { rich_text: [{ type: "text", text: { content: text.slice(0, 1900) } }], language },
});
const callout = (text: string, emoji: string): Block => ({
  type: "callout",
  callout: { rich_text: [{ type: "text", text: { content: text } }], icon: { type: "emoji", emoji } },
});

function splitMarkdownToCodeBlocks(md: string, chunkSize = 1900): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < md.length; i += chunkSize) {
    blocks.push(code(md.slice(i, i + chunkSize), "markdown"));
  }
  return blocks;
}

export async function registerRebalanceNotion(report: RebalanceReport): Promise<string> {
  const { apiKey, dbId, config } = getScheduleDbConfig("rebalance");

  const usdCash = report.cash.find((c) => c.currency === "USD")?.amount ?? 0;
  const cadCash = report.cash.find((c) => c.currency === "CAD")?.amount ?? 0;
  const warnedTickers = report.holdingDecisions
    .filter((d) => d.sanity && d.sanity.warnings.length > 0)
    .map((d) => d.ticker);

  const properties: Record<string, unknown> = {
    [config.titleProp]: {
      title: [{ type: "text", text: { content: `Rebalance ${report.date}` } }],
    },
    [config.dateProp]: {
      date: { start: report.date },
    },
    保有銘柄数: { number: report.holdingDecisions.length },
    "Cash USD": { number: usdCash },
    "Cash CAD": { number: cadCash },
    警告銘柄: { multi_select: warnedTickers.map((t) => ({ name: t })) },
    ステータス: { select: { name: "新規" } },
  };

  const md = renderRebalanceMarkdown(report);

  const blocks: Block[] = [
    callout(
      `教育目的の連想練習。投資助言ではありません。最終判断はご自身で公式 IR 等で確認の上行ってください。`,
      "⚠️",
    ),
    p(`Investor Profile: 30 歳 / 中長期 / aggressive growth`),
    p(""),
    ...splitMarkdownToCodeBlocks(md),
  ];

  const initialBlocks = blocks.slice(0, 90);
  const remainingBlocks = blocks.slice(90);

  const res = await notionFetch(apiKey, "/pages", {
    parent: { database_id: dbId },
    icon: config.defaultIcon ? { type: "emoji", emoji: config.defaultIcon } : undefined,
    cover: pickCover(),
    properties,
    children: initialBlocks,
  });

  const pageId = res.id as string;

  if (remainingBlocks.length > 0) {
    for (let i = 0; i < remainingBlocks.length; i += 90) {
      const chunk = remainingBlocks.slice(i, i + 90);
      await notionFetch(apiKey, `/blocks/${pageId}/children`, { children: chunk }, "PATCH");
    }
  }

  return pageId;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/investment/register-rebalance-notion.ts
git commit -m "feat(investment): add register-rebalance-notion writer"
```

---

## Task 11: rebalance.ts — orchestrator

**Files:**
- Create: `scripts/investment/rebalance.ts`

- [ ] **Step 1: Implement rebalance.ts**

```typescript
#!/usr/bin/env bun
/**
 * Portfolio Rebalance — オーケストレーター
 *
 * 使い方:
 *   bun run scripts/investment/rebalance.ts            # 本番（Notion 登録 + md 保存）
 *   bun run scripts/investment/rebalance.ts --dry-run  # Notion 登録せず stdout
 *   bun run scripts/investment/rebalance.ts --only-sanity
 *   bun run scripts/investment/rebalance.ts --only-holdings
 *   bun run scripts/investment/rebalance.ts --candidates aspects/investment/candidates/<file>.json
 *   bun run scripts/investment/rebalance.ts --cash-file /tmp/test-cash.csv
 */

import { loadContext } from "./load-context";
import { fetchTickerNews } from "./fetch-ticker-news";
import { fetchFundamentals } from "./fetch-fundamentals";
import { fetchPriceHistory } from "./fetch-price-history";
import { sanityCheck, formatSanityLine } from "./sanity-check";
import { evaluateHoldings } from "./evaluate-holdings";
import { allocateCash } from "./allocate-cash";
import { writeRebalanceReport, renderRebalanceMarkdown } from "./write-rebalance-report";
import { registerRebalanceNotion } from "./register-rebalance-notion";
import type {
  PortfolioRow,
  Candidate,
  RebalanceReport,
  PortfolioHealth,
  NewsItem,
} from "./types";

function todayJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

interface Args {
  dryRun: boolean;
  only: "sanity" | "holdings" | null;
  candidates: string | null;
  cashFile: string | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  let only: Args["only"] = null;
  if (args.includes("--only-sanity")) only = "sanity";
  else if (args.includes("--only-holdings")) only = "holdings";
  const candIdx = args.indexOf("--candidates");
  const cashIdx = args.indexOf("--cash-file");
  return {
    dryRun,
    only,
    candidates: candIdx >= 0 ? args[candIdx + 1] : null,
    cashFile: cashIdx >= 0 ? args[cashIdx + 1] : null,
  };
}

function computePortfolioHealth(
  portfolio: PortfolioRow[],
  fundamentalsMap: Map<string, { sector: string | null; currency: string }>,
  priceMap: Map<string, number | null>,
): PortfolioHealth {
  let totalUSD = 0;
  let totalCAD = 0;
  const sectorVals = new Map<string, number>();
  const ccyVals = new Map<string, number>();
  const acctVals = new Map<string, number>();

  for (const row of portfolio) {
    const price = priceMap.get(row.ticker.toUpperCase()) ?? row.avgCost; // fallback to avg cost
    const value = row.quantity * (price ?? row.avgCost);
    if (row.currency === "USD") totalUSD += value;
    if (row.currency === "CAD") totalCAD += value;
    const fund = fundamentalsMap.get(row.ticker.toUpperCase());
    const sector = fund?.sector ?? "Unknown";
    sectorVals.set(sector, (sectorVals.get(sector) ?? 0) + value);
    ccyVals.set(row.currency, (ccyVals.get(row.currency) ?? 0) + value);
    acctVals.set(row.account, (acctVals.get(row.account) ?? 0) + value);
  }
  const totalAll = totalUSD + totalCAD; // rough — no FX conversion

  return {
    totalValueUSD: totalUSD,
    totalValueCAD: totalCAD,
    sectorBreakdown: [...sectorVals.entries()]
      .map(([sector, v]) => ({ sector, pct: totalAll > 0 ? (v / totalAll) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct),
    currencyBreakdown: [...ccyVals.entries()]
      .map(([currency, v]) => ({ currency, pct: totalAll > 0 ? (v / totalAll) * 100 : 0 })),
    accountBreakdown: [...acctVals.entries()]
      .map(([account, v]) => ({ account, pct: totalAll > 0 ? (v / totalAll) * 100 : 0 })),
  };
}

async function main() {
  const args = parseArgs();

  console.error(`📂 コンテキスト読み込み中...`);
  const ctx = loadContext({
    cashPath: args.cashFile ?? undefined,
    candidatesPath: args.candidates ?? undefined,
  });
  console.error(`  → portfolio ${ctx.portfolio.length} 銘柄, cash ${ctx.cash.length} currency, candidates ${ctx.candidates.length}`);
  if (ctx.cashStale) {
    console.error(`  ⚠️  cash.csv は 30 日以上更新されていません`);
  }

  const allTickers = [...new Set([...ctx.portfolio.map((p) => p.ticker), ...ctx.candidates.map((c) => c.ticker)])];

  if (args.only === "sanity") {
    console.error(`🚨 sanity-check (--only-sanity)...`);
    const flags = await sanityCheck(allTickers);
    for (const [, f] of flags) {
      console.log(formatSanityLine(f));
      for (const w of f.warnings) console.log(`    🚨 ${w}`);
    }
    return;
  }

  console.error(`📰 ticker 別ニュース取得中...`);
  const tickerKeys = ctx.portfolio.map((p) => ({ ticker: p.ticker, aliases: [] as string[] }));
  tickerKeys.push(...ctx.candidates.map((c) => ({ ticker: c.ticker, aliases: [] as string[] })));
  const newsMap = await fetchTickerNews(tickerKeys);
  const totalNewsItems = [...newsMap.values()].reduce((sum, items) => sum + items.length, 0);
  console.error(`  → ${totalNewsItems} 件マッチ`);

  console.error(`📊 yahoo-finance2 で財務指標取得中...`);
  const candidatesForFundamentals: Candidate[] = allTickers.map((t) => ({ ticker: t, name: t, rationale: "" }));
  const fundamentals = await fetchFundamentals(candidatesForFundamentals);
  const fundMap = new Map(fundamentals.map((f) => [f.ticker.toUpperCase(), f]));

  console.error(`📈 価格履歴取得中...`);
  const priceMetrics = await fetchPriceHistory(allTickers);

  console.error(`🚨 sanity-check 中...`);
  const sanityFlags = await sanityCheck(allTickers);

  // Build inputs for evaluate-holdings (portfolio rows only)
  const holdingInputs = ctx.portfolio.map((row) => {
    const fund = fundMap.get(row.ticker.toUpperCase());
    if (!fund) throw new Error(`fundamentals missing for ${row.ticker}`);
    return {
      row,
      fundamentals: fund,
      news: newsMap.get(row.ticker.toUpperCase()) ?? [],
      technicals: priceMetrics.get(row.ticker.toUpperCase()) ?? { ticker: row.ticker, return3m: null, return6m: null, return12m: null, drawdownPct: null, currentPrice: null },
      sanity: sanityFlags.get(row.ticker.toUpperCase()),
    };
  });

  console.error(`🧠 保有銘柄評価中（Claude）...`);
  const holdingDecisions = await evaluateHoldings(holdingInputs);
  console.error(`  → ${holdingDecisions.length} 銘柄判定済み`);

  if (args.only === "holdings") {
    for (const d of holdingDecisions) {
      console.log(`${d.ticker} (${d.account}): ${d.action} [${d.confidence}] — ${d.thesis.slice(0, 80)}...`);
    }
    return;
  }

  // Portfolio health
  const priceMap = new Map<string, number | null>();
  for (const [t, m] of priceMetrics) priceMap.set(t, m.currentPrice);
  const fundSectorMap = new Map<string, { sector: string | null; currency: string }>();
  for (const [t, f] of fundMap) fundSectorMap.set(t, { sector: f.sector, currency: f.currency });
  const portfolioHealth = computePortfolioHealth(ctx.portfolio, fundSectorMap, priceMap);

  // Allocate cash
  console.error(`💰 cash 配分中（Claude）...`);
  const adds = holdingDecisions.filter((d) => d.action === "ADD");
  const portfolioTotals = ctx.portfolio.map((row) => ({
    ticker: row.ticker,
    currency: row.currency,
    valueInCurrency: row.quantity * (priceMap.get(row.ticker.toUpperCase()) ?? row.avgCost),
    sector: fundMap.get(row.ticker.toUpperCase())?.sector ?? null,
  }));
  const { buyDecisions, remainder } = await allocateCash({
    cash: ctx.cash,
    portfolioTotals,
    portfolioTotalUSD: portfolioHealth.totalValueUSD,
    portfolioTotalCAD: portfolioHealth.totalValueCAD,
    adds,
    buys: ctx.candidates,
  });
  console.error(`  → ${buyDecisions.length} 件配分`);

  const report: RebalanceReport = {
    date: todayJST(),
    cash: ctx.cash,
    cashStale: ctx.cashStale,
    holdings: ctx.portfolio,
    portfolioHealth,
    holdingDecisions,
    buyDecisions,
    candidatesUsed: ctx.candidates,
    cashRemainder: remainder,
  };

  if (args.dryRun) {
    console.log(renderRebalanceMarkdown(report));
    console.error(`\n✓ dry-run 完了（md 保存・Notion 登録なし）`);
    return;
  }

  console.error(`📝 md 保存中...`);
  const mdPath = writeRebalanceReport(report);
  console.error(`  → ${mdPath}`);

  console.error(`📝 Notion 登録中...`);
  try {
    const pageId = await registerRebalanceNotion(report);
    console.error(`✓ Notion 完了: ${pageId}`);
  } catch (err) {
    console.error(`✗ Notion 登録失敗: ${err instanceof Error ? err.message : err}`);
    console.error(`md は保存済み (${mdPath})。Notion DB env (NOTION_REBALANCE_DB) を確認して再実行してください。`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("rebalance failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test the orchestrator's argument parsing**

```bash
# This will error out because portfolio.csv probably doesn't exist yet — that's expected
bun run scripts/investment/rebalance.ts --dry-run 2>&1 | head -5
```

Expected: error message about missing `portfolio.csv` pointing to the spec. (If `portfolio.csv` exists already, the script will proceed further.)

- [ ] **Step 3: Commit**

```bash
git add scripts/investment/rebalance.ts
git commit -m "feat(investment): add rebalance orchestrator"
```

---

## Task 12: Create the `/rebalance` skill

**Files:**
- Create: `skills/rebalance/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

```markdown
---
name: rebalance
description: 保有 portfolio + cash を踏まえて Hold/Trim/Sell/Add と新規 Buy を提案するとき。3 ヶ月おきの中長期レビューに使う。「rebalance したい」「ポートフォリオ見直したい」「cash どう使う」などに使う。
---

# rebalance — Portfolio Rebalance

## いつ使う

- 3 ヶ月おきの中長期 portfolio レビュー
- 「rebalance したい」「ポートフォリオ見直したい」
- 「cash どう使う」「何を売って何を買う」

## 事前確認（必須）

1. `aspects/investment/portfolio.csv` が存在するか確認
   - 無ければ `docs/superpowers/specs/2026-05-21-investment-portfolio-csv-design.md` を見せて作成を促す
2. `aspects/investment/cash.csv` が存在するか確認
   - 無ければサンプル schema を出して作成を促す
3. `cash.csv` の `updated_on` を確認
   - 30 日以上前なら「Wealthsimple を見て cash 残高を更新しますか？」と聞く

## 実行

```bash
# dry-run でまず確認
bun run scripts/investment/rebalance.ts --dry-run

# 問題なければ本番（md 保存 + Notion 登録）
bun run scripts/investment/rebalance.ts
```

## 出力

- `aspects/investment/reports/YYYY-MM-DD-rebalance.md`（gitignored）
- Notion DB「Portfolio Rebalance」に 1 ページ

## 結果のレビュー

実行後、以下をユーザーに確認:

1. sanity-check 警告銘柄があれば、最初に伝える（🚨 ticker）
2. 推奨 actions の Summary（BUY n / ADD n / HOLD n / TRIM n / SELL n）
3. Cash Allocation の最終形
4. 「実際に発注しますか？」とは聞かない（ユーザーが Wealthsimple で手動発注する）

## 新規候補の取り込み

`aspects/investment/candidates/` に discovery skill の出力（`YYYY-MM-DD-<strategy>.json`）があれば自動で取り込まれる。14 日以上前のファイルは無視される。

discovery skill は別途実装予定（`/discover-growth` 等）。MVP 時点では存在しない。

## 関連 spec

- 設計: [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../../docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md)
- 実装プラン: [docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md](../../docs/superpowers/plans/2026-05-21-portfolio-rebalance-command.md)
```

- [ ] **Step 2: Verify skill is auto-discovered**

`.claude/skills` is a symlink to `../skills`, so the skill should auto-load next session. Manual check now:

```bash
ls -la /workspaces/life/skills/rebalance/SKILL.md
```

Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add skills/rebalance/SKILL.md
git commit -m "feat(rebalance): add /rebalance skill definition"
```

---

## Task 13: Update aspects/investment/CLAUDE.md with rebalance section

**Files:**
- Modify: `aspects/investment/CLAUDE.md`

- [ ] **Step 1: Add rebalance section after the existing daily-report sections**

Open `aspects/investment/CLAUDE.md`. Find the line `## Phase 2 アイデア（MVP 外）` (currently the last section in the file). Insert the following BEFORE it:

```markdown
## /rebalance — Portfolio Rebalance（中長期レビュー）

> 仕様: [docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md](../../docs/superpowers/specs/2026-05-21-portfolio-rebalance-command-design.md)

3 ヶ月おきの中長期レビューコマンド。保有銘柄 + cash を踏まえて Hold/Trim/Sell/Add と新規 Buy を提案する。

### 必要ファイル（すべて gitignored）

- `aspects/investment/portfolio.csv` — 保有銘柄（既存 spec）
- `aspects/investment/cash.csv` — 現金残高
  ```
  currency,amount,updated_on
  USD,5000,2026-05-21
  CAD,2000,2026-05-21
  ```
- `aspects/investment/candidates/*.json` — discovery skill 出力（任意、無くても可）

### Investor Profile

スクリプトは **30 歳・中長期・aggressive growth tilt** 前提でチューニング済み:

- Position sizing: 1 銘柄 ≤ 15% / セクター ≤ 40% / cash の 1 銘柄 ≤ 60%
- 直近ニュース最優先（PRIM 反省）
- 配当より成長率重視

### Notion DB（手作成必須）

- DB 名: **Portfolio Rebalance**
- env var: `NOTION_REBALANCE_DB`（`.env.local`）
- プロパティ:
  - 名前 (title)
  - 日付 (date)
  - 保有銘柄数 (number)
  - Cash USD (number)
  - Cash CAD (number)
  - 警告銘柄 (multi_select)
  - ステータス (select: 新規 / 実行済み / スキップ)

### 起動

```bash
bun run scripts/investment/rebalance.ts            # 本番
bun run scripts/investment/rebalance.ts --dry-run  # Notion 登録なし
bun run scripts/investment/rebalance.ts --only-sanity   # 暴落検出のみ
bun run scripts/investment/rebalance.ts --only-holdings # 保有判定のみ
```

Skill 経由: `/rebalance`

```

- [ ] **Step 2: Commit**

```bash
git add aspects/investment/CLAUDE.md
git commit -m "docs(investment): add rebalance section to CLAUDE.md"
```

---

## Task 14: End-to-end verification

**Files:** No new files. This task verifies the system works.

- [ ] **Step 1: Create test portfolio + cash files**

```bash
# Back up real files if they exist
[ -f /workspaces/life/aspects/investment/portfolio.csv ] && cp /workspaces/life/aspects/investment/portfolio.csv /tmp/portfolio.csv.bak || true
[ -f /workspaces/life/aspects/investment/cash.csv ] && cp /workspaces/life/aspects/investment/cash.csv /tmp/cash.csv.bak || true

# Create test data
cat > /workspaces/life/aspects/investment/portfolio.csv <<'EOF'
ticker,quantity,avg_cost,currency,account,acquired_on,note
AAPL,7.0031,271.07,USD,TFSA,2026-05-21,
AMZN,19,234.16,USD,TFSA,2026-05-21,
MSFT,5,300.00,USD,TFSA,2026-05-21,
EOF

cat > /workspaces/life/aspects/investment/cash.csv <<'EOF'
currency,amount,updated_on
USD,5000,2026-05-21
CAD,2000,2026-05-21
EOF
```

- [ ] **Step 2: Run dry-run end-to-end**

```bash
cd /workspaces/life
bun run scripts/investment/rebalance.ts --dry-run 2>&1 | tee /tmp/rebalance-dryrun.log
```

Expected output (in stderr):
- `📂 コンテキスト読み込み中... → portfolio 3 銘柄, cash 2 currency, candidates 0`
- `📰 ticker 別ニュース取得中...`
- `📊 yahoo-finance2 で財務指標取得中...`
- `📈 価格履歴取得中...`
- `🚨 sanity-check 中...`
- `🧠 保有銘柄評価中（Claude）...`
- `  → 3 銘柄判定済み`
- `💰 cash 配分中（Claude）...`
- A markdown report on stdout
- `✓ dry-run 完了`

- [ ] **Step 3: Verify report contents**

Inspect `/tmp/rebalance-dryrun.log`:
- Each holding has Action label, Confidence, 直近ニュース (or "取得できず"), テクニカル, ファンダ, Thesis, **Sources URLs**
- Summary line counts add up to total holdings
- Cash Allocation section shows USD and CAD breakdown
- No `undefined` / `[object Object]` / `null` artifacts in the rendered output

If sources are missing in some holdings, the prompt enforcement isn't working — fix evaluate-holdings.ts SYSTEM prompt and rerun.

- [ ] **Step 4: Test --only-sanity**

```bash
bun run scripts/investment/rebalance.ts --only-sanity
```

Expected: ticker lines like `✓ AAPL: 5d=...% / 30d=...% / drawdown=...%`. No Claude calls (much faster than full dry-run).

- [ ] **Step 5: Test stale cash warning**

```bash
sed -i 's/2026-05-21/2025-01-01/' /workspaces/life/aspects/investment/cash.csv
bun run scripts/investment/rebalance.ts --dry-run 2>&1 | grep -i "stale\|30 日以上"
```

Expected: at least one warning line about cash.csv being stale.

- [ ] **Step 6: Test full Notion path (requires NOTION_REBALANCE_DB env)**

If `NOTION_REBALANCE_DB` env is set in `.env.local`:

```bash
# Restore good cash.csv first
cat > /workspaces/life/aspects/investment/cash.csv <<'EOF'
currency,amount,updated_on
USD,5000,2026-05-21
CAD,2000,2026-05-21
EOF

bun run scripts/investment/rebalance.ts
```

Expected:
- `📝 md 保存中... → aspects/investment/reports/2026-05-21-rebalance.md`
- `📝 Notion 登録中...`
- `✓ Notion 完了: <page-id>`

Open Notion DB「Portfolio Rebalance」and verify the new page has the markdown body in code blocks.

If `NOTION_REBALANCE_DB` is not set, this step fails — that's expected. Ask the user to create the DB and set the env var.

- [ ] **Step 7: Restore real portfolio/cash data**

```bash
[ -f /tmp/portfolio.csv.bak ] && mv /tmp/portfolio.csv.bak /workspaces/life/aspects/investment/portfolio.csv
[ -f /tmp/cash.csv.bak ] && mv /tmp/cash.csv.bak /workspaces/life/aspects/investment/cash.csv
rm -f /tmp/rebalance-dryrun.log
```

- [ ] **Step 8: Commit verification artifacts (none expected, but ensure clean state)**

```bash
git status --porcelain
```

Expected: only the unrelated modified files from session start. No new uncommitted rebalance artifacts (the generated `*-rebalance.md` is gitignored).

---

## Self-Review Notes

This plan covers the spec sections:
- ✅ Inputs (portfolio.csv + cash.csv + candidates/) → Task 4
- ✅ 7-stage pipeline → Tasks 4-11
- ✅ Investor Profile + analysis priority → Task 7 SYSTEM prompt
- ✅ Position sizing rules → Task 8 prompt
- ✅ Output format (md + Notion) → Tasks 9-10
- ✅ Pluggable candidates I/F → Task 4 (DiscoveryCandidate loader)
- ✅ Notion DB schema → Task 3 + Task 13 (manual setup docs)
- ✅ Error handling → Task 11 main() + Task 4 missing file errors
- ✅ Skill definition → Task 12
- ✅ Verification → Task 14

Discovery skills themselves are explicitly out of scope (spec confirms MVP doesn't ship them). The plan provides the JSON I/F for them.
