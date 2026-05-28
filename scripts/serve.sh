#!/usr/bin/env bash
#
# serve.sh — one-line engine bootstrap.
#
# First run: generates a 32-byte Bearer token, saves it to
#   ~/.continuum/bridge.env with 0600 perms.
# Every run: sources that file (so the token is stable across restarts)
#   and starts `continuum serve` via the workspace dist.
#
# Usage:
#   bash scripts/serve.sh
#
# To rotate the token: delete ~/.continuum/bridge.env, re-run.
# To inspect: cat ~/.continuum/bridge.env
#
set -euo pipefail

ENV_FILE="$HOME/.continuum/bridge.env"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_BIN="$REPO_ROOT/packages/cli/dist/index.js"

if [ ! -f "$CLI_BIN" ]; then
  echo "serve.sh: CLI not built. Run \`npm run build\` from $REPO_ROOT first." >&2
  exit 1
fi

mkdir -p "$HOME/.continuum"
chmod 700 "$HOME/.continuum" || true

if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$(openssl rand -hex 32)"
  printf 'CONTINUUM_HTTP_TOKEN=%s\n' "$TOKEN" > "$ENV_FILE"
  printf 'CONTINUUM_PROJECT_ID=%s\n' "${CONTINUUM_PROJECT_ID:-continuum}" >> "$ENV_FILE"
  printf 'CONTINUUM_HTTP_PORT=%s\n' "${CONTINUUM_HTTP_PORT:-7878}" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "serve.sh: generated $ENV_FILE (chmod 600). Cat it to retrieve the token for Vercel." >&2
fi

# Load the file. `set -a` exports every assignment so the child node process
# sees them as env vars.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "serve.sh: loaded token (length=${#CONTINUUM_HTTP_TOKEN}) project=${CONTINUUM_PROJECT_ID} port=${CONTINUUM_HTTP_PORT:-7878}" >&2
echo "serve.sh: starting engine. Ctrl-C to stop." >&2

exec node "$CLI_BIN" serve
