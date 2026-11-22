#!/usr/bin/env bash
# CRYPY — put the latest code from GitHub live. Run as root on the server:   bash /opt/crypy/app/scripts/server/update.sh
set -euo pipefail
APP_DIR="/opt/crypy/app"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
sudo -u crypy git -C "$APP_DIR" pull --ff-only
sudo -u crypy bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile && pnpm build"
systemctl restart crypy
# Keep the web server settings current (domain from the certificate, or crypy.org).
DOMAIN="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -1)"
bash "$APP_DIR/scripts/server/nginx-site.sh" "${DOMAIN:-crypy.org}"
for _ in $(seq 1 30); do curl -fs -o /dev/null http://127.0.0.1:3000/en && break; sleep 2; done
if curl -fsS -o /dev/null http://127.0.0.1:3000/en; then
  echo "Updated and running."
else
  echo "Not answering yet. Check: journalctl -u crypy -n 80 --no-pager"
  exit 1
fi
