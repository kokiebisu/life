/**
 * Notion API 共通ユーティリティ
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const ENV_FILE = join(ROOT, ".env.local");

const NOTION_API_VERSION = "2022-06-28";

export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return env;
  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[trimmed.slice(0, eqIdx).trim()] = val;
  }
  return env;
}

export function getApiKey(): string {
  const env = loadEnv();
  const apiKey = env["NOTION_API_KEY"] || process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error("Error: NOTION_API_KEY must be set in .env.local");
    process.exit(1);
  }
  return apiKey;
}

export function getDbId(envKey: string): string {
  const env = loadEnv();
  const dbId = env[envKey] || process.env[envKey];
  if (!dbId) {
    console.error(`Error: ${envKey} must be set in .env.local`);
    process.exit(1);
  }
  return dbId;
}

export function getDbIdOptional(envKey: string): string | null {
  const env = loadEnv();
  return env[envKey] || process.env[envKey] || null;
}

export function getTasksConfig() {
  return { apiKey: getApiKey(), dbId: getDbId("NOTION_TASKS_DB") };
}

export function getShoppingConfig() {
  return { apiKey: getApiKey(), dbId: getDbId("NOTION_SHOPPING_DB") };
}

export function notionHeaders(apiKey: string) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

export async function notionFetch(apiKey: string, path: string, body?: unknown, method?: "GET" | "POST" | "PATCH"): Promise<any> {
  const resolvedMethod = method || (body !== undefined ? "POST" : "GET");
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: resolvedMethod,
    headers: notionHeaders(apiKey),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API ${res.status}: ${(err as any).message}`);
  }
  return res.json();
}

export function parseArgs(argv?: string[]): { flags: Set<string>; opts: Record<string, string>; positional: string[] } {
  const args = argv || process.argv.slice(2);
  const flags = new Set<string>();
  const opts: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--") {
      positional.push(...args.slice(i + 1));
      break;
    } else if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        opts[key] = args[i + 1];
        i++;
      } else {
        flags.add(key);
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, opts, positional };
}

export function todayJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// --- Icon & Cover helpers ---

const TASK_ICON_KEYWORDS: [RegExp, string][] = [
  [/ギター|guitar/i, "🎸"],
  [/教会|礼拝|church/i, "⛪"],
  [/ジム|筋トレ|運動|トレーニング|gym|workout/i, "💪"],
  [/買い物|買い出し|shopping/i, "🛒"],
  [/料理|自炊|cook/i, "🍳"],
  [/勉強|学習|study/i, "📖"],
  [/読書|本|book|read/i, "📚"],
  [/tsumugi/i, "🧶"],
  [/面接|interview/i, "👔"],
  [/ミーティング|会議|MTG|meeting/i, "🤝"],
  [/医者|病院|歯医者|health/i, "🏥"],
  [/引越|移住|fukuoka/i, "🏠"],
  [/投資|invest/i, "📈"],
  [/散歩|walk/i, "🚶"],
  [/掃除|cleaning/i, "🧹"],
  [/飲み|居酒屋|dinner|ランチ|lunch/i, "🍽️"],
  [/旅行|trip|travel/i, "✈️"],
  [/イベント|event/i, "🎪"],
];

const ASPECT_COVERS: Record<string, string[]> = {
  tsumugi: [
    "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1200",
    "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200",
  ],
  diet: [
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200",
    "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200",
  ],
  guitar: [
    "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=1200",
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200",
    "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=1200",
  ],
  church: [
    "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1200",
  ],
  investment: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200",
  ],
  study: [
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=1200",
    "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200",
    "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=1200",
  ],
  reading: [
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1200",
    "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1200",
  ],
  job: [
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200",
  ],
  fukuoka: [
    "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=1200",
  ],
};

const GENERAL_COVERS = [
  "https://images.unsplash.com/photo-1557683316-973673baf926?w=1200",
  "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1200",
  "https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=1200",
  "https://images.unsplash.com/photo-1557682260-96773eb01377?w=1200",
  "https://images.unsplash.com/photo-1557682268-e3955ed5d83f?w=1200",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200",
  "https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=1200",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
];

const MOOD_ICONS: Record<string, string> = {
  "😊 良い": "😊",
  "😐 普通": "😐",
  "😞 イマイチ": "😞",
};

export function pickArticleIcon(source: string): { type: "emoji"; emoji: string } {
  const map: Record<string, string> = {
    "Hacker News": "🟠",
    "Zenn": "💠",
    "note": "📝",
    "Twitter": "🐦",
  };
  return { type: "emoji", emoji: map[source] || "📰" };
}

export function pickTaskIcon(title: string): { type: "emoji"; emoji: string } {
  for (const [pattern, emoji] of TASK_ICON_KEYWORDS) {
    if (pattern.test(title)) return { type: "emoji", emoji };
  }
  return { type: "emoji", emoji: "📌" };
}

export function pickJournalIcon(mood: string): { type: "emoji"; emoji: string } {
  const emoji = MOOD_ICONS[mood] || "📔";
  return { type: "emoji", emoji };
}

export function pickCover(hint?: string): { type: "external"; external: { url: string } } {
  if (hint) {
    const key = hint.toLowerCase();
    for (const [aspect, urls] of Object.entries(ASPECT_COVERS)) {
      if (key.includes(aspect)) {
        const url = urls[Math.floor(Math.random() * urls.length)];
        return { type: "external", external: { url } };
      }
    }
  }
  const url = GENERAL_COVERS[Math.floor(Math.random() * GENERAL_COVERS.length)];
  return { type: "external", external: { url } };
}
