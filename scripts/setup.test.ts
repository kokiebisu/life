import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  loadAspectManifests,
  generateEnvLocal,
  generateLifeConfig,
} from "./lib/setup-helpers";

const TMP = join(import.meta.dir, "../.test-tmp");

beforeEach(() => {
  mkdirSync(join(TMP, "aspects/diet"), { recursive: true });
  mkdirSync(join(TMP, "aspects/gym"), { recursive: true });
  writeFileSync(
    join(TMP, "aspects/diet/aspect.json"),
    JSON.stringify({
      name: "diet",
      description: "食事管理",
      notion: {
        databases: [
          { envKey: "NOTION_MEALS_DB", displayName: "食事", schema: { 名前: "title", 日付: "date" } },
        ],
      },
      commands: ["meal"],
      postSetupNotes: [],
    })
  );
  writeFileSync(
    join(TMP, "aspects/gym/aspect.json"),
    JSON.stringify({
      name: "gym",
      description: "ジムログ",
      notion: {
        databases: [
          { envKey: "NOTION_GYM_DB", displayName: "ジム", schema: { 名前: "title", 日付: "date" } },
        ],
      },
      commands: ["gym"],
      postSetupNotes: ["Notion に種目プロパティを追加してください"],
    })
  );
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("loadAspectManifests", () => {
  test("loads manifests from aspects/ directory", async () => {
    const manifests = await loadAspectManifests(TMP);
    expect(manifests).toHaveLength(2);
    expect(manifests.map((m) => m.name).sort()).toEqual(["diet", "gym"]);
  });

  test("returns only aspects with aspect.json", async () => {
    mkdirSync(join(TMP, "aspects/study"), { recursive: true });
    const manifests = await loadAspectManifests(TMP);
    expect(manifests).toHaveLength(2);
  });
});

describe("generateEnvLocal", () => {
  test("generates .env.local content from DB map", () => {
    const dbMap = {
      NOTION_MEALS_DB: "abc-123",
      NOTION_GYM_DB: "def-456",
    };
    const result = generateEnvLocal("secret_token_xyz", dbMap);
    expect(result).toContain("NOTION_API_KEY=secret_token_xyz");
    expect(result).toContain("NOTION_MEALS_DB=abc-123");
    expect(result).toContain("NOTION_GYM_DB=def-456");
  });

  test("each entry is on its own line", () => {
    const result = generateEnvLocal("tok", { A: "1", B: "2" });
    const lines = result.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generateLifeConfig", () => {
  test("generates config with selected aspects enabled", () => {
    const result = generateLifeConfig(["diet", "gym"], {
      name: "Koki",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    const parsed = JSON.parse(result);
    expect(parsed.aspects.diet).toBe(true);
    expect(parsed.aspects.gym).toBe(true);
  });

  test("aspects not in selection are false", () => {
    const result = generateLifeConfig(["diet"], {
      name: "",
      timezone: "Asia/Tokyo",
      language: "ja",
    });
    const parsed = JSON.parse(result);
    expect(parsed.aspects.gym).toBe(false);
  });

  test("includes user config", () => {
    const result = generateLifeConfig([], {
      name: "Alice",
      timezone: "America/New_York",
      language: "en",
    });
    const parsed = JSON.parse(result);
    expect(parsed.user.name).toBe("Alice");
    expect(parsed.user.timezone).toBe("America/New_York");
  });
});
