FROM node:20-alpine

WORKDIR /app

# Bonfire scraper runs Playwright. On Alpine, Playwright's bundled Chromium
# doesn't work — we install the distro's chromium instead and point Playwright
# at it via executablePath in src/bonfire/scraper/browser.js. Adds ~200 MB but
# the alternative is switching the whole backend off Alpine.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    xvfb \
    xvfb-run \
    dbus \
    mesa-gl
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV BONFIRE_CHROMIUM_PATH=/usr/bin/chromium-browser
# v0.10 — DISPLAY is set so launchBrowser can use headed Chromium under xvfb,
# which passes Cloudflare bot-fight-mode challenges that headless cannot.
# Set BONFIRE_SCRAPER_HEADLESS=false in env to flip on the headed path.
ENV DISPLAY=:99

COPY package*.json ./
RUN npm ci --production

COPY .sequelizerc ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN mkdir -p logs && chmod +x scripts/docker-entrypoint.sh

EXPOSE 3001

# Probe READINESS, not liveness.
#
# /api/v1/health returns 200 unconditionally, so the old probe reported healthy
# even with the database unreachable. /api/v1/health/ready returns 503 when the
# database is down, and 200 when ready - or when only Redis is down, which is a
# cache and must not take the container out of service.
#
# The request carries its own error handler and timeout so every failure mode is
# deliberate: connection refused, hang, and not-ready all exit non-zero. The old
# one-liner had no error listener and failed on a refused connection only by way
# of an unhandled 'error' event.
#
# --timeout exceeds the endpoint's own 5s database timeout, so a slow database
# reports 503 rather than being cut off and reported as a hang.
# --start-period keeps a slow boot from burning the retry budget.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "const r=require('http').get({host:'localhost',port:3001,path:'/api/v1/health/ready',timeout:8000},(s)=>{s.resume();process.exit(s.statusCode===200?0:1)});r.on('timeout',()=>{r.destroy();process.exit(1)});r.on('error',()=>process.exit(1))"

# v0.10 — entrypoint starts Xvfb on :99 before node, so headed Chromium runs.
CMD ["scripts/docker-entrypoint.sh"]
