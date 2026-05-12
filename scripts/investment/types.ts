/**
 * Investment aspect — 型定義
 */

export interface FeedConfig {
  name: string;
  url: string;
  category: string;
  lang?: "ja" | "en";
}

export interface NewsItem {
  source: string;
  category: string;
  lang: "ja" | "en";
  title: string;
  link: string;
  pubDate: string;
  summary: string;
}

export interface Theme {
  title: string;
  reasoning: string;
  primarySourceLink: string;
  category: "株" | "仮想通貨セクター" | "その他";
}

export interface Candidate {
  ticker: string;
  name: string;
  rationale: string;
}

export interface Fundamentals {
  ticker: string;
  name: string;
  currency: string;
  price: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  returnOnEquity: number | null;
  dividendYield: number | null;
  debtToEquity: number | null;
  freeCashFlow: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  sector: string | null;
  industry: string | null;
  fetchError?: string;
}

export interface SanityFlag {
  ticker: string;
  drawdownPct: number;     // 180d 高値からの下落率（負値）
  pct5d: number;           // 直近 5 営業日の変化率
  pct30d: number;          // 直近 22 営業日（約 30 日）の変化率
  maxVolumeRatio: number;  // 直近 30 日内の最大出来高 / 30 日平均
  high180: number;
  currentPrice: number;
  warnings: string[];      // 閾値超えの警告メッセージ。空なら問題なし
}

export interface ValuePick {
  ticker: string;
  name: string;
  thesis: string;
  catalysts: string[];
  risks: string[];
  fundamentals: Fundamentals;
  sanity?: SanityFlag;
}

export interface Analysis {
  date: string;
  theme: Theme;
  newsSummary: string;
  picks: ValuePick[];
  overallRisks: string[];
}
