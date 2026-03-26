import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AspectDatabase {
  envKey: string;
  displayName: string;
  schema: Record<string, string>;
}

export interface AspectManifest {
  name: string;
  description: string;
  notion: { databases: AspectDatabase[] };
  commands: string[];
  postSetupNotes: string[];
}

export async function loadAspectManifests(rootDir: string): Promise<AspectManifest[]> {
  const aspectsDir = join(rootDir, "aspects");
  const entries = readdirSync(aspectsDir, { withFileTypes: true });
  const manifests: AspectManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(aspectsDir, entry.name, "aspect.json");
    if (!existsSync(manifestPath)) continue;
    const data = JSON.parse(readFileSync(manifestPath, "utf-8")) as AspectManifest;
    manifests.push(data);
  }
  return manifests;
}

export function generateEnvLocal(
  apiKey: string,
  dbMap: Record<string, string>
): string {
  const lines = [`NOTION_API_KEY=${apiKey}`];
  for (const [key, id] of Object.entries(dbMap)) {
    lines.push(`${key}=${id}`);
  }
  return lines.join("\n") + "\n";
}

export function generateLifeConfig(
  selectedAspects: string[],
  user: { name: string; timezone: string; language: string }
): string {
  const allAspects = ["diet", "gym", "study", "daily", "events"];
  const aspects: Record<string, boolean> = {};
  for (const name of allAspects) {
    aspects[name] = selectedAspects.includes(name);
  }
  for (const name of selectedAspects) {
    aspects[name] = true;
  }
  return JSON.stringify({ aspects, user }, null, 2) + "\n";
}
