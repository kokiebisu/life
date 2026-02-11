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

export function getTasksConfig() {
  return { apiKey: getApiKey(), dbId: getDbId("NOTION_TASKS_DB") };
}

export function notionHeaders(apiKey: string) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };
}

export async function notionFetch(apiKey: string, path: string, body?: unknown): Promise<any> {
  const method = body !== undefined ? "POST" : "GET";
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
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
