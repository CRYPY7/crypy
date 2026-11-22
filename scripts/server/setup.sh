#!/usr/bin/env bash
# CRYPY — one-time server setup on a fresh Ubuntu 24.04 server (DigitalOcean droplet or similar).
#
# Run as root:   bash setup.sh https://github.com/<you>/<repo>.git crypy.org
#
# What it does (safe to run again; it skips what is already done):
#   1. Updates the system; turns on automatic security updates, a firewall (SSH, HTTP, HTTPS only) and fail2ban.
#   2. Adds 2 GB of swap (the site's build needs more memory than a 2 GB server has).
#   3. Installs Node.js 26 LTS, pnpm, PostgreSQL, nginx and certbot.
#   4. Creates the "crypy" user, the database (random password) and downloads the code to /opt/crypy/app.
#   5. Creates /opt/crypy/app/.env.local from the template; you paste your keys into it (never into a chat).
#   6. Builds the site, runs it as a service on 127.0.0.1:3000, and puts nginx in front of it.
#   7. Daily database backups to /var/backups/crypy (14 days kept).
# HTTPS is turned on afterwards with enable-https.sh, once the domain points to this server.
set -euo pipefail

REPO_URL="${1:-}"
DOMAIN="${2:-crypy.org}"
APP_USER="crypy"
APP_DIR="/opt/crypy/app"
NODE_MAJOR="26"
PNPM_VERSION="12.22.0"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (log in as root, or use: sudo bash setup.sh ...)."
[ -n "$REPO_URL" ] || die "Give the repository address, e.g.: bash setup.sh https://github.com/you/crypy.git crypy.org"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "This script is written for Ubuntu (found: ${PRETTY_NAME:-unknown})."

say "1/7 System updates, firewall, automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades ca-certificates gnupg nginx postgresql \
  certbot python3-certbot-nginx
dpkg-reconfigure -f noninteractive unattended-upgrades
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable
systemctl enable --now fail2ban

say "2/7 Swap (2 GB)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "3/7 Node.js ${NODE_MAJOR} and pnpm ${PNPM_VERSION}"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
npm install -g "pnpm@${PNPM_VERSION}"
node -v
pnpm -v

say "4/7 User, database and code"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/crypy --shell /bin/bash "$APP_USER"
mkdir -p /opt/crypy
chown "$APP_USER:$APP_USER" /opt/crypy
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
fi

DB_PASSWORD_FILE="/opt/crypy/.db-password"
if [ ! -f "$DB_PASSWORD_FILE" ]; then
  # Letters and digits only, so it is safe inside the connection address.
  head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32 > "$DB_PASSWORD_FILE"
  chown "$APP_USER:$APP_USER" "$DB_PASSWORD_FILE"
  chmod 600 "$DB_PASSWORD_FILE"
fi
DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='crypy'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE crypy LOGIN PASSWORD '${DB_PASSWORD}'"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='crypy'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE crypy OWNER crypy"
fi
# PostgreSQL listens on this server only (Ubuntu's default); make sure.
PG_CONF="$(sudo -u postgres psql -tAc 'SHOW config_file')"
grep -qE "^\s*listen_addresses\s*=\s*'localhost'" "$PG_CONF" || echo "listen_addresses = 'localhost'" >> "$PG_CONF"
systemctl restart postgresql

say "5/7 Settings file (.env.local)"
ENV_FILE="$APP_DIR/.env.local"
[ -f "$ENV_FILE" ] || sudo -u "$APP_USER" cp "$APP_DIR/.env.example" "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
if ! grep -qE '^ALCHEMY_API_KEY=.+' "$ENV_FILE" && [ -t 0 ]; then
  echo ""
  echo "Now paste your keys into the settings file (the same values as in .env.local on your PC):"
  echo "  ALCHEMY_API_KEY, ETH/BSC/BASE/ARBITRUM/POLYGON_RPC_URLS, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, TELEGRAM_BOT_TOKEN"
  echo "The server's own lines (site address, database, preview) are added automatically afterwards."
  echo "In the editor: paste with right-click, save with Ctrl+O then Enter, close with Ctrl+X."
  read -r -p "Press Enter to open the editor..." _
  nano "$ENV_FILE"
fi
# The server's own settings always win: remove any copies (for example pasted from the PC) and add them once.
sed -i -E '/^(NEXT_PUBLIC_SITE_URL|DATABASE_URL|PGLITE_DIR|CRYPY_PREVIEW|CRYPY_WORKER|TELEGRAM_API_URL|CRYPY_FAKE_TELEGRAM|CRYPY_DEBUG_[A-Z_]+)=/d' "$ENV_FILE"
sed -i '/^# ---- Set by setup.sh/d' "$ENV_FILE"
{
  echo "# ---- Set by setup.sh (run it again to change) ----"
  echo "NEXT_PUBLIC_SITE_URL=https://${DOMAIN}"
  echo "DATABASE_URL=postgres://crypy:${DB_PASSWORD}@localhost:5432/crypy"
  echo "CRYPY_PREVIEW=1"
} >> "$ENV_FILE"

say "6/7 Build and start the site"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile && pnpm build"
cat > /etc/systemd/system/crypy.service <<UNIT
[Unit]
Description=CRYPY web app
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
# Hardening: the app can only write to its own folder.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable crypy
systemctl restart crypy

cat > /etc/nginx/sites-available/crypy <<NGINX
# CRYPY: nginx in front of the app (see ARCHITECTURE.md §10d for why each header is set).
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 64k;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
        # Pages stream their live data: pass it on as it arrives.
        proxy_buffering off;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/crypy /etc/nginx/sites-enabled/crypy
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

say "7/7 Daily database backup"
mkdir -p /var/backups/crypy
chown postgres:postgres /var/backups/crypy
chmod 700 /var/backups/crypy
cat > /etc/cron.d/crypy-backup <<'CRON'
# Daily at 03:17: database dump, kept 14 days.
17 3 * * * postgres pg_dump -Fc crypy > /var/backups/crypy/crypy-$(date +\%F).dump && find /var/backups/crypy -name '*.dump' -mtime +14 -delete
CRON

say "Waiting for the site to answer"
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:3000/en; then break; fi
  sleep 2
done
if curl -fsS -o /dev/null http://127.0.0.1:3000/en; then
  IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo ""
  echo "Done. The site is running on this server (${IP})."
  echo "It only looks right over HTTPS (the site's security settings require it), so next:"
  echo "  1. Point ${DOMAIN} and www.${DOMAIN} to ${IP} (DNS A records at your domain registrar)."
  echo "  2. When they point here, run: bash ${APP_DIR}/scripts/server/enable-https.sh ${DOMAIN}"
else
  echo "The site didn't answer yet. See what it says with: journalctl -u crypy -n 80 --no-pager"
fi
