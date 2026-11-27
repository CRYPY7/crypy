#!/usr/bin/env bash
# CRYPY — automatic deployment (owner decision 2026-11-27). Installed as /usr/local/sbin/crypy-deploy (root-owned copy
# taken from git HEAD by enable-deploy.sh and update.sh) and used as the forced command of GitHub's deploy key in
# /root/.ssh/authorized_keys: whatever the key asks for, sshd runs only this script, without a terminal or forwarding.
#
# It accepts exactly two requests (anything else is refused):
#   deploy        run update.sh (download GitHub's build, start it beside the live site, switch without a gap)
#   deploy perf   the same, then the speed measurement (scripts/perf/server.mjs)
set -Eeuo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
APP_DIR="/opt/crypy/app"

request="${SSH_ORIGINAL_COMMAND:-deploy}"
perf=0
case "$request" in
  deploy) ;;
  "deploy perf") perf=1 ;;
  *)
    echo "Refused: this key can only deploy." >&2
    exit 2
    ;;
esac

# One deployment at a time (a second push while one runs waits for it).
exec 9>/run/lock/crypy-deploy.lock
flock -w 1800 9 || {
  echo "Another deployment is still running." >&2
  exit 3
}

echo "Deployment requested by GitHub at $(date -u +%FT%TZ)"
bash "$APP_DIR/scripts/server/update.sh"

if [ "$perf" = 1 ]; then
  echo
  echo "Speed measurement:"
  (cd /tmp && node "$APP_DIR/scripts/perf/server.mjs") || echo "The speed measurement failed; the deployment itself succeeded."
fi
