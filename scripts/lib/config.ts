import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../..");
const CONFIG_FILE = join(ROOT, "life.config.json");

export interface SleepConfig {
  target_bedtime: string;
  target_wakeup: string;
  ideal_bedtime: string;
  must_bedtime: string;
  duration_hours: number;
}

export interface LifeConfig {
  aspects: Record<string, boolean>;
  user: {
    name: string;
    timezone: string;
    language: string;
  };
  calendar?: {
    db_priority?: string[];
    sleep?: SleepConfig;
  };
}

const DEFAULT_CONFIG: LifeConfig = {
  aspects: {},
  user: { name: "", timezone: "Asia/Tokyo", language: "ja" },
  calendar: {
    db_priority: ["events", "todo", "routine", "meals", "groceries"],
    sleep: {
      target_bedtime: "22:00",
      target_wakeup: "05:00",
      ideal_bedtime: "23:00",
      must_bedtime: "24:00",
      duration_hours: 7,
    },
  },
};

let _configCache: LifeConfig | null = null;

export function loadConfig(): LifeConfig {
  if (_configCache) return _configCache;
  if (!existsSync(CONFIG_FILE)) return DEFAULT_CONFIG;
  const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as LifeConfig;
  _configCache = {
    ...DEFAULT_CONFIG,
    ...raw,
    calendar: { ...DEFAULT_CONFIG.calendar, ...raw.calendar },
  };
  return _configCache;
}

export function getDbPriority(): string[] {
  return loadConfig().calendar?.db_priority ?? DEFAULT_CONFIG.calendar!.db_priority!;
}

export function getSleepConfig(): SleepConfig {
  return loadConfig().calendar?.sleep ?? DEFAULT_CONFIG.calendar!.sleep!;
}
