#!/usr/bin/env bun
/**
 * 天気予報取得スクリプト
 *
 * Usage:
 *   bun run scripts/weather.ts --date 2026-02-20
 *   bun run scripts/weather.ts --date 2026-02-20 --date 2026-02-22
 *   bun run scripts/weather.ts --days 7
 *   bun run scripts/weather.ts --date 2026-02-20 --json
 *
 * Open-Meteo API（無料・APIキー不要・16日先まで）
 * 横浜の天気を取得する
 */

import { createCache, cacheKey } from "./lib/cache";

const weatherCache = createCache("weather", { defaultTtlMs: 2 * 3600_000 }); // 2h TTL

// 横浜の座標
const YOKOHAMA = { lat: 35.4437, lon: 139.638 };

// WMO Weather Code → 日本語 & emoji
const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: "快晴", emoji: "☀️" },
  1: { label: "晴れ", emoji: "🌤️" },
  2: { label: "くもり時々晴れ", emoji: "⛅" },
  3: { label: "くもり", emoji: "☁️" },
  45: { label: "霧", emoji: "🌫️" },
  48: { label: "霧（霜）", emoji: "🌫️" },
  51: { label: "小雨", emoji: "🌦️" },
  53: { label: "雨", emoji: "🌧️" },
  55: { label: "強い雨", emoji: "🌧️" },
  56: { label: "冷たい小雨", emoji: "🌧️" },
  57: { label: "冷たい雨", emoji: "🌧️" },
  61: { label: "小雨", emoji: "🌦️" },
  63: { label: "雨", emoji: "🌧️" },
  65: { label: "大雨", emoji: "🌧️" },
  66: { label: "冷たい小雨", emoji: "🌧️" },
  67: { label: "冷たい大雨", emoji: "🌧️" },
  71: { label: "小雪", emoji: "🌨️" },
  73: { label: "雪", emoji: "🌨️" },
  75: { label: "大雪", emoji: "🌨️" },
  77: { label: "霰", emoji: "🌨️" },
  80: { label: "にわか雨", emoji: "🌦️" },
  81: { label: "にわか雨", emoji: "🌧️" },
  82: { label: "激しいにわか雨", emoji: "🌧️" },
  85: { label: "にわか雪", emoji: "🌨️" },
  86: { label: "激しいにわか雪", emoji: "🌨️" },
  95: { label: "雷雨", emoji: "⛈️" },
  96: { label: "雷雨（雹）", emoji: "⛈️" },
  99: { label: "激しい雷雨（雹）", emoji: "⛈️" },
};

function decodeWeather(code: number): { label: string; emoji: string } {
  return WMO_CODES[code] ?? { label: `不明(${code})`, emoji: "❓" };
}

export interface DayForecast {
  date: string;
  weatherCode: number;
  weather: string;
  emoji: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbMax: number;
  windSpeedMax: number;
}

export async function fetchForecast(dates: string[]): Promise<DayForecast[]> {
  const allDates = dates.sort();
  const startDate = allDates[0];
  const endDate = allDates[allDates.length - 1];

  const key = cacheKey(startDate!, endDate!);
  const cached = weatherCache.get<DayForecast[]>(key);
  if (cached !== undefined) {
    // Filter to only requested dates
    const dateSet = new Set(dates);
    return cached.filter(f => dateSet.has(f.date));
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(YOKOHAMA.lat));
  url.searchParams.set("longitude", String(YOKOHAMA.lon));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
  ].join(","));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("start_date", startDate!);
  url.searchParams.set("end_date", endDate!);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
    };
  };
  const daily = data.daily;

  const results: DayForecast[] = [];
  const dateSet = new Set(dates);

  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i]!;
    if (!dateSet.has(date)) continue;

    const code = daily.weather_code[i]!;
    const { label, emoji } = decodeWeather(code);

    results.push({
      date,
      weatherCode: code,
      weather: label,
      emoji,
      tempMax: daily.temperature_2m_max[i]!,
      tempMin: daily.temperature_2m_min[i]!,
      precipitationSum: daily.precipitation_sum[i]!,
      precipitationProbMax: daily.precipitation_probability_max[i]!,
      windSpeedMax: daily.wind_speed_10m_max[i]!,
    });
  }

  // Cache all results (not just filtered)
  const allResults: DayForecast[] = [];
  for (let i = 0; i < daily.time.length; i++) {
    const d = daily.time[i]!;
    const code = daily.weather_code[i]!;
    const { label, emoji } = decodeWeather(code);
    allResults.push({
      date: d,
      weatherCode: code,
      weather: label,
      emoji,
      tempMax: daily.temperature_2m_max[i]!,
      tempMin: daily.temperature_2m_min[i]!,
      precipitationSum: daily.precipitation_sum[i]!,
      precipitationProbMax: daily.precipitation_probability_max[i]!,
      windSpeedMax: daily.wind_speed_10m_max[i]!,
    });
  }
  weatherCache.set(key, allResults);

  return results;
}

/** 外出おすすめ度（5段階） */
export function outdoorScore(f: DayForecast): { score: number; reason: string } {
  // 雨・雪系
  if (f.precipitationProbMax >= 70) return { score: 1, reason: "降水確率が高い" };
  if (f.precipitationProbMax >= 50) return { score: 2, reason: "雨の可能性あり" };

  // 強風
  if (f.windSpeedMax >= 40) return { score: 2, reason: "強風" };

  // 極端な気温
  if (f.tempMax >= 35) return { score: 2, reason: "猛暑" };
  if (f.tempMin <= 0) return { score: 3, reason: "氷点下だが晴れ" };

  // 曇り
  if (f.weatherCode === 3) return { score: 3, reason: "くもり" };

  // 晴れ系
  if (f.precipitationProbMax <= 20) return { score: 5, reason: "晴れ・降水なし" };

  return { score: 4, reason: "概ね良好" };
}

function formatForecast(f: DayForecast): string {
  const { score, reason } = outdoorScore(f);
  const stars = "★".repeat(score) + "☆".repeat(5 - score);
  const dow = new Date(f.date + "T00:00:00+09:00").toLocaleDateString("ja-JP", {
    weekday: "short",
    timeZone: "Asia/Tokyo",
  });
  return [
    `${f.date}（${dow}）${f.emoji} ${f.weather}`,
    `  気温: ${f.tempMin}°C 〜 ${f.tempMax}°C`,
    `  降水確率: ${f.precipitationProbMax}%  降水量: ${f.precipitationSum}mm  風速: ${f.windSpeedMax}km/h`,
    `  外出おすすめ度: ${stars}（${reason}）`,
  ].join("\n");
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);
  const dates: string[] = [];
  let days = 0;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      dates.push(args[++i]!);
    } else if (args[i] === "--days" && args[i + 1]) {
      days = parseInt(args[++i]!, 10);
    } else if (args[i] === "--json") {
      jsonOutput = true;
    } else if (args[i] === "--help") {
      console.log(`Usage:
  bun run scripts/weather.ts --date 2026-02-20
  bun run scripts/weather.ts --date 2026-02-20 --date 2026-02-22
  bun run scripts/weather.ts --days 7
  bun run scripts/weather.ts --date 2026-02-20 --json`);
      process.exit(0);
    }
  }

  // --days: 今日から N 日分
  if (days > 0) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    for (let d = 0; d < days; d++) {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + d);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  if (dates.length === 0) {
    console.error("Error: --date YYYY-MM-DD or --days N が必要です");
    process.exit(1);
  }

  const forecasts = await fetchForecast(dates);

  if (jsonOutput) {
    const withScore = forecasts.map((f) => ({ ...f, ...outdoorScore(f) }));
    console.log(JSON.stringify(withScore, null, 2));
  } else {
    for (const f of forecasts) {
      console.log(formatForecast(f));
      console.log();
    }
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
