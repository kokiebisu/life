/**
 * allocate-cash — cash 残高を Add / Buy 候補に position sizing ルールで配分する。
 *
 * Investor Profile (aggressive growth) に合わせて緩めの sizing。
 * 短期モメンタム反転（1w -10% 以下）には tranche/half-size ルールを適用。
 */

import { callClaude } from "../lib/claude";
import { extractJson } from "./util-json";
import type {
  CashRow,
  HoldingDecision,
  DiscoveryCandidate,
  BuyDecision,
} from "./types";
import type { PriceMetrics } from "./fetch-price-history";

const SYSTEM = `あなたは 30 歳・中長期・aggressive growth tilt の投資家の cash 配分担当です。
保有銘柄評価で ADD が付いた銘柄と、discovery skill が提案した BUY 候補に、現金を配分します。
短期モメンタム反転（1w 急落）には tranche entry を強制します。`;

interface AllocateInput {
  cash: CashRow[];
  portfolioTotals: { ticker: string; currency: "USD" | "CAD"; valueInCurrency: number; sector: string | null }[];
  portfolioTotalUSD: number;
  portfolioTotalCAD: number;
  adds: HoldingDecision[]; // action === "ADD"
  buys: DiscoveryCandidate[];
  /** 全候補 ticker の price metrics (orchestrator が用意) */
  priceMetrics: Map<string, PriceMetrics>;
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return Number.isInteger(v) ? v.toString() : v.toFixed(2);
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function technicalLine(p: PriceMetrics | undefined): string {
  if (!p) return "(価格データなし)";
  const dropFlag = (p.return1w ?? 0) <= -10 ? " ⚠️ 1w 急落" : "";
  return `現在 $${fmt(p.currentPrice)} / 1w=${pct(p.return1w)} 1m=${pct(p.return1m)} 3m=${pct(p.return3m)} 6m=${pct(p.return6m)} 12m=${pct(p.return12m)} drawdown=${pct(p.drawdownPct)}${dropFlag}`;
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
    : input.adds.map((a) => {
        const p = input.priceMetrics.get(a.ticker.toUpperCase());
        return `- ${a.ticker} (${a.currency}, ${a.account}) confidence=${a.confidence}\n    価格: ${technicalLine(p)}\n    Thesis: ${a.thesis}`;
      }).join("\n");
  const buyLines = input.buys.length === 0
    ? "（BUY 候補なし）"
    : input.buys.map((b) => {
        const p = input.priceMetrics.get(b.ticker.toUpperCase());
        return `- ${b.ticker} (strategy=${b.strategy}) confidence=${b.confidence}\n    価格: ${technicalLine(p)}\n    Thesis: ${b.thesis}\n    Sources: ${b.sources.slice(0, 2).join(", ")}`;
      }).join("\n");

  return `**現在の cash:**
${cashLines}

**Portfolio 概況:**
- 合計（rough、USD と CAD を単純合算）: $${fmt(totalAll)}
- セクター分布:
${sectorPct}

**ADD 推奨銘柄（保有銘柄の買い増し候補、各銘柄に直近の価格推移付き）:**
${addLines}

**BUY 候補（discovery skill 出力、新規銘柄、各銘柄に直近の価格推移付き）:**
${buyLines}

**Position Sizing ルール（必ず遵守。30 歳 / aggressive growth 向けに緩め）:**
- 1 銘柄あたり portfolio 占有率 ≤ 15%（既存保有分も含めて）
- 1 セクター ≤ 40%
- 1 銘柄あたり cash の配分 ≤ 60%
- confidence Low の銘柄には配分しない
- currency マッチ厳守: USD cash → USD 銘柄、CAD cash → CAD 銘柄
- cash 残し率 0% でも OK。ただし confidence High の候補が無い currency は残してよい

**短期モメンタム反転ルール（厳守、上記の上書き）:**
- **1w return が -10% 以下** の銘柄に配分する場合は、**通常の半分以下**にサイズ縮小し、必ず \`trancheRecommended: true\` を設定する
  - 例: 通常 cash の 40% 配分 → 1w 急落銘柄なら最大 20%
  - 理由: 短期急落は thesis が壊れた possibility あり、または追加下落リスクあり。一括投入は危険
- **1w が -10% 以下 かつ confidence Low** → 配分しない
- **1m return が -15% 以下 かつ ニュースで悪材料あり** → 配分しない（thesis 確認まで待機）
- **1w が -10% 以下 だが ニュースは中立/好材料** → tranche entry で半分配分、残りは様子見

**アナリスト PT 引上げに釣られない:**
- 大幅下落直後の PT 引上げは「分析家の擁護」の可能性を疑う
- 価格モメンタム + ファンダ + ニュースを総合判断し、PT 引上げ単独で増額しない

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
      "thesis": "配分根拠（ADD/BUY それぞれの thesis を 2-3 文。1w 急落なら tranche 理由を明記）",
      "sources": ["https://..."],
      "trancheRecommended": false
    }
  ],
  "remainder": [
    {"currency": "USD", "amount": 1500},
    {"currency": "CAD", "amount": 2000}
  ]
}

source 値の規則:
- ADD の場合: "existing-holding"
- BUY の場合: 候補の strategy 名（例: "growth", "value"）

\`trancheRecommended\`:
- 1w return が -10% 以下なら必ず \`true\`
- それ以外は \`false\``;
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
      trancheRecommended?: boolean;
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
    const p = input.priceMetrics.get(tickerUpper);
    const recentNews = add ? add.recentNews : buy ? buy.recentNews : [];
    const baseSources = add ? add.sources : buy ? buy.sources : [];
    const mergedSources = [...new Set([...d.sources, ...baseSources])];
    // Safety: コード側でも 1w 急落フラグを上書き判定（プロンプトが見落とした場合の保険）
    const enforcedTranche = (p?.return1w ?? 0) <= -10 ? true : (d.trancheRecommended ?? false);
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
      currentPrice: p?.currentPrice ?? null,
      technicals: p
        ? {
            return1w: p.return1w,
            return1m: p.return1m,
            return3m: p.return3m,
            return6m: p.return6m,
            return12m: p.return12m,
            drawdownPct: p.drawdownPct,
          }
        : undefined,
      trancheRecommended: enforcedTranche,
    };
  });

  return { buyDecisions, remainder: parsed.remainder ?? [] };
}
