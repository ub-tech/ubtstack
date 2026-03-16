#!/usr/bin/env bash
# start-symphony.sh — Launch the Symphony orchestrator.
#
# Usage:
#   ./bin/start-symphony.sh <path-to-WORKFLOW.md> [symphony-flags...]
#
# Example:
#   ./bin/start-symphony.sh ../your-target-repo/WORKFLOW.md --port 3003
#
# Environment:
#   SYMPHONY_PATH  — Path to symphony/elixir directory (default: ../symphony/elixir)
#   LINEAR_API_KEY — Required. Loaded from .env if present.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Load .env if present ─────────────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ── Resolve Symphony ─────────────────────────────────────────────────────────
SYMPHONY_DIR="${SYMPHONY_PATH:-$SCRIPT_DIR/../symphony/elixir}"
if [ ! -f "$SYMPHONY_DIR/bin/symphony" ]; then
  echo "ERROR: Symphony binary not found at $SYMPHONY_DIR/bin/symphony"
  echo ""
  echo "Build it first:"
  echo "  cd $(cd "$SYMPHONY_DIR" 2>/dev/null && pwd || echo "$SYMPHONY_DIR")"
  echo "  mise trust && mise install"
  echo "  mise exec -- mix setup && mise exec -- mix build"
  exit 1
fi

# ── Resolve WORKFLOW.md ──────────────────────────────────────────────────────
WORKFLOW="${1:-}"
if [ -z "$WORKFLOW" ]; then
  echo "Usage: $0 <path-to-WORKFLOW.md> [--port <port>] [--logs-root <dir>]"
  exit 1
fi
shift

if [ ! -f "$WORKFLOW" ]; then
  echo "ERROR: $WORKFLOW not found"
  exit 1
fi

WORKFLOW="$(cd "$(dirname "$WORKFLOW")" && pwd)/$(basename "$WORKFLOW")"

# ── Preflight ────────────────────────────────────────────────────────────────
if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "ERROR: LINEAR_API_KEY not set. Export it or add it to $SCRIPT_DIR/.env"
  exit 1
fi

echo "Symphony  : $SYMPHONY_DIR"
echo "Workflow  : $WORKFLOW"
echo "Extra args: ${*:-none}"
echo ""

# ── Launch ───────────────────────────────────────────────────────────────────
cd "$SYMPHONY_DIR"
exec mise exec -- ./bin/symphony "$WORKFLOW" \
  --i-understand-that-this-will-be-running-without-the-usual-guardrails \
  "$@"
