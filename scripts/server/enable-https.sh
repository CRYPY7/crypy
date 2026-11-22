#!/usr/bin/env bash
# CRYPY — turn on HTTPS (free Let's Encrypt certificate, renewed automatically).
# Run as root once crypy.org and www.crypy.org point to this server (directly or through Cloudflare):
#   bash enable-https.sh crypy.org            first time
#   bash enable-https.sh crypy.org --renew    get a fresh certificate now (used once when switching to Cloudflare)
set -euo pipefail
DOMAIN="${1:-crypy.org}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

# The challenge files are served from /var/www/html by every site block, also through Cloudflare's https redirect.
bash /opt/crypy/app/scripts/server/nginx-site.sh "$DOMAIN"

# Check that both names reach this server: place a test file and read it back through the domain.
PROBE="crypy-probe-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
echo "$PROBE" > "/var/www/html/.well-known/acme-challenge/$PROBE"
for name in "$DOMAIN" "www.$DOMAIN"; do
  got="$(curl -fsSL --max-time 15 "http://$name/.well-known/acme-challenge/$PROBE" 2>/dev/null || true)"
  if [ "$got" != "$PROBE" ]; then
    rm -f "/var/www/html/.well-known/acme-challenge/$PROBE"
    echo "$name doesn't reach this server yet. Check its DNS record and wait a few minutes, then run this again."
    exit 1
  fi
done
rm -f "/var/www/html/.well-known/acme-challenge/$PROBE"

EXTRA=()
[ "${2:-}" = "--renew" ] && EXTRA=(--force-renewal)
certbot certonly --webroot -w /var/www/html --non-interactive --agree-tos --register-unsafely-without-email \
  --deploy-hook "systemctl reload nginx" --cert-name "$DOMAIN" "${EXTRA[@]}" \
  -d "$DOMAIN" -d "www.$DOMAIN"
bash /opt/crypy/app/scripts/server/nginx-site.sh "$DOMAIN"
echo "HTTPS is on: https://${DOMAIN}/en"
