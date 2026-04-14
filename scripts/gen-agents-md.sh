#!/usr/bin/env bash
# Generates AGENTS.md for Codex CLI from CLAUDE.md + .ai/rules/ + skills/ summaries
# Run this after editing .ai/rules/, skills/, or CLAUDE.md

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

  # Commands (summaries only — full definitions in skills/<name>/SKILL.md)
  echo "---"
  echo ""
  echo "## Available Commands"
  echo ""
  echo "コマンドを呼び出すときは、対応する \`skills/<name>/SKILL.md\` を読んでその指示に従うこと。"
  echo ""

  for skill_dir in "$REPO_ROOT/skills/"/*/; do
    name="$(basename "$skill_dir")"
    f="$skill_dir/SKILL.md"
    [ -f "$f" ] || continue
    # Extract description from frontmatter, fallback to first heading
    desc="$(awk '
      /^---$/ { if (fm==0) { fm=1; next } else { fm=0; next } }
      fm==1 && /^description:/ { sub(/^description:[[:space:]]*/, ""); print; exit }
    ' "$f")"
    if [ -z "$desc" ]; then
      desc="$(awk '
        /^---$/ { if (fm==0) { fm=1; next } else { fm=0; next } }
        fm==1 { next }
        /^#/ { sub(/^#+ /, ""); print; exit }
      ' "$f")"
    fi
    echo "- **\`/$name\`** — $desc → \`skills/${name}/SKILL.md\`"
  done
  echo ""
} > "$OUTPUT"

size=$(wc -c < "$OUTPUT")
echo "Generated $OUTPUT (${size} bytes)"
if [ "$size" -gt 32768 ]; then
  echo "WARNING: AGENTS.md exceeds Codex 32KB limit (${size} bytes)."
fi
