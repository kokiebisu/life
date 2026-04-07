#!/usr/bin/env bash
# Generates AGENTS.md for Codex CLI from CLAUDE.md + .ai/rules/ + .ai/commands/ summaries
# Run this after editing .ai/rules/, .ai/commands/, or CLAUDE.md

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$REPO_ROOT/AGENTS.md"

{
  # Main instructions
  cat "$REPO_ROOT/CLAUDE.md"
  echo ""

  # Rules (full content)
  for f in "$REPO_ROOT/.ai/rules/"*.md; do
    echo "---"
    echo ""
    cat "$f"
    echo ""
  done

  # Commands (summaries only — full definitions in .ai/commands/<name>.md)
  echo "---"
  echo ""
  echo "## Available Commands"
  echo ""
  echo "コマンドを呼び出すときは、対応する \`.ai/commands/<name>.md\` を読んでその指示に従うこと。"
  echo ""

  for f in "$REPO_ROOT/.ai/commands/"*.md; do
    name="$(basename "$f" .md)"
    # Extract first heading or first non-empty line as description
    desc="$(awk '
      /^---$/ { if (fm==0) { fm=1; next } else { fm=0; next } }
      fm==1 { next }
      /^#/ { sub(/^#+ /, ""); print; exit }
      NF && !printed { print; printed=1; exit }
    ' "$f")"
    echo "- **\`/$name\`** — $desc → \`.ai/commands/${name}.md\`"
  done
  echo ""
} > "$OUTPUT"

size=$(wc -c < "$OUTPUT")
echo "Generated $OUTPUT (${size} bytes)"
if [ "$size" -gt 32768 ]; then
  echo "WARNING: AGENTS.md exceeds Codex 32KB limit (${size} bytes)."
fi
