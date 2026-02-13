#!/bin/bash
# Sumitsugi Task Sync - Bidirectional
# Pulls 大株主 tasks into LIFE Daily Tasks, then pushes Done status back.
#
# Usage:
#   ./scripts/sumitsugi-sync.sh            # Full sync
#   ./scripts/sumitsugi-sync.sh --dry-run   # Preview without changes

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLAG="${1:-}"

echo "=== Pull: 大株主 tasks → LIFE Daily Tasks ==="
"$SCRIPT_DIR/sumitsugi-sync-pull.sh" $FLAG
echo ""

echo "=== Events: イベント → Local + Notion ==="
bun run "$SCRIPT_DIR/sumitsugi-sync-events.ts" $FLAG
echo ""

echo "=== Push: Done status → Sumitsugi Linear ==="
"$SCRIPT_DIR/sumitsugi-sync-push.sh" $FLAG
echo ""

echo "=== Sync complete ==="
