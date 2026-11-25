#!/usr/bin/env bash
# CRYPY — put the latest code from GitHub live. Run as root on the server:   bash /opt/crypy/app/scripts/server/update.sh
#
# No gap for visitors (B-023): the new version is built into the folder that isn't live (.next-a or .next-b), started
# beside the live one on the other port (crypy@3000 / crypy@3001), and nginx moves to it only once it answers; the old
# one then finishes its open pages and stops. If the new version doesn't answer, it is stopped and nothing changed.
# Built static files are collected in .static, so pages already open in a browser keep finding the files of the
# version they were loaded with. The background worker runs in one process only: .crypy-worker names its port.
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

# The live instance: its port (.crypy-port) and how it runs. Before this script's first two-port update the site ran as
# the single service "crypy" on port 3000.
LIVE_PORT="$(cat "$APP_DIR/.crypy-port" 2>/dev/null || echo 3000)"
case "$LIVE_PORT" in 3000 | 3001) ;; *) LIVE_PORT=3000 ;; esac
if [ "$LIVE_PORT" = 3000 ]; then NEW_PORT=3001; else NEW_PORT=3000; fi
if systemctl is-active --quiet "crypy@$LIVE_PORT"; then LIVE_UNIT="crypy@$LIVE_PORT"; else LIVE_UNIT="crypy"; fi
NEW_UNIT="crypy@$NEW_PORT"

as_app() { sudo -u crypy bash -c "cd '$APP_DIR' && $1"; }
write_file() { as_app "printf '%s\n' '$2' > '$APP_DIR/$1.tmp' && mv '$APP_DIR/$1.tmp' '$APP_DIR/$1'"; }

answers() {
  for _ in $(seq 1 45); do curl -fs -o /dev/null "http://127.0.0.1:$1/en" && return 0; sleep 2; done
  return 1
}

bash "$APP_DIR/scripts/server/app-unit.sh"
# The live process keeps the background worker until the switch.
write_file .crypy-worker "$LIVE_PORT"
write_file ".crypy-instance-$NEW_PORT.env" "CRYPY_DIST_DIR=$NEW"
systemctl stop "$NEW_UNIT" 2>/dev/null || true
echo "Starting the new version on port $NEW_PORT beside the live one (port $LIVE_PORT) ..."
systemctl start "$NEW_UNIT"

if ! answers "$NEW_PORT"; then
  echo "The new version didn't answer: stopping it. The live site was not touched ($LIVE on port $LIVE_PORT)."
  systemctl stop "$NEW_UNIT" || true
  echo "Check: journalctl -u $NEW_UNIT -n 80 --no-pager"
  exit 1
fi

# Switch: nginx reloads gracefully (open connections finish on the old process), then the worker moves over.
write_file .crypy-port "$NEW_PORT"
write_file .crypy-dist "$NEW"
# Keep the web server settings current (domain from the certificate, or crypy.org).
# shellcheck disable=SC2010 # certificate folder names are domain names
DOMAIN="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -1 || true)"
if ! bash "$APP_DIR/scripts/server/nginx-site.sh" "${DOMAIN:-crypy.org}"; then
  echo "nginx didn't accept the new settings: staying on port $LIVE_PORT and stopping the new version."
  write_file .crypy-port "$LIVE_PORT"
  write_file .crypy-dist "$LIVE"
  systemctl stop "$NEW_UNIT" || true
  exit 1
fi
write_file .crypy-worker "$NEW_PORT"
systemctl enable "$NEW_UNIT" >/dev/null 2>&1

# Let the old process finish the pages it is still streaming, then stop it for good.
sleep 20
systemctl stop "$LIVE_UNIT" || true
systemctl disable "$LIVE_UNIT" >/dev/null 2>&1 || true
# The folder from before the two-folder switch is no longer needed.
if [ "$LIVE" != ".next" ] && [ "$NEW" != ".next" ] && [ -d "$APP_DIR/.next" ]; then rm -rf "$APP_DIR/.next"; fi
echo "Updated and running ($NEW on port $NEW_PORT, $(( $(date +%s) - started )) s after the code was pulled)."
bash "$APP_DIR/scripts/server/indexnow.sh" || true
