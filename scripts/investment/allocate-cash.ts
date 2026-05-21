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
  const totalAll = input.portfolioTotalUSD + input.portfolioTotalCAD;
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
