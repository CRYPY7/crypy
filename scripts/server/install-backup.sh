#!/usr/bin/env bash
# CRYPY — install the backup script and its schedule. Run as root by setup.sh and update.sh; safe to run again.
# Root runs a copy in /usr/local/sbin taken from the committed code (git HEAD), never from the working folder: the app
# may write to its own folder, and root must only run what is in git.
set -euo pipefail
APP_DIR="/opt/crypy/app"
TARGET="/usr/local/sbin/crypy-backup"
CRON="/etc/cron.d/crypy-backup"
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

src="$(mktemp)"
# shellcheck disable=SC2024 # root writes the file on purpose; crypy only reads its own repository.
sudo -u crypy git -C "$APP_DIR" show HEAD:scripts/server/backup.sh >"$src"
if ! cmp -s "$src" "$TARGET" 2>/dev/null; then
  install -o root -g root -m 755 "$src" "$TARGET"
  echo "Backup script installed: $TARGET"
fi
rm -f "$src"

schedule="# CRYPY backups (scripts/server/install-backup.sh): nightly dump, copied to Cloudflare R2 once
# 'crypy-backup setup' has run; restore test every Sunday. Results: crypy-backup status, and /admin.
17 3 * * * root $TARGET run >/dev/null 2>&1
47 4 * * 0 root $TARGET restore-test >/dev/null 2>&1"
if [ "$(cat "$CRON" 2>/dev/null)" != "$schedule" ]; then
  printf '%s\n' "$schedule" >"$CRON"
  chmod 644 "$CRON"
  echo "Backup schedule written: $CRON"
fi

# First time: a backup and a restore test now, so /admin has real results at once (a few seconds for this database).
if [ ! -f /var/lib/crypy-backup/restore.json ]; then
  echo "First backup and restore test ..."
  "$TARGET" run || true
  "$TARGET" restore-test || true
fi
