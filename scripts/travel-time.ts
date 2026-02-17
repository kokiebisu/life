#!/usr/bin/env bun
/**
 * 移動時間見積もり CLI
 *
 * Usage:
 *   bun run scripts/travel-time.ts --from "桜木町" --to "藤沢善行"
 *   bun run scripts/travel-time.ts --from "神奈川県立図書館" --to "藤沢善行" --depart 17:30
 *   bun run scripts/travel-time.ts --from "桜木町" --to "藤沢善行" --json
 */

import { estimateTravelTime } from "./lib/travel";
import { parseArgs, todayJST } from "./lib/notion";

async function main() {
  const { flags, opts } = parseArgs();

  if (flags.has("help") || !opts.from || !opts.to) {
    console.log(`Usage:
  bun run scripts/travel-time.ts --from <出発地> --to <目的地>
  bun run scripts/travel-time.ts --from <出発地> --to <目的地> --depart HH:MM
  bun run scripts/travel-time.ts --from <出発地> --to <目的地> --json`);
    process.exit(flags.has("help") ? 0 : 1);
  }

  let departureTime: string | undefined;
  if (opts.depart) {
    const today = todayJST();
    departureTime = `${today}T${opts.depart}:00+09:00`;
  }

  const result = await estimateTravelTime(opts.from, opts.to, departureTime);

  if (flags.has("json")) {
    console.log(JSON.stringify({
      from: opts.from,
      to: opts.to,
      minutes: result.minutes,
      summary: result.summary,
    }, null, 2));
  } else {
    console.log(`🚃 ${opts.from} → ${opts.to}: 約${result.minutes}分（${result.summary}）`);
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
