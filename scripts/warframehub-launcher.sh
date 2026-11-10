#!/usr/bin/env bash
# WarframeHub launcher (SPEC §9.2).
# Starts the server if it isn't running, waits until /api/health answers, then opens the
# browser. If it's already running, it just opens the browser. Nothing runs at boot.
#
# Environment (all optional): WFHUB_PORT (default 4317), WFHUB_DATA_DIR,
# WFHUB_NO_BROWSER=1 (start only; used by tests).
set -euo pipefail

REPO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
PORT="${WFHUB_PORT:-4317}"
URL="http://127.0.0.1:${PORT}/"

# Same rule as the server (apps/api/src/config.ts): a relative XDG_DATA_HOME is ignored.
if [[ -n "${WFHUB_DATA_DIR:-}" ]]; then
  DATA_DIR="$WFHUB_DATA_DIR"
elif [[ "${XDG_DATA_HOME:-}" == /* ]]; then
  DATA_DIR="$XDG_DATA_HOME/warframehub"
else
  DATA_DIR="$HOME/.local/share/warframehub"
fi
LOG="$DATA_DIR/server.log"

say() {
  echo "WarframeHub: $1" >&2
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name=WarframeHub "WarframeHub" "$1" || true
  fi
}

# Answers 0 only if the server on PORT is WarframeHub (not some other program).
is_up() {
  curl -fsS --max-time 2 "${URL}api/health" 2>/dev/null | grep -q '"app":"warframehub"'
}

port_taken() {
  curl -s --max-time 2 -o /dev/null "${URL}" 2>/dev/null
}

open_browser() {
  if [[ "${WFHUB_NO_BROWSER:-}" == "1" ]]; then
    echo "WarframeHub is running at $URL"
  else
    xdg-open "$URL" >/dev/null 2>&1 &
  fi
}

find_mise() {
  if command -v mise >/dev/null 2>&1; then
    command -v mise
    return
  fi
  # App-menu launches often have a short PATH, so look in the usual install places.
  for candidate in \
    "$HOME/.local/bin/mise" \
    /home/linuxbrew/.linuxbrew/bin/mise \
    "$HOME/.linuxbrew/bin/mise" \
    /usr/local/bin/mise \
    /usr/bin/mise; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  return 1
}

if is_up; then
  open_browser
  exit 0
fi

if port_taken; then
  say "Port $PORT is used by another program. Close it, or set WFHUB_PORT."
  exit 1
fi

if [[ ! -f "$REPO/apps/api/dist/server.js" || ! -f "$REPO/apps/web/dist/index.html" ]]; then
  say "WarframeHub isn't built yet. In $REPO run: npm ci && npm run build"
  exit 1
fi

if ! MISE="$(find_mise)"; then
  say "mise wasn't found, so the pinned Node version can't be used. Install mise (brew install mise), then run mise install in $REPO."
  exit 1
fi

mkdir -p "$DATA_DIR"
# Keep the log small: start a new one when it passes 1 MB.
if [[ -f "$LOG" ]] && (($(stat -c %s "$LOG") > 1048576)); then
  mv -f "$LOG" "$LOG.old"
fi

echo "---- $(date -u +%Y-%m-%dT%H:%M:%SZ) starting" >>"$LOG"
(
  cd "$REPO"
  WFHUB_PORT="$PORT" exec setsid "$MISE" exec -- node apps/api/dist/server.js
) >>"$LOG" 2>&1 </dev/null &
PID=$!
disown "$PID" 2>/dev/null || true

# Wait up to 30 seconds for the server to answer.
for _ in $(seq 60); do
  if is_up; then
    open_browser
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

say "WarframeHub didn't start. See the log: $LOG"
exit 1
