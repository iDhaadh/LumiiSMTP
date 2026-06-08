#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SMTP Relay — Linux Production Deploy Script
# Run as root or a user with sudo + docker access
# Usage: bash deploy.sh yourdomain.com your@email.com
# ─────────────────────────────────────────────────────────────────────────────
set -e

DOMAIN="${1:-mail.yourdomain.com}"
EMAIL="${2:-admin@yourdomain.com}"
APP_DIR="/opt/smtp-relay"

echo "════════════════════════════════════════"
echo " SMTP Relay — Deploy"
echo " Domain : $DOMAIN"
echo " Email  : $EMAIL"
echo "════════════════════════════════════════"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/8] Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[2/8] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[2/8] Docker already installed — skipping"
fi

if ! command -v docker compose &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin
fi

# ── 3. Firewall ───────────────────────────────────────────────────────────────
echo "[3/8] Configuring firewall..."
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw allow 25/tcp   comment "SMTP"
ufw allow 465/tcp  comment "SMTPS"
ufw allow 587/tcp  comment "Submission"
ufw --force enable

# ── 4. Copy files ─────────────────────────────────────────────────────────────
echo "[4/8] Copying app files..."
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"
cd "$APP_DIR"

# ── 5. Environment file ───────────────────────────────────────────────────────
echo "[5/8] Setting up environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp .env.production .env

  # Generate strong secrets automatically
  POSTGRES_PASS=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
  REDIS_PASS=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '=/+' | head -c 64)

  sed -i "s/CHANGE_ME_STRONG_PASSWORD/$POSTGRES_PASS/g" .env
  sed -i "s/CHANGE_ME_REDIS_PASSWORD/$REDIS_PASS/g"     .env
  sed -i "s/CHANGE_ME_LONG_RANDOM_STRING_64_CHARS/$JWT_SECRET/g" .env
  sed -i "s/mail\.yourdomain\.com/$DOMAIN/g"            .env
  sed -i "s/yourdomain\.com/$(echo $DOMAIN | cut -d. -f2-)/g" .env

  echo "  ✓ Generated secrets and wrote .env"
else
  echo "  ✓ .env already exists — keeping it"
fi

# ── 6. TLS certificate ────────────────────────────────────────────────────────
echo "[6/8] Obtaining TLS certificate for $DOMAIN..."

# Temp nginx for ACME challenge
cat > /etc/nginx/sites-available/smtp-relay-temp <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 'ok'; }
}
EOF
ln -sf /etc/nginx/sites-available/smtp-relay-temp /etc/nginx/sites-enabled/smtp-relay-temp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot certonly --webroot -w /var/www/html \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring

# Auto-renew cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sort -u | crontab -

# ── 7. nginx production config ────────────────────────────────────────────────
echo "[7/8] Configuring nginx..."
cp nginx/smtp-relay.conf /etc/nginx/sites-available/smtp-relay
sed -i "s/mail\.yourdomain\.com/$DOMAIN/g" /etc/nginx/sites-available/smtp-relay
ln -sf /etc/nginx/sites-available/smtp-relay /etc/nginx/sites-enabled/smtp-relay
rm -f /etc/nginx/sites-enabled/smtp-relay-temp
nginx -t && systemctl reload nginx

# ── 8. Build and start containers ─────────────────────────────────────────────
echo "[8/8] Building and starting containers..."
docker compose -f docker-compose.prod.yml --env-file .env pull --ignore-pull-failures 2>/dev/null || true
docker compose -f docker-compose.prod.yml --env-file .env build
docker compose -f docker-compose.prod.yml --env-file .env up -d

# Wait for backend
echo "  Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health &>/dev/null; then
    echo "  ✓ API is up"
    break
  fi
  sleep 2
done

# Seed database (only if no users exist yet)
USER_COUNT=$(docker compose -f docker-compose.prod.yml exec -T backend \
  npx prisma db execute --file /dev/stdin <<< "SELECT COUNT(*) FROM users;" 2>/dev/null | grep -oP '\d+' | head -1 || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "  Seeding database..."
  docker compose -f docker-compose.prod.yml exec -T backend \
    npx ts-node --project tsconfig.seed.json prisma/seed.ts
fi

echo ""
echo "════════════════════════════════════════"
echo " ✓ Deploy complete!"
echo ""
echo "  Dashboard : https://$DOMAIN"
echo "  API       : https://$DOMAIN/api/v1"
echo "  Health    : https://$DOMAIN/health"
echo ""
echo "  Login     : admin@localhost"
echo "  Password  : admin123   ← CHANGE THIS"
echo ""
echo "  Next: add DNS records (see DNS_SETUP.md)"
echo "════════════════════════════════════════"
