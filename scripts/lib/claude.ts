/**
 * Claude API 共通ヘルパー
 */

import { loadEnv } from "./notion";

export function getAnthropicApiKey(): string {
  const env = loadEnv();
  const apiKey = env["ANTHROPIC_API_KEY"] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY must be set in .env.local or environment");
  }
  return apiKey;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function callClaude(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
): Promise<string> {
  const apiKey = getAnthropicApiKey();
  const model = options.model || "claude-haiku-4-5-20251001";
  const maxTokens = options.maxTokens || 4096;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (options.system) {
    body.system = options.system;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in Claude API response");
  }

  return textBlock.text;
}
