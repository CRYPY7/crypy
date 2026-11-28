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

# The new build: downloaded from GitHub when it has built this exact commit (.github/workflows/server-build.yml),
# otherwise built here. CRYPY_BUILD_HERE=1 always builds here.
COMMIT="$(sudo -u crypy git -C "$APP_DIR" rev-parse HEAD)"
ORIGIN="$(sudo -u crypy git -C "$APP_DIR" remote get-url origin)"
REPO="$(printf '%s' "$ORIGIN" | sed -E 's#^(https://([^@/]+@)?github\.com/|git@github\.com:)##; s#\.git$##')"
ASSET="crypy${NEW}.tar.gz"

env_value() { grep -E "^$1=" "$APP_DIR/.env.local" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }

# The state of GitHub's "Server build" run for this commit: running, failed, done, none or unknown (public API,
# no key needed; unknown when GitHub can't be asked, in which case the wait simply continues).
github_run_state() {
  sudo -u crypy curl -fsS -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/workflows/server-build.yml/runs?head_sha=$COMMIT&per_page=5" 2>/dev/null |
    node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const runs = JSON.parse(s).workflow_runs ?? [];
          if (!runs.length) return console.log("none");
          const r = runs[0];
          if (r.status !== "completed") return console.log("running");
          console.log(r.conclusion === "success" ? "done" : "failed");
        } catch { console.log("unknown"); }
      });' 2>/dev/null || echo unknown
}

download_build() {
  case "$REPO" in */*) ;; *) echo "Not a GitHub repository ($ORIGIN): building here."; return 1 ;; esac
  local base="https://github.com/$REPO/releases/download/build-$COMMIT" dir
  dir="$(sudo -u crypy mktemp -d "$APP_DIR/.incoming.XXXXXX")"
  echo "Getting GitHub's build of ${COMMIT:0:7} ($NEW) ..."
  # GitHub needs a few minutes after the push; wait up to 20 minutes.
  local waited=0
  until sudo -u crypy curl -fsSL -o "$dir/$ASSET" "$base/$ASSET" 2>/dev/null; do
    if [ "$waited" -ge 1200 ]; then
      echo "GitHub's build didn't appear within 20 minutes (Actions tab on GitHub): building here instead."
      rm -rf "$dir"; return 1
    fi
    [ "$waited" -eq 0 ] && echo "Waiting for GitHub to finish building (checking every 20 s) ..."
    # A failed or cancelled build on GitHub, or none started 3 minutes after the push: don't wait for nothing.
    case "$(github_run_state)" in
      failed) echo "GitHub's build failed (Actions tab on GitHub): building here instead."; rm -rf "$dir"; return 1 ;;
      none) if [ "$waited" -ge 180 ]; then
          echo "GitHub hasn't started a build for this commit: building here instead."; rm -rf "$dir"; return 1
        fi ;;
    esac
    sleep 20; waited=$((waited + 20))
  done
  if ! sudo -u crypy curl -fsSL -o "$dir/$ASSET.sha256" "$base/$ASSET.sha256" ||
    ! (cd "$dir" && sha256sum -c --quiet "$ASSET.sha256"); then
    echo "GitHub's build didn't download intact: building here instead."
    rm -rf "$dir"; return 1
  fi
  sudo -u crypy tar -xzf "$dir/$ASSET" -C "$dir"
  local made="$dir/$NEW/crypy-build-env" key
  if [ "$(grep -E '^commit=' "$made" | cut -d= -f2-)" != "$COMMIT" ]; then
    echo "GitHub's build is for another commit: building here instead."
    rm -rf "$dir"; return 1
  fi
  for key in NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID; do
    if [ "$(grep -E "^$key=" "$made" | cut -d= -f2-)" != "$(env_value "$key")" ]; then
      echo "GitHub built with a different $key than this server's .env.local (repository variables on GitHub):"
      echo "building here instead. Set the same value on GitHub to use its builds."
      rm -rf "$dir"; return 1
    fi
  done
  # Replace the folder's contents but keep its build cache (used when a later update builds here).
  sudo -u crypy bash -c "mkdir -p '$APP_DIR/$NEW' && find '$APP_DIR/$NEW' -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} + && cp -a '$dir/$NEW/.' '$APP_DIR/$NEW/'"
  rm -rf "$dir"
  echo "Using GitHub's build."
}

sudo -u crypy bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile"
if [ "${CRYPY_BUILD_HERE:-}" = "1" ] || ! download_build; then
  echo "Building the new version into $NEW while the site keeps running from $LIVE ..."
  # Each build folder keeps its own build cache (a folder's own cache makes compiling much faster; a copied one doesn't
  # help). The very first build into a folder therefore takes longer.
  # The type check already ran before the push (and on the PC); it costs about 80 s on this server.
  # Lowest CPU and disk priority: on a 1-CPU server the live site must keep answering while this builds (health checks
  # timed out during an earlier build).
  LOW="nice -n 19"
  if command -v ionice >/dev/null 2>&1; then LOW="$LOW ionice -c 2 -n 7"; fi
  sudo -u crypy bash -c "cd '$APP_DIR' && CRYPY_DIST_DIR='$NEW' CRYPY_SKIP_TYPECHECK=1 $LOW pnpm build"
fi

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

# Warm-up before the switch: a fresh process loads each page's code on its first request (the first visitor after an
# update waited ~0.3 s more for the frame). Pages are opened with no user agent, which CRYPY treats as a crawler: their
# code loads but they make no blockchain lookups. APIs get invalid input: they load and answer "invalid" at once.
warm() {
  local base="http://127.0.0.1:$1" addr="0x000000000000000000000000000000000000dEaD"
  local tx="0x0000000000000000000000000000000000000000000000000000000000000001"
  local path
  for path in "/en/address/$addr" "/en/address/$addr/approvals" "/en/address/$addr/activity" "/en/tx/$tx" \
    "/en/token/ethereum/$addr" "/en/tools" "/en/tools/portfolio" "/en/tools/batch-balance" "/en/search?q=x" \
    "/api/v1/address/x/portfolio" "/api/v1/address/x/approvals" "/api/v1/address/x/activity" \
    "/api/v1/search/resolve?q=x" "/api/v1/token/ethereum/x/security" "/api/v1/tx/x" "/api/v1/gas"; do
    curl -s -o /dev/null -m 20 -A "" "$base$path" || true
  done
}
warm "$NEW_PORT"
echo "Warmed up the new version's pages."

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
# Backups: keep the installed script and schedule in step with the code (never stops the update).
bash "$APP_DIR/scripts/server/install-backup.sh" || echo "Backup install failed; the site is updated. Run it again: bash $APP_DIR/scripts/server/install-backup.sh"
bash "$APP_DIR/scripts/server/indexnow.sh" || true
