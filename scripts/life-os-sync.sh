#!/usr/bin/env bash
# life-os-sync.sh — bidirectional sync helper between life and life-os
# Usage:
#   ./scripts/life-os-sync.sh status        # show divergence
#   ./scripts/life-os-sync.sh pull          # life-os/main → life (merge)
#   ./scripts/life-os-sync.sh contrib       # show commits safe to push to life-os

set -e

REMOTE="life-os"
UPSTREAM_BRANCH="life-os/main"

cmd="${1:-status}"

case "$cmd" in
  status)
    echo "=== life-os fork status ==="
    git fetch "$REMOTE" --quiet
    ahead=$(git log --oneline "$UPSTREAM_BRANCH..HEAD" | wc -l | tr -d ' ')
    behind=$(git log --oneline "HEAD..$UPSTREAM_BRANCH" | wc -l | tr -d ' ')
    echo "life is $ahead commits ahead, $behind commits behind life-os"
    echo ""
    if [ "$behind" -gt 0 ]; then
      echo "--- Commits in life-os not yet in life ---"
      git log --oneline "HEAD..$UPSTREAM_BRANCH"
      echo ""
    fi
    if [ "$ahead" -gt 0 ]; then
      echo "--- Recent commits in life not yet in life-os ---"
      git log --oneline "$UPSTREAM_BRANCH..HEAD" | head -20
    fi
    ;;

  pull)
    echo "=== Merging life-os/main into life ==="
    git fetch "$REMOTE"
    behind=$(git log --oneline "HEAD..$UPSTREAM_BRANCH" | wc -l | tr -d ' ')
    if [ "$behind" -eq 0 ]; then
      echo "Already up to date with life-os/main."
      exit 0
    fi
    git merge "$UPSTREAM_BRANCH" --no-ff
    echo ""
    echo "Done. Push with: git push origin main"
    ;;

  contrib)
    echo "=== Commits potentially safe to contribute to life-os ==="
    echo "(touches only generic paths: scripts/, aspects/diet|gym|study config, .claude/, CLAUDE.md, etc.)"
    echo ""
    git fetch "$REMOTE" --quiet
    git log --oneline "$UPSTREAM_BRANCH..HEAD" -- \
      scripts/ \
      "aspects/diet/CLAUDE.md" "aspects/diet/aspect.json" \
      "aspects/gym/CLAUDE.md" "aspects/gym/aspect.json" "aspects/gym/profile.md" \
      "aspects/study/CLAUDE.md" "aspects/study/aspect.json" \
      ".claude/rules/" ".claude/skills/" \
      "CLAUDE.md" "package.json" "tsconfig.json" "life.config.example.json" \
      "bun.lock" \
      2>/dev/null || true
    ;;

  *)
    echo "Usage: $0 [status|pull|contrib]"
    exit 1
    ;;
esac
