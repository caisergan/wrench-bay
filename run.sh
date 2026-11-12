#!/usr/bin/env bash
# Run Wrench Bay in the browser.
#
#   ./run.sh                  dev server (hot reload) on http://localhost:5190, opens the browser
#   ./run.sh --prod           production build, served on http://localhost:5191
#   ./run.sh dev autoplay     any other words become URL flags: opens /?dev&autoplay
#   ./run.sh cam=10,4         flags with values work too: /?cam=10,4
#   ./run.sh --no-open        start the server without opening a browser
#
# Ctrl+C stops the server. If the server is already running, it just opens the browser.
set -euo pipefail

cd "$(dirname "$0")"

mode=dev
open_browser=1
params=()
for arg in "$@"; do
  case "$arg" in
    --prod) mode=prod ;;
    --no-open) open_browser=0 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) params+=("${arg#\?}") ;;
  esac
done

if [ "$mode" = prod ]; then port=5191; else port=5190; fi

query=""
if [ ${#params[@]} -gt 0 ]; then
  query="?$(IFS='&'; echo "${params[*]}")"
fi
url="http://localhost:$port/$query"

open_url() {
  [ "$open_browser" = 1 ] || return 0
  if command -v open >/dev/null 2>&1; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  else echo "Open $1 in your browser"; fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (v20 or newer)." >&2
  exit 1
fi

# Server already up on this port? Just open the game.
if curl -s -o /dev/null "http://localhost:$port/"; then
  echo "Wrench Bay is already running on port $port."
  open_url "$url"
  exit 0
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Open the browser once the server answers, while the server runs in the foreground.
(
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "http://localhost:$port/"; then
      echo; echo "  Wrench Bay: $url"; echo
      open_url "$url"
      exit 0
    fi
    sleep 0.5
  done
  echo "Server did not start within 30s." >&2
) &

if [ "$mode" = prod ]; then
  npm run build
  exec npx vite preview --host --port "$port" --strictPort
else
  exec npx vite --host --port "$port" --strictPort
fi
