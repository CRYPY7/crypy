#!/usr/bin/env bash
# CRYPY — put the latest code from GitHub live. Run as root on the server:   bash /opt/crypy/app/scripts/server/update.sh
#
# The live site keeps running while the new version builds: it is built into the folder that isn't live (.next-a or
# .next-b), then .crypy-dist is switched to it and the app restarts (a few seconds). If the new version doesn't answer,
# the previous one is put back. Built static files are collected in .static, so pages already open in a browser keep
# finding the files of the version they were loaded with.
set -euo pipefail
APP_DIR="/opt/crypy/app"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
# Commands below run as the crypy user, who may not enter root's home folder: work from the app folder.
cd "$APP_DIR"

# Step 1: get the code, then run the freshly pulled copy of this script (a script must not be rewritten while bash is
# reading it; this whole block is read before it runs).
if [ "${CRYPY_UPDATE_STAGE:-}" != "build" ]; then
  sudo -u crypy git -C "$APP_DIR" pull --ff-only
  copy="$(mktemp /tmp/crypy-update.XXXXXX)"
  cp "$APP_DIR/scripts/server/update.sh" "$copy"
  CRYPY_UPDATE_STAGE=build exec bash "$copy"
fi

started=$(date +%s)
LIVE="$(cat "$APP_DIR/.crypy-dist" 2>/dev/null || echo .next)"
case "$LIVE" in .next | .next-a | .next-b) ;; *) LIVE=".next" ;; esac
if [ "$LIVE" = ".next-a" ]; then NEW=".next-b"; else NEW=".next-a"; fi

echo "Building the new version into $NEW while the site keeps running from $LIVE ..."
# Each build folder keeps its own build cache (a folder's own cache makes compiling much faster; a copied one doesn't
# help). The very first build into a folder therefore takes longer.
# The type check already ran before the push (and on the PC); it costs about 80 s on this server.
# Lowest CPU and disk priority: on a 1-CPU server the live site must keep answering while this builds (health checks
# timed out during an earlier build).
LOW="nice -n 19"
if command -v ionice >/dev/null 2>&1; then LOW="$LOW ionice -c 2 -n 7"; fi
sudo -u crypy bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile && CRYPY_DIST_DIR='$NEW' CRYPY_SKIP_TYPECHECK=1 $LOW pnpm build"

# Static files of every recent version, side by side (names carry content hashes, so they never clash).
sudo -u crypy bash -c "cd '$APP_DIR' && mkdir -p '$APP_DIR/.static' && cp -r '$APP_DIR/$NEW/static/.' '$APP_DIR/.static/' && find '$APP_DIR/.static' -type f -mtime +30 -delete && find '$APP_DIR/.static' -type d -empty -delete"
mkdir -p "$APP_DIR/.static"

switch_to() {
  sudo -u crypy bash -c "cd '$APP_DIR' && printf '%s\n' '$1' > '$APP_DIR/.crypy-dist.tmp' && mv '$APP_DIR/.crypy-dist.tmp' '$APP_DIR/.crypy-dist'"
  systemctl restart crypy
}

answers() {
  for _ in $(seq 1 30); do curl -fs -o /dev/null http://127.0.0.1:3000/en && return 0; sleep 2; done
  return 1
}

switch_to "$NEW"
# Keep the web server settings current (domain from the certificate, or crypy.org).
# shellcheck disable=SC2010 # certificate folder names are domain names
DOMAIN="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -1 || true)"
bash "$APP_DIR/scripts/server/nginx-site.sh" "${DOMAIN:-crypy.org}"

if answers; then
  # The folder from before the two-folder switch is no longer needed.
  if [ "$LIVE" != ".next" ] && [ -d "$APP_DIR/.next" ]; then rm -rf "$APP_DIR/.next"; fi
  echo "Updated and running ($NEW, $(( $(date +%s) - started )) s after the code was pulled)."
  bash "$APP_DIR/scripts/server/indexnow.sh" || true
else
  echo "The new version didn't answer: putting the previous one ($LIVE) back."
  switch_to "$LIVE"
  if answers; then
    echo "Previous version running again. Check: journalctl -u crypy -n 80 --no-pager"
  else
    echo "Not answering. Check: journalctl -u crypy -n 80 --no-pager"
  fi
  exit 1
fi
