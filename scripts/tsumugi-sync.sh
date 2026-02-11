#!/bin/bash
# Tsumugi Task Sync - Bidirectional
# Pulls 大株主 tasks into LIFE Daily Tasks, then pushes Done status back.
#
# Usage:
#   ./scripts/tsumugi-sync.sh            # Full sync
#   ./scripts/tsumugi-sync.sh --dry-run   # Preview without changes

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLAG="${1:-}"

echo "=== Pull: 大株主 tasks → LIFE Daily Tasks ==="
"$SCRIPT_DIR/tsumugi-sync-pull.sh" $FLAG
echo ""

echo "=== Events: イベント → Local + Notion ==="
bun run "$SCRIPT_DIR/tsumugi-sync-events.ts" $FLAG
echo ""

echo "=== Push: Done status → Tsumugi Linear ==="
"$SCRIPT_DIR/tsumugi-sync-push.sh" $FLAG
echo ""

echo "=== Sync complete ==="
