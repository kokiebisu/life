#!/usr/bin/env node
/**
 * One-time Gemini login script.
 * Opens a headed Chromium that Google accepts (bot-detection flags removed),
 * lets you log in manually, then saves the session to ~/.claude/gemini-auth.json.
 *
 * Run from the HOST (not devcontainer — needs a display):
 *   node scripts/gemini/save-session.mjs
 *
 * Requires playwright installed on the host:
 *   npm install -g playwright && npx playwright install chromium
 */

import { chromium } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const OUTPUT = join(homedir(), '.claude', 'gemini-auth.json');

const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
});

const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});

const page = await context.newPage();
await page.goto('https://gemini.google.com');

console.log('\nLog in to Google in the browser window.');
console.log('Once Gemini loads fully, press Enter here to save the session.\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Press Enter when ready... ', async () => {
  rl.close();
  await context.storageState({ path: OUTPUT });
  console.log(`\nSession saved to ${OUTPUT}`);
  await browser.close();
  process.exit(0);
});
