#!/bin/bash
# ============================================================
# NOVAPLAY Minigame Hub - Server Setup Script
# OS: CentOS 7 | Server: 108.165.255.110
# Run as root: bash server-setup.sh
# ============================================================
set -e

APP_DIR="/var/www/minigame-hub"
REPO="https://github.com/jacksun1983china/minigames.git"
DOMAIN="minigame.npgslot.com"
APP_PORT=3001

echo "======================================================"
echo "  NOVAPLAY Minigame Hub - Server Setup (CentOS 7)"
echo "======================================================"

# ── 1. Install Node.js 20 via nvm ─────────────────────────
echo "[1/9] Installing Node.js 20..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
echo "Node: $(node -v)"

# ── 2. Install pnpm and PM2 ───────────────────────────────
echo "[2/9] Installing pnpm and PM2..."
npm install -g pnpm pm2
echo "pnpm: $(pnpm -v) | PM2: $(pm2 -v)"

# ── 3. Install Nginx ──────────────────────────────────────
echo "[3/9] Installing Nginx..."
yum install -y epel-release
yum install -y nginx
systemctl enable nginx
systemctl start nginx

# ── 4. Install Certbot ────────────────────────────────────
echo "[4/9] Installing Certbot..."
yum install -y certbot python2-certbot-nginx || \
    yum install -y certbot python3-certbot-nginx || \
    echo "Certbot install failed, will use manual SSL"

# ── 5. Setup MySQL database ───────────────────────────────
echo "[5/9] Setting up MySQL database..."
MYSQL_ROOT_PASS="your_mysql_root_password"
DB_NAME="minigame_hub"
DB_USER="minigame_user"
DB_PASS="MinigameHub2024Secure"

mysql -u root -e "
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
" 2>/dev/null || echo "Database may already exist, continuing..."

echo "Database: ${DB_NAME} | User: ${DB_USER}"

# ── 6. Clone repository ───────────────────────────────────
echo "[6/9] Cloning repository..."
mkdir -p /var/www
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull origin main
else
    git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── 7. Create .env file ───────────────────────────────────
echo "[7/9] Creating environment file..."
cat > "$APP_DIR/.env" << ENVEOF
DATABASE_URL=mysql://${DB_USER}:${DB_PASS}@127.0.0.1:3306/${DB_NAME}
NODE_ENV=production
PORT=${APP_PORT}
JWT_SECRET=$(openssl rand -hex 32)
VITE_APP_TITLE=NOVAPLAY Minigame Hub
OWNER_OPEN_ID=admin
OWNER_NAME=Admin
ENVEOF

# ── 8. Build application ──────────────────────────────────
echo "[8/9] Building application..."
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm build

# Run database migrations
node scripts/migrate-new-tables.mjs

# ── 9. Configure Nginx and start app ─────────────────────
echo "[9/9] Configuring Nginx and starting app..."

# Nginx config
cat > /etc/nginx/conf.d/minigame-hub.conf << 'NGINXEOF'
server {
    listen 80;
    server_name minigame.npgslot.com;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        add_header         Cache-Control "no-store";
    }

    access_log /var/log/nginx/minigame-access.log;
    error_log  /var/log/nginx/minigame-error.log;
}
NGINXEOF

nginx -t && systemctl reload nginx

# Start with PM2
mkdir -p /var/log/pm2
pm2 delete minigame-hub 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.cjs" --env production
pm2 save
pm2 startup systemd 2>/dev/null || pm2 startup 2>/dev/null || true

echo ""
echo "======================================================"
echo "  Deployment complete"
echo "  HTTP:  http://${DOMAIN}"
echo "  For HTTPS, run: certbot --nginx -d ${DOMAIN}"
echo "  PM2 logs: pm2 logs minigame-hub"
echo "======================================================"
