#!/usr/bin/env bash
# CRYPY — write the nginx site for the domain (run as root; setup.sh, enable-https.sh and update.sh call it).
#   bash nginx-site.sh crypy.org
# With a certificate in /etc/letsencrypt/live/<domain>/: HTTPS with HTTP/2, http and www redirected to
# https://<domain>. Without one: plain HTTP (first setup, before enable-https.sh).
# Speed: the site's static files (/_next/static: scripts, styles, fonts) are sent by nginx straight from disk,
# compressed and cached for a year; pages go to the app over kept-alive connections.
set -euo pipefail
DOMAIN="${1:-crypy.org}"
APP_DIR="/opt/crypy/app"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
SITE="/etc/nginx/sites-available/crypy"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

# Behind Cloudflare (optional CDN): requests arrive from Cloudflare's servers. Take the visitor's own address from
# CF-Connecting-IP, but only when the request really comes from Cloudflare (its published ranges), so rate limits keep
# working per visitor and nobody else can fake the header. Harmless without Cloudflare.
CF_CONF="/etc/nginx/conf.d/cloudflare-realip.conf"
CF_V4="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v4 2>/dev/null || true)"
CF_V6="$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v6 2>/dev/null || true)"
if ! echo "$CF_V4" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$'; then
  CF_V4="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18
190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14
172.64.0.0/13 131.0.72.0/22"
fi
if ! echo "$CF_V6" | grep -qE '^[0-9a-f:]+/[0-9]+$'; then
  CF_V6="2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
fi
{
  echo "# Written by scripts/server/nginx-site.sh: visitor addresses behind Cloudflare."
  for range in $CF_V4 $CF_V6; do
    if echo "$range" | grep -qE '^[0-9a-f.:]+/[0-9]+$'; then echo "set_real_ip_from $range;"; fi
  done
  echo "real_ip_header CF-Connecting-IP;"
} > "$CF_CONF"

# Certificates are obtained and renewed through files in this folder (works with and without Cloudflare).
mkdir -p /var/www/html/.well-known/acme-challenge

# nginx (user www-data) must be able to read the static files: the folders above them may be entered, nothing more.
chmod o+x /opt/crypy "$APP_DIR"
[ -d "$APP_DIR/.next" ] && chmod o+x "$APP_DIR/.next"

PROXY='
        proxy_pass http://crypy_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        # Pages stream their live data: pass it on as it arrives.
        proxy_buffering off;'

STATIC="
    # Built files have content hashes in their names, so they never change: cache them for a year.
    location /_next/static/ {
        alias ${APP_DIR}/.next/static/;
        add_header Cache-Control \"public, max-age=31536000, immutable\";
        add_header X-Content-Type-Options nosniff;
        access_log off;
    }"

COMMON="
    client_max_body_size 64k;
    server_tokens off;
    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/css application/javascript text/javascript application/json image/svg+xml;"

{
  echo "# CRYPY (written by scripts/server/nginx-site.sh; see ARCHITECTURE.md §10d). Run it again instead of editing."
  echo "upstream crypy_app {"
  echo "    server 127.0.0.1:3000;"
  echo "    keepalive 32;"
  echo "}"
  if [ -f "${CERT_DIR}/fullchain.pem" ]; then
    cat <<NGINX

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://${DOMAIN}\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.${DOMAIN};
    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://${DOMAIN}\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
${COMMON}
    location /.well-known/acme-challenge/ { root /var/www/html; }
${STATIC}

    location / {${PROXY}
    }
}
NGINX
  else
    cat <<NGINX

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
${COMMON}
    location /.well-known/acme-challenge/ { root /var/www/html; }
${STATIC}

    location / {${PROXY}
    }
}
NGINX
  fi
} > "$SITE.new"

# Swap in the new file only if nginx accepts it; otherwise keep the old one (the site keeps running).
[ -f "$SITE" ] && cp "$SITE" "$SITE.previous"
mv "$SITE.new" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/crypy
rm -f /etc/nginx/sites-enabled/default
if ! nginx -t; then
  echo "nginx refused the new site file; the previous one is restored."
  if [ -f "$SITE.previous" ]; then mv "$SITE.previous" "$SITE"; fi
  exit 1
fi
systemctl reload nginx
echo "nginx site written for ${DOMAIN}$([ -f "${CERT_DIR}/fullchain.pem" ] && echo " (HTTPS, HTTP/2)")."
