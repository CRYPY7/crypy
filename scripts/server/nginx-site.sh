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
    return 301 https://${DOMAIN}\$request_uri;
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
