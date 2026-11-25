#!/usr/bin/env bash
# CRYPY — database backups. Installed by install-backup.sh as /usr/local/sbin/crypy-backup (root-owned, so the app
# can't change what root runs) and run by cron:
#
#   crypy-backup run            nightly: dump the database, keep 14 days here, and (once set up) encrypt the dump and
#                               copy it to Cloudflare R2, where copies older than 14 days are deleted
#   crypy-backup restore-test   weekly: restore the newest dump into a throwaway database, check that accounts,
#                               watchlists, alerts and portfolios came back, then delete it
#   crypy-backup setup          once, by the owner: R2 details, encryption keys and a full round trip
#   crypy-backup status         print the last results
#
# Results go to /var/lib/crypy-backup/{backup,restore}.json (no secrets: times, sizes, counts, step names); the app's
# health check reads them, shows them on /admin and messages the owner on Telegram when something fails.
# R2 copies are encrypted with age to a public key; the key that opens them is never kept on the server.
# 14 days everywhere: the privacy page promises that deleted data leaves the backups within 14 days.
# -E: the ERR traps below also catch failures inside functions.
set -Eeuo pipefail
umask 077

DB="${CRYPY_BACKUP_DB:-crypy}"
LOCAL_DIR="${CRYPY_BACKUP_LOCAL_DIR:-/var/backups/crypy}"
STATUS_DIR="${CRYPY_BACKUP_STATUS_DIR:-/var/lib/crypy-backup}"
CONF="${CRYPY_BACKUP_CONF:-/etc/crypy/backup.env}"
LOG="${CRYPY_BACKUP_LOG:-/var/log/crypy-backup.log}"
KEEP_DAYS=14
TEST_DB="${DB}_restore_test"
# Rebuilt by themselves, so not copied: saved wallet and token lookups (they also hold looked-up addresses, which
# needn't sit in a second company's storage) and short-lived sign-in and Telegram link codes.
EXCLUDE_DATA=(saved_results sign_in_nonces telegram_link_codes)
# What a restore must bring back: people's accounts and what they set up.
IMPORTANT=(users accounts watch_items alerts portfolios status_updates)

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
as_pg() { runuser -u postgres -- "$@"; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s %s\n' "$(now_iso)" "$*" >>"$LOG"; }

# Writes one status file atomically. Values come from this script only (times, numbers, step names).
write_status() { # name json
  mkdir -p "$STATUS_DIR"
  chmod 755 "$STATUS_DIR"
  local tmp="$STATUS_DIR/.$1.tmp"
  printf '%s\n' "$2" >"$tmp"
  chmod 644 "$tmp"
  mv "$tmp" "$STATUS_DIR/$1.json"
}
json_str() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

load_conf() {
  [ -f "$CONF" ] || return 1
  # shellcheck disable=SC1090
  . "$CONF"
  [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] &&
    [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${AGE_RECIPIENT:-}" ]
}

# rclone reads the R2 remote from the environment (never from the command line, so keys don't show in `ps`).
rclone_r2() {
  local empty
  empty="$(mktemp)"
  RCLONE_CONFIG="$empty" \
    RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true RCLONE_CONFIG_R2_ACL=private \
    rclone --retries 3 --low-level-retries 5 "$@" || {
    rm -f "$empty"
    return 1
  }
  rm -f "$empty"
}

# Size in bytes of one remote file, or nothing.
remote_size() {
  rclone_r2 lsjson --files-only "r2:$R2_BUCKET/$1" 2>>"$LOG" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["Size"] if d else "")' 2>>"$LOG"
}

# Newest remote copy: "name size age_hours", or nothing.
newest_remote() {
  rclone_r2 lsjson --files-only --include 'crypy-*.dump.age' "r2:$R2_BUCKET" 2>>"$LOG" |
    python3 -c '
import json, sys, datetime
files = json.load(sys.stdin)
if files:
    f = max(files, key=lambda f: f["ModTime"])
    t = datetime.datetime.fromisoformat(f["ModTime"].replace("Z", "+00:00"))
    age = (datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() / 3600
    print(f["Name"], f["Size"], round(age, 1))' 2>>"$LOG"
}

newest_dump() { find "$LOCAL_DIR" -maxdepth 1 -name 'crypy-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-; }

# ---------------------------------------------------------------------------------------------------------- run --
cmd_run() {
  local step="dump" started file tmp bytes uploaded="null" remote="null" work=""
  started="$(now_iso)"
  on_fail() {
    log "backup failed at step: $step"
    echo "Backup failed at step: $step (details in $LOG)."
    write_status backup "{\"at\":\"$started\",\"ok\":false,\"failedStep\":\"$step\",\"bytes\":null,\"uploaded\":$uploaded,\"remote\":$remote}"
    [ -n "$work" ] && rm -rf "$work"
  }
  trap on_fail ERR

  mkdir -p "$LOCAL_DIR"
  chown postgres:postgres "$LOCAL_DIR"
  chmod 700 "$LOCAL_DIR"
  file="$LOCAL_DIR/crypy-$(date -u +%F).dump"
  tmp="$LOCAL_DIR/.crypy-partial.dump"
  local excludes=()
  for t in "${EXCLUDE_DATA[@]}"; do excludes+=("--exclude-table-data=$t"); done
  as_pg pg_dump -Fc "${excludes[@]}" -f "$tmp" "$DB" 2>>"$LOG"
  step="check-dump"
  as_pg pg_restore --list "$tmp" >/dev/null 2>>"$LOG"
  mv "$tmp" "$file"
  bytes="$(stat -c %s "$file")"
  step="prune-local"
  find "$LOCAL_DIR" -maxdepth 1 -name 'crypy-*.dump' -mtime +$KEEP_DAYS -delete

  if load_conf; then
    uploaded=false
    work="$(mktemp -d)"
    local name enc size
    name="crypy-$(date -u +%Y-%m-%dT%H%MZ).dump.age"
    remote="$(json_str "$name")"
    step="encrypt"
    enc="$work/$name"
    age -r "$AGE_RECIPIENT" -o "$enc" "$file" 2>>"$LOG"
    step="upload"
    rclone_r2 copyto "$enc" "r2:$R2_BUCKET/$name" >>"$LOG" 2>&1
    step="verify-upload"
    size="$(remote_size "$name")"
    [ "$size" = "$(stat -c %s "$enc")" ]
    uploaded=true
    step="prune-remote"
    rclone_r2 delete --min-age "${KEEP_DAYS}d" --include 'crypy-*.dump.age' "r2:$R2_BUCKET" >>"$LOG" 2>&1
    rm -rf "$work"
    work=""
  fi
  trap - ERR
  write_status backup "{\"at\":\"$started\",\"ok\":true,\"failedStep\":null,\"bytes\":$bytes,\"uploaded\":$uploaded,\"remote\":$remote}"
  log "backup ok: $(basename "$file") $bytes bytes, uploaded=$uploaded"
  echo "Backup ok: $(basename "$file") ($bytes bytes)$([ "$uploaded" = true ] && echo ", copied to R2" || echo ", R2 not set up")."
}

# -------------------------------------------------------------------------------------------------- restore-test --
count() { as_pg psql -XtAc "select count(*) from public.$2" "$1" 2>/dev/null || echo missing; }

cmd_restore_test() {
  local step="find-dump" started dump counts="" ok=true problem="" remote="null"
  local missing_tables=() empty_tables=()
  started="$(now_iso)"
  on_fail() {
    log "restore test failed at step: $step"
    echo "Restore test failed at step: $step (details in $LOG)."
    as_pg dropdb --if-exists "$TEST_DB" 2>>"$LOG" || true
    write_status restore "{\"at\":\"$started\",\"ok\":false,\"failedStep\":\"$step\",\"problem\":null,\"dump\":null,\"tables\":{},\"remote\":$remote}"
  }
  trap on_fail ERR

  dump="$(newest_dump)"
  [ -n "$dump" ]
  step="restore"
  {
    as_pg dropdb --if-exists "$TEST_DB"
    as_pg createdb "$TEST_DB"
    as_pg pg_restore --no-owner --exit-on-error -d "$TEST_DB" "$dump"
  } 2>>"$LOG"
  step="compare"
  for t in "${IMPORTANT[@]}"; do
    local live restored
    live="$(count "$DB" "$t")"
    restored="$(count "$TEST_DB" "$t")"
    counts+="${counts:+,}\"$t\":{\"live\":$([ "$live" = missing ] && echo null || echo "$live"),\"restored\":$([ "$restored" = missing ] && echo null || echo "$restored")}"
    if [ "$restored" = missing ]; then
      missing_tables+=("$t")
    elif [ "$live" != missing ] && [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; then
      empty_tables+=("$t")
    fi
  done
  if [ ${#missing_tables[@]} -gt 0 ]; then
    ok=false
    problem="missing from the backup: ${missing_tables[*]}"
  elif [ ${#empty_tables[@]} -gt 0 ]; then
    ok=false
    problem="empty in the backup: ${empty_tables[*]}"
  fi
  step="cleanup"
  as_pg dropdb "$TEST_DB" 2>>"$LOG"

  if load_conf; then
    step="check-remote"
    local newest
    newest="$(newest_remote)"
    if [ -z "$newest" ]; then
      ok=false
      problem="${problem:-no copy in R2}"
      remote='{"name":null,"bytes":null,"ageHours":null}'
    else
      read -r rname rsize rage <<<"$newest"
      remote="{\"name\":$(json_str "$rname"),\"bytes\":$rsize,\"ageHours\":$rage}"
    fi
  fi
  trap - ERR
  local problem_json=null
  [ -n "$problem" ] && problem_json="$(json_str "$problem")"
  write_status restore "{\"at\":\"$started\",\"ok\":$ok,\"failedStep\":null,\"problem\":$problem_json,\"dump\":$(json_str "$(basename "$dump")"),\"tables\":{$counts},\"remote\":$remote}"
  log "restore test ok=$ok ${problem}"
  echo "Restore test: $([ "$ok" = true ] && echo "passed" || echo "FAILED: $problem") ($(basename "$dump"))."
  [ "$ok" = true ]
}

# --------------------------------------------------------------------------------------------------------- setup --
cmd_setup() {
  echo "CRYPY backups: copy encrypted nightly dumps to Cloudflare R2."
  echo "You need: your Cloudflare account ID, an R2 bucket, and an R2 API token (Access Key ID + Secret)"
  echo "with 'Object Read & Write' on that bucket only. Nothing you type here is shown or logged."
  echo
  for tool in rclone age; do
    command -v "$tool" >/dev/null || { echo "Installing $tool ..."; apt-get install -y -qq "$tool" >/dev/null; }
  done
  local account bucket key secret
  read -r -p "Cloudflare account ID (32 letters and digits): " account
  [[ "$account" =~ ^[0-9a-f]{32}$ ]] || { echo "That doesn't look like an account ID."; exit 1; }
  read -r -p "R2 bucket name: " bucket
  [[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo "That doesn't look like a bucket name."; exit 1; }
  read -r -p "Access Key ID: " key
  read -r -s -p "Secret Access Key (hidden): " secret
  echo
  [ -n "$key" ] && [ -n "$secret" ] || { echo "Both keys are needed."; exit 1; }

  local keydir keyfile recipient
  keydir="$(mktemp -d)"
  keyfile="$keydir/crypy-backup-key.txt"
  age-keygen -o "$keyfile" 2>/dev/null
  recipient="$(age-keygen -y "$keyfile")"

  mkdir -p "$(dirname "$CONF")"
  chmod 700 "$(dirname "$CONF")"
  {
    echo "# CRYPY backups (crypy-backup setup). Root only. The key that opens the copies is NOT here."
    printf 'R2_ACCOUNT_ID=%q\nR2_BUCKET=%q\nR2_ACCESS_KEY_ID=%q\nR2_SECRET_ACCESS_KEY=%q\nAGE_RECIPIENT=%q\n' \
      "$account" "$bucket" "$key" "$secret" "$recipient"
  } >"$CONF"
  chmod 600 "$CONF"

  echo "Making a backup and copying it to R2 ..."
  # Separate runs (not function calls): inside an `if`, bash would ignore failures within the function.
  if ! bash "$0" run; then
    shred -u "$keyfile" 2>/dev/null || rm -f "$keyfile"
    echo "The first backup failed (details in $LOG). Check the account ID, bucket and token, then run setup again."
    exit 1
  fi
  echo "Checking the round trip: download, decrypt, read ..."
  load_conf
  local name trip
  name="$(newest_remote | cut -d' ' -f1)"
  trip="$(mktemp -d)"
  rclone_r2 copyto "r2:$R2_BUCKET/$name" "$trip/back.age" >>"$LOG" 2>&1
  age -d -i "$keyfile" -o "$trip/back.dump" "$trip/back.age"
  chown -R postgres "$trip"
  as_pg pg_restore --list "$trip/back.dump" >/dev/null
  rm -rf "$trip"
  echo "Round trip passed: the copy in R2 downloads, decrypts and reads as a database backup."
  echo
  echo "=================================================================================================="
  echo " SAVE THIS KEY NOW in your password manager (one item, e.g. 'CRYPY backup key')."
  echo " It is the ONLY way to open the backups in R2. It will be deleted from this server."
  echo "=================================================================================================="
  cat "$keyfile"
  echo "=================================================================================================="
  local answer=""
  while [ "$answer" != "saved" ]; do read -r -p "Type 'saved' once it is in your password manager: " answer; done
  shred -u "$keyfile" 2>/dev/null || rm -f "$keyfile"
  rm -rf "$keydir"
  echo "Key removed from the server. Running the restore test ..."
  bash "$0" restore-test || true
  echo "Done. Nightly copies to R2 are on; the restore test runs every Sunday."
}

cmd_status() {
  for f in backup restore; do
    echo "$f: $(cat "$STATUS_DIR/$f.json" 2>/dev/null || echo 'none yet')"
  done
}

case "${1:-}" in
  run) cmd_run ;;
  restore-test) cmd_restore_test ;;
  setup) cmd_setup ;;
  status) cmd_status ;;
  *)
    echo "Usage: crypy-backup run | restore-test | setup | status"
    exit 2
    ;;
esac
