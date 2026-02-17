#!/bin/bash
set -euo pipefail

# ============================================================
# Opportunity Pulse — Hetzner CX32 Server Setup
# Run this on a fresh Ubuntu 22.04/24.04 server.
#
# Usage:
#   1. SSH into your Hetzner server
#   2. Upload or clone this repo
#   3. Copy deploy/.env.prod.example to .env.prod and fill in values
#   4. Run: bash deploy/setup.sh
# ============================================================

APP_DIR="/opt/opportunity-pulse"
REPO_URL="https://github.com/ColaberryIntern/OpportunityPulse.git"

echo "=== Opportunity Pulse Server Setup ==="
echo ""

# --------------------------------------------------
# 1. System updates & dependencies
# --------------------------------------------------
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git ufw

# --------------------------------------------------
# 2. Install Docker & Docker Compose
# --------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[2/7] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  echo "[2/7] Docker already installed."
fi

# Ensure docker compose plugin is available
if ! docker compose version &>/dev/null; then
  echo "Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
fi

# --------------------------------------------------
# 3. Firewall
# --------------------------------------------------
echo "[3/7] Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --------------------------------------------------
# 4. Clone / update repo
# --------------------------------------------------
echo "[4/7] Setting up application..."
if [ -d "$APP_DIR" ]; then
  echo "App directory exists — pulling latest..."
  cd "$APP_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# --------------------------------------------------
# 5. Environment file
# --------------------------------------------------
echo "[5/7] Checking environment file..."
if [ ! -f "$APP_DIR/.env.prod" ]; then
  if [ -f "$APP_DIR/deploy/.env.prod.example" ]; then
    cp "$APP_DIR/deploy/.env.prod.example" "$APP_DIR/.env.prod"
    echo ""
    echo "  *** IMPORTANT: Edit .env.prod with your real values ***"
    echo "  nano $APP_DIR/.env.prod"
    echo ""
    echo "  Then re-run this script."
    exit 1
  else
    echo "ERROR: No .env.prod or .env.prod.example found."
    exit 1
  fi
fi

# Load env vars
set -a
source "$APP_DIR/.env.prod"
set +a

DOMAIN="${DOMAIN:?DOMAIN must be set in .env.prod}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set in .env.prod}"

# --------------------------------------------------
# 6. SSL Certificate (initial)
# --------------------------------------------------
echo "[6/7] Setting up SSL..."

# Start with HTTP-only nginx config for certbot challenge
cp "$APP_DIR/deploy/nginx/nginx-initial.conf" "$APP_DIR/deploy/nginx/active.conf"

# Build and start services (without SSL first)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build nginx backend frontend postgres

echo "Waiting for services to start..."
sleep 10

# Check if cert already exists
if [ ! -d "/var/lib/docker/volumes/opportunity-pulse_certbot-certs/_data/live/$DOMAIN" ]; then
  echo "Obtaining SSL certificate for $DOMAIN..."
  docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm certbot \
    certonly --webroot -w /var/www/certbot \
    --email "$CERTBOT_EMAIL" \
    --agree-tos --no-eff-email \
    -d "$DOMAIN"

  # Switch to full SSL nginx config
  cp "$APP_DIR/deploy/nginx/nginx.conf" "$APP_DIR/deploy/nginx/active.conf"

  # Reload nginx with SSL config
  docker compose -f docker-compose.prod.yml --env-file .env.prod exec nginx nginx -s reload
else
  echo "SSL certificate already exists."
  cp "$APP_DIR/deploy/nginx/nginx.conf" "$APP_DIR/deploy/nginx/active.conf"
fi

# --------------------------------------------------
# 7. Start all services
# --------------------------------------------------
echo "[7/7] Starting all services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "Waiting for backend to be healthy..."
sleep 15

# Run migrations
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  node -e "const db = require('./src/models'); db.sequelize.sync({ alter: true }).then(() => { console.log('Migrations complete'); process.exit(0); })"

# Seed data sources
echo "Seeding data sources..."
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  npx sequelize-cli db:seed:all --config src/config/database.js --seeders-path src/seeders 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "  App:       https://$DOMAIN"
echo "  API:       https://$DOMAIN/api/v1/health"
echo "  Logs:      docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop:      docker compose -f docker-compose.prod.yml down"
echo "  Restart:   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  To update:  cd $APP_DIR && git pull && docker compose -f docker-compose.prod.yml up -d --build"
echo ""
