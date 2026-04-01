#!/usr/bin/env bash
# Usage:
#   ./start.sh              — stdio (default)
#   ./start.sh stdio        — stdio
#   ./start.sh http [port]  — Streamable HTTP  (default port: 3000)
#   ./start.sh sse  [port]  — SSE legacy       (default port: 3000)
#
# Override KB directory:
#   KB_DIR=./my-kb ./start.sh http 8080

set -euo pipefail

TRANSPORT="${1:-stdio}"
PORT="${2:-3000}"

case "$TRANSPORT" in
  stdio|http|sse) ;;
  *)
    echo "Unknown transport: $TRANSPORT"
    echo "Usage: $0 [stdio|http|sse] [port]"
    exit 1
    ;;
esac

KB_DIR="${KB_DIR:-./knowledge-base}"

echo "[kb] Transport : $TRANSPORT"
if [[ "$TRANSPORT" != "stdio" ]]; then
  echo "[kb] Port      : $PORT"
fi
echo "[kb] KB dir    : $KB_DIR"
echo ""

exec env KB_DIR="$KB_DIR" TRANSPORT="$TRANSPORT" PORT="$PORT" \
  node dist/index.js
