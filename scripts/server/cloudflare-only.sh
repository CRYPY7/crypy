#!/usr/bin/env bash
# CRYPY — only Cloudflare may reach the website ports (80/443) on this server.
#   bash cloudflare-only.sh on     lock: web traffic only from Cloudflare's published ranges (SSH stays open)
#   bash cloudflare-only.sh off    unlock: web traffic from anywhere (use this if you ever stop using Cloudflare)
# Why: the server's own address was public before Cloudflare, so bots could skip Cloudflare's protection by calling
# it directly. Run "on" again now and then (or after Cloudflare announces new ranges) to refresh the list.
set -euo pipefail
MODE="${1:-on}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

remove_web_rules() {
  # Delete every existing rule for ports 80/443 (numbered from the bottom so numbers stay valid).
  while true; do
    n="$(ufw status numbered | grep -E '(80,443/tcp|Nginx Full|80/tcp|443/tcp)' | head -1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')"
    [ -n "$n" ] || break
    ufw --force delete "$n" >/dev/null
  done
}

if [ "$MODE" = "off" ]; then
  remove_web_rules
  ufw allow "Nginx Full"
  echo "Web ports open to everyone again."
  exit 0
fi

V4="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v4 || true)"
V6="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v6 || true)"
echo "$V4" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$' || { echo "Couldn't download Cloudflare's address list; nothing changed."; exit 1; }
echo "$V6" | grep -qE '^[0-9a-f:]+/[0-9]+$' || { echo "Couldn't download Cloudflare's IPv6 list; nothing changed."; exit 1; }

ufw allow OpenSSH >/dev/null
remove_web_rules
for range in $V4 $V6; do
  echo "$range" | grep -qE '^[0-9a-f.:]+/[0-9]+$' || continue
  ufw allow proto tcp from "$range" to any port 80,443 comment "Cloudflare" >/dev/null
done
ufw --force enable >/dev/null
# Refresh nginx's list of Cloudflare addresses too (visitor address for rate limits).
DOMAIN="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -1)"
bash /opt/crypy/app/scripts/server/nginx-site.sh "${DOMAIN:-crypy.org}" >/dev/null
echo "Done: the website ports accept only Cloudflare ($(echo $V4 $V6 | wc -w) ranges). SSH is unchanged."
echo "Check: https://${DOMAIN:-crypy.org}/en should still open; http://$(curl -fsS https://api.ipify.org)/ should not."
