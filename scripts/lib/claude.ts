/**
 * Claude API 共通ヘルパー
 *
 * claude -p（Claude Code CLI）経由で呼び出す。
 * 認証は Claude Code の設定（OAuth / API キー）に委譲。
 */

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
}

export async function callClaude(
  messages: ClaudeMessage[],
  options: ClaudeOptions = {},
): Promise<string> {
  const model = options.model || "claude-haiku-4-5-20251001";
  const maxTokens = options.maxTokens || 4096;

  // Build the input from messages
  const input = messages.map((m) => m.content).join("\n\n");

  const args = ["-p", "--model", model, "--max-turns", "3"];
  if (options.system) {
    args.push("--system-prompt", options.system);
  }

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const proc = Bun.spawn(["claude", ...args], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`claude -p exited with code ${exitCode}: ${stderr}`);
  }

  const text = stdout.trim();
  if (!text) {
    throw new Error("No output from claude -p");
  }

  return text;
}
