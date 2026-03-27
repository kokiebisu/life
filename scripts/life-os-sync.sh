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

    # Snapshot private paths before merge so we can restore them afterward
    PRIVATE_FILE=".life-private"
    private_paths=()
    if [ -f "$PRIVATE_FILE" ]; then
      while IFS= read -r line; do
        [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
        private_paths+=("$line")
      done < "$PRIVATE_FILE"
    fi

    # Stash any local changes to private paths so merge doesn't conflict on them
    if [ ${#private_paths[@]} -gt 0 ]; then
      git stash push --quiet -m "life-os-sync: private paths" -- "${private_paths[@]}" 2>/dev/null || true
    fi

    # Run merge; allow conflicts — we'll resolve private paths below
    git merge "$UPSTREAM_BRANCH" --no-ff -m "chore: merge life-os/main upstream" || true

    # Restore private paths: keep our version for any files deleted or conflicted by upstream
    if [ ${#private_paths[@]} -gt 0 ]; then
      git stash pop --quiet 2>/dev/null || true
      for p in "${private_paths[@]}"; do
        if git ls-files --error-unmatch "$p" &>/dev/null 2>&1 || [ -e "$p" ]; then
          git checkout HEAD -- "$p" 2>/dev/null || true
        fi
      done
      # Stage restored files and resolve any remaining conflicts
      git add "${private_paths[@]}" 2>/dev/null || true
    fi

    # If still in a merge state (unresolved non-private conflicts), let user handle it
    if git rev-parse -q --verify MERGE_HEAD &>/dev/null; then
      remaining=$(git diff --name-only --diff-filter=U 2>/dev/null | grep -vF "${private_paths[@]}" || true)
      if [ -n "$remaining" ]; then
        echo ""
        echo "⚠️  Unresolved conflicts in non-private files:"
        echo "$remaining"
        echo "Resolve manually, then: git commit && git push origin main"
      else
        git commit --no-edit
        echo ""
        echo "✅ Done. Push with: git push origin main"
      fi
    else
      echo ""
      echo "✅ Done. Push with: git push origin main"
    fi
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
