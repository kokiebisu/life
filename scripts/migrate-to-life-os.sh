#!/usr/bin/env bash
# migrate-to-life-os.sh
#
# Copies personal data from the old `life` repo into a fresh life-os fork.
#
# Usage (run from inside the NEW life-os fork):
#   bash /path/to/old-life/scripts/migrate-to-life-os.sh /path/to/old-life
#
# What this does:
#   - Copies personal data dirs (logs, notes, people, church, etc.)
#   - Copies personal config files (.env.local, .life-private, context.md)
#   - Copies .claude/ settings and hooks
#   - Does NOT overwrite scripts/, skills/, package.json, or generic rules

set -e

OLD="${1:-}"
if [ -z "$OLD" ]; then
  echo "Usage: $0 /path/to/old-life-repo"
  exit 1
fi

if [ ! -d "$OLD/.git" ]; then
  echo "Error: $OLD does not look like a git repo"
  exit 1
fi

NEW="$(pwd)"
echo "Migrating personal data from: $OLD"
echo "Into new fork at:             $NEW"
echo ""

copy_dir() {
  local src="$OLD/$1"
  local dst="$NEW/$1"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -r "$src/." "$dst/"
    echo "  ✓ $1/"
  else
    echo "  - $1/ (not found, skipping)"
  fi
}

copy_file() {
  local src="$OLD/$1"
  local dst="$NEW/$1"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  ✓ $1"
  else
    echo "  - $1 (not found, skipping)"
  fi
}

echo "=== Personal aspect data ==="
# From .life-private
copy_dir "aspects/church"
copy_dir "aspects/devotions"
copy_dir "aspects/guitar"
copy_dir "aspects/reading"
copy_dir "aspects/job"
copy_dir "aspects/investment"
copy_dir "aspects/people"

# Data dirs not in .life-private but still personal
copy_dir "aspects/diet/daily"
copy_dir "aspects/diet/events"
copy_dir "aspects/gym/logs"
copy_dir "aspects/daily"
copy_dir "aspects/events"
copy_dir "aspects/shopping"
copy_dir "aspects/study"
copy_dir "aspects/fashion"

echo ""
echo "=== Personal files ==="
copy_file "aspects/tasks.md"
copy_file "aspects/goal.md"
copy_file ".life-private"
copy_file ".ai/rules/context.md"
copy_file ".env.local"

# Gitignored investment files
copy_file "aspects/investment/portfolio.csv"
copy_file "aspects/investment/cash.csv"
copy_file "aspects/investment/.last-import.json"

echo ""
echo "=== Claude config ==="
copy_file ".claude/settings.json"
copy_file ".claude/settings.local.json"
if [ -d "$OLD/.claude/hooks" ]; then
  mkdir -p "$NEW/.claude/hooks"
  cp -r "$OLD/.claude/hooks/." "$NEW/.claude/hooks/"
  echo "  ✓ .claude/hooks/"
fi

# Personal rules symlink for context.md (if .claude/rules/ exists)
if [ -d "$NEW/.claude/rules" ] && [ -f "$NEW/.ai/rules/context.md" ]; then
  if [ ! -e "$NEW/.claude/rules/context.md" ]; then
    ln -s ../../.ai/rules/context.md "$NEW/.claude/rules/context.md"
    echo "  ✓ .claude/rules/context.md (symlink)"
  fi
fi

echo ""
echo "=== Post-migration steps ==="
echo "  1. bun install"
echo "  2. Verify .env.local has all NOTION_* DB IDs"
echo "  3. git remote add life-os https://github.com/kokiebisu/life-os.git"
echo "  4. Merge any personal CLAUDE.md customizations (see diff below)"
echo ""
echo "=== CLAUDE.md diff (old vs new) ==="
diff "$OLD/CLAUDE.md" "$NEW/CLAUDE.md" || true
echo ""
echo "Migration complete."
