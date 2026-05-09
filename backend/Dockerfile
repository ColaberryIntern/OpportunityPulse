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

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# v0.10 — entrypoint starts Xvfb on :99 before node, so headed Chromium runs.
CMD ["scripts/docker-entrypoint.sh"]
