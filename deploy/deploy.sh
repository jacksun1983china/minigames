#!/bin/bash
##############################################################
# Deployment script for minigame.npgslot.com
# Server: 108.165.255.110
# Run this script on the server as root
##############################################################

set -e

APP_DIR="/var/www/minigame-hub"
REPO="https://github.com/jacksun1983china/minigames"
BRANCH="main"
NODE_VERSION="20"

echo "======================================================"
echo "  NOVAPLAY Minigame Hub - Deployment Script"
echo "  Target: minigame.npgslot.com"
echo "======================================================"

# ── 1. Install dependencies ────────────────────────────────
echo "[1/8] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx

# Install Node.js 20 if not present
if ! command -v node &> /dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
    echo "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

# Install pnpm
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo "  Node: $(node -v) | pnpm: $(pnpm -v) | PM2: $(pm2 -v)"

# ── 2. Clone / pull repository ─────────────────────────────
echo "[2/8] Pulling latest code..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin "$BRANCH"
else
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 3. Install Node dependencies ──────────────────────────
echo "[3/8] Installing Node.js dependencies..."
pnpm install --frozen-lockfile

# ── 4. Build production bundle ────────────────────────────
echo "[4/8] Building production bundle..."
pnpm build

# ── 5. Configure environment ──────────────────────────────
echo "[5/8] Setting up environment..."
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚠️  WARNING: .env file not found!"
    echo "   Please create $APP_DIR/.env with the following variables:"
    echo ""
    echo "   DATABASE_URL=mysql://user:password@localhost:3306/minigame_hub"
    echo "   JWT_SECRET=your-super-secret-jwt-key-min-32-chars"
    echo "   NODE_ENV=production"
    echo "   PORT=3001"
    echo ""
    echo "   Then re-run this script."
    exit 1
fi

# ── 6. Configure Nginx ────────────────────────────────────
echo "[6/8] Configuring Nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/minigame-hub
ln -sf /etc/nginx/sites-available/minigame-hub /etc/nginx/sites-enabled/minigame-hub

# Test nginx config
nginx -t && systemctl reload nginx

# ── 7. SSL Certificate (Let's Encrypt) ───────────────────
echo "[7/8] Setting up SSL..."
if [ ! -f "/etc/letsencrypt/live/minigame.npgslot.com/fullchain.pem" ]; then
    echo "Obtaining SSL certificate..."
    certbot --nginx -d minigame.npgslot.com --non-interactive --agree-tos -m admin@npgslot.com
else
    echo "SSL certificate already exists, skipping..."
fi

# ── 8. Start / restart PM2 ───────────────────────────────
echo "[8/8] Starting application with PM2..."
mkdir -p /var/log/pm2

pm2 delete minigame-hub 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "======================================================"
echo "  ✅ Deployment complete!"
echo "  🌐 https://minigame.npgslot.com"
echo "  📊 PM2 status: pm2 status"
echo "  📋 Logs: pm2 logs minigame-hub"
echo "======================================================"
