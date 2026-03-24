#!/usr/bin/env bash
# Resolve plugin path from this script location — works no matter where the repo is cloned.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="${OPENCLAW_PPS_PLUGIN_DIR:-$ROOT/openclaw-pps-plugin}"

if [[ ! -f "$PLUGIN_DIR/package.json" ]]; then
  echo "error: plugin not found at: $PLUGIN_DIR" >&2
  echo "  Set OPENCLAW_PPS_PLUGIN_DIR to override." >&2
  exit 1
fi

echo "Using plugin directory: $PLUGIN_DIR"
(cd "$PLUGIN_DIR" && npm install && npm run build)
openclaw plugins install "$PLUGIN_DIR"
echo "Done: openclaw plugins install $PLUGIN_DIR"
