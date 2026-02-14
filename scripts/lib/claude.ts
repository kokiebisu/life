/**
 * Claude API 共通ヘルパー
 *
 * 認証優先順位:
 *   1. CLAUDE_CODE_OAUTH_TOKEN (Bearer auth) — Claude Code CLI OAuth トークン
 *   2. ANTHROPIC_API_KEY (x-api-key auth) — API キー
 */

import { loadEnv } from "./notion";

function getAuthHeaders(): Record<string, string> {
  const env = loadEnv();
  const oauthToken = env["CLAUDE_CODE_OAUTH_TOKEN"] || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = env["ANTHROPIC_API_KEY"] || process.env.ANTHROPIC_API_KEY;

  if (oauthToken) {
    return { "Authorization": `Bearer ${oauthToken}` };
  }
  if (apiKey) {
    return { "x-api-key": apiKey };
  }
  throw new Error("CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY must be set");
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
  const authHeaders = getAuthHeaders();
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
      "anthropic-version": "2023-06-01",
      ...authHeaders,
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
