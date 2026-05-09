#!/bin/sh
# v0.10 — start a virtual X display so headed Chromium can render.
# Cloudflare's bot-fight-mode flags headless Playwright on stricter agency
# Bonfire portals (TxDOT confirmed). Headed Chromium under xvfb passes the
# same checks a real desktop browser does.
#
# xvfb is small (~10 MB), starts in <1s, and idles at near-zero CPU when
# nothing is rendering. The trade-off vs. a non-xvfb container is negligible.

set -e

# Start Xvfb on display :99 to match $DISPLAY in the Dockerfile.
# -ac disables host-based access control (single-tenant container, no risk).
# +extension GLX +render enables hardware-render shims that some sites probe.
Xvfb :99 -screen 0 1366x900x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Give Xvfb a moment to come up, then verify before starting node so we don't
# start a process that won't be able to render.
sleep 1
if ! kill -0 "$XVFB_PID" 2>/dev/null; then
  echo "[entrypoint] WARN: Xvfb failed to start; headed Chromium will not work."
  echo "[entrypoint] tail of /tmp/xvfb.log:"
  tail -n 20 /tmp/xvfb.log || true
fi

exec node src/server.js
