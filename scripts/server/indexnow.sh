#!/usr/bin/env bash
# CRYPY — tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) about the sitemap's pages.
#   bash /opt/crypy/app/scripts/server/indexnow.sh        (update.sh runs it after each update)
# The key is public by design: its file in public/ proves the site owns it. Google doesn't use IndexNow; it reads
# the sitemap submitted in Google Search Console. Skipped while the site is hidden from search engines.
set -euo pipefail
APP_DIR="/opt/crypy/app"
SITE="https://crypy.org"
for dir in /etc/letsencrypt/live/*/; do [ -d "$dir" ] && SITE="https://$(basename "$dir")" && break; done
KEY_FILE=""
for file in "$APP_DIR"/public/*.txt; do
  [[ "$(basename "$file")" =~ ^[0-9a-f]{32}\.txt$ ]] && KEY_FILE="$file" && break
done
[ -n "$KEY_FILE" ] || { echo "IndexNow: no key file in public/, skipped."; exit 0; }
KEY="$(basename "$KEY_FILE" .txt)"
# The live instance's port (update.sh switches between 3000 and 3001).
PORT="$(cat "$APP_DIR/.crypy-port" 2>/dev/null || echo 3000)"
case "$PORT" in 3000 | 3001) ;; *) PORT=3000 ;; esac
if curl -fsS "http://127.0.0.1:$PORT/robots.txt" | grep -qx 'Disallow: /'; then
  echo "IndexNow: the site is hidden from search engines (preview), skipped."; exit 0
fi
URLS="$(curl -fsS "http://127.0.0.1:$PORT/sitemap.xml" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g' | sort -u)"
[ -n "$URLS" ] || { echo "IndexNow: sitemap empty, skipped."; exit 0; }
HOST="${SITE#https://}"
LIST="$(printf '%s\n' "$URLS" | sed 's/.*/"&"/' | paste -sd, -)"
BODY="{\"host\":\"$HOST\",\"key\":\"$KEY\",\"keyLocation\":\"$SITE/$KEY.txt\",\"urlList\":[$LIST]}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json; charset=utf-8' \
  --max-time 20 --data "$BODY" https://api.indexnow.org/indexnow || true)"
echo "IndexNow: $(printf '%s\n' "$URLS" | wc -l) pages sent, answer $CODE (200 or 202 = accepted)."
