#!/usr/bin/env bash
# CRYPY — write the systemd unit that runs the site on a given port (crypy@3000 or crypy@3001). Used by setup.sh and
# update.sh; safe to run again. Two ports let an update start the new version beside the old one (no gap for visitors).
# Each instance reads its build folder from .crypy-instance-<port>.env (CRYPY_DIST_DIR=.next-a or .next-b).
set -euo pipefail
APP_DIR="/opt/crypy/app"
APP_USER="crypy"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

unit="$(cat <<UNIT
[Unit]
Description=CRYPY web app on port %i
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=CRYPY_INSTANCE_PORT=%i
EnvironmentFile=-${APP_DIR}/.crypy-instance-%i.env
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port %i
Restart=always
RestartSec=5
# Pages stream for a while: give a stopping instance time to finish them.
TimeoutStopSec=30
# Hardening: the app can only write to its own folder.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
)"
target=/etc/systemd/system/crypy@.service
if [ ! -f "$target" ] || [ "$(cat "$target")" != "$unit" ]; then
  printf '%s\n' "$unit" > "$target"
  systemctl daemon-reload
fi
