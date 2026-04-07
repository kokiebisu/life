#!/usr/bin/env bash
# Generates AGENTS.md for Codex CLI from CLAUDE.md + .ai/rules/
# Run this after editing .ai/rules/ or CLAUDE.md

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$REPO_ROOT/AGENTS.md"

{
  cat "$REPO_ROOT/CLAUDE.md"
  echo ""
  for f in "$REPO_ROOT/.ai/rules/"*.md; do
    echo "---"
    echo ""
    cat "$f"
    echo ""
  done
} > "$OUTPUT"

echo "Generated $OUTPUT"
