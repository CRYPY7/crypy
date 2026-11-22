#!/usr/bin/env bash
# CRYPY — turn on HTTPS (free Let's Encrypt certificate, renewed automatically).
# Run as root once crypy.org and www.crypy.org point to this server:   bash enable-https.sh crypy.org
set -euo pipefail
DOMAIN="${1:-crypy.org}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
IP="$(curl -fsS https://api.ipify.org)"
for name in "$DOMAIN" "www.$DOMAIN"; do
  found="$(getent ahostsv4 "$name" | awk '{print $1; exit}')"
  if [ "$found" != "$IP" ]; then
    echo "$name points to '${found:-nothing}', not to this server ($IP). Fix the DNS A record and wait a few minutes."
    exit 1
  fi
done
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect \
  -d "$DOMAIN" -d "www.$DOMAIN"
systemctl reload nginx
echo "HTTPS is on: https://${DOMAIN}/en"
