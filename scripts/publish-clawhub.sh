#!/usr/bin/env bash
set -euo pipefail

# Publish OpenClaw plugin package to a registry (ClawHub-compatible).
# Default mode is dry-run. Use --publish for real publish.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="${OPENCLAW_PPS_PLUGIN_DIR:-$ROOT/openclaw-pps-plugin}"
PUBLISH=0
TAG=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/publish-clawhub.sh [--publish] [--tag <tag>]

Options:
  --publish        Actually publish. Without this flag, script only validates and packs.
  --tag <tag>      npm dist-tag to publish under (e.g. latest, beta).
  -h, --help       Show help.

Environment:
  OPENCLAW_PPS_PLUGIN_DIR  Override plugin directory (default: <repo>/openclaw-pps-plugin)
  CLAWHUB_REGISTRY         Registry URL (default: https://registry.npmjs.org)
  CLAWHUB_TOKEN            Auth token for publish (optional in dry-run)

Examples:
  ./scripts/publish-clawhub.sh
  CLAWHUB_REGISTRY="https://registry.npmjs.org" CLAWHUB_TOKEN="***" ./scripts/publish-clawhub.sh --publish
  ./scripts/publish-clawhub.sh --publish --tag beta
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)
      PUBLISH=1
      shift
      ;;
    --tag)
      TAG="${2:-}"
      if [[ -z "$TAG" ]]; then
        echo "error: --tag requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$PLUGIN_DIR/package.json" ]]; then
  echo "error: plugin not found at: $PLUGIN_DIR" >&2
  echo "  Set OPENCLAW_PPS_PLUGIN_DIR to override." >&2
  exit 1
fi

REGISTRY="${CLAWHUB_REGISTRY:-https://registry.npmjs.org}"
NPMRC_TMP=""

cleanup() {
  if [[ -n "$NPMRC_TMP" && -f "$NPMRC_TMP" ]]; then
    rm -f "$NPMRC_TMP"
  fi
}
trap cleanup EXIT

echo "Using plugin directory: $PLUGIN_DIR"
echo "Target registry: $REGISTRY"

if [[ -n "${CLAWHUB_TOKEN:-}" ]]; then
  HOST="${REGISTRY#http://}"
  HOST="${HOST#https://}"
  HOST="${HOST%/}"
  NPMRC_TMP="$(mktemp)"
  {
    echo "registry=$REGISTRY"
    echo "//${HOST}/:_authToken=${CLAWHUB_TOKEN}"
  } > "$NPMRC_TMP"
  export NPM_CONFIG_USERCONFIG="$NPMRC_TMP"
fi

pushd "$PLUGIN_DIR" >/dev/null

echo "[1/4] Installing dependencies"
npm install

echo "[2/4] Building package (clean dist first to avoid stale files in tarball)"
rm -rf dist
npm run build

echo "[3/4] Running npm pack dry-run"
npm pack --dry-run

if [[ "$PUBLISH" -eq 0 ]]; then
  popd >/dev/null
  echo "Dry-run complete. Re-run with --publish to publish."
  exit 0
fi

if [[ -z "${CLAWHUB_TOKEN:-}" ]]; then
  echo "error: CLAWHUB_TOKEN is required when --publish is used" >&2
  popd >/dev/null
  exit 1
fi

echo "[4/4] Publishing package"
PUBLISH_ARGS=(publish --registry "$REGISTRY")
if [[ -n "$TAG" ]]; then
  PUBLISH_ARGS+=(--tag "$TAG")
fi
npm "${PUBLISH_ARGS[@]}"

popd >/dev/null
echo "Publish complete."
