#!/usr/bin/env bash
# CRYPY — switch on automatic deployment from GitHub (run once, as root; safe to run again: it replaces the key).
#
#   bash /opt/crypy/app/scripts/server/enable-deploy.sh
#
# Creates a new SSH key that can do one thing only: run /usr/local/sbin/crypy-deploy (see deploy.sh). The private key
# is printed once, to be pasted into GitHub's secrets, and then deleted from this server. Never paste it into a chat.
set -euo pipefail
APP_DIR="/opt/crypy/app"
TARGET="/usr/local/sbin/crypy-deploy"
COMMENT="crypy-github-deploy"
[ "$(id -u)" -eq 0 ] || {
  echo "Run as root."
  exit 1
}

# Root runs only committed code: the deploy script comes from git HEAD, never from the working folder.
src="$(mktemp)"
# shellcheck disable=SC2024 # root writes the file on purpose; crypy only reads its own repository.
sudo -u crypy git -C "$APP_DIR" show HEAD:scripts/server/deploy.sh >"$src"
install -o root -g root -m 755 "$src" "$TARGET"
rm -f "$src"

if [ "$(sshd -T 2>/dev/null | awk '/^permitrootlogin/ {print $2}')" = "no" ]; then
  echo "Note: sshd has 'PermitRootLogin no', so GitHub's key can't log in. Set it to 'prohibit-password' first."
  exit 1
fi

dir="$(mktemp -d)"
chmod 700 "$dir"
trap 'rm -rf "$dir"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "$COMMENT" -f "$dir/key"

install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
# Replace an earlier deploy key, keep every other key as it is.
grep -v " $COMMENT\$" /root/.ssh/authorized_keys >"$dir/keys" || true
printf 'restrict,command="%s" %s\n' "$TARGET" "$(cat "$dir/key.pub")" >>"$dir/keys"
cat "$dir/keys" >/root/.ssh/authorized_keys

ip="$(hostname -I | awk '{print $1}')"
known="$ip $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"

cat <<EOF

Automatic deployment key created. It can only run $TARGET.

Open GitHub → the crypy repository → Settings → Secrets and variables → Actions → "New repository secret",
and add these three secrets (name, then value):

1) Name:  DEPLOY_HOST
   Value: $ip

2) Name:  DEPLOY_KNOWN_HOSTS
   Value: $known

3) Name:  DEPLOY_SSH_KEY
   Value: everything between the two lines below, including the BEGIN and END lines:
------------------------------------------------------------------------------------------
$(cat "$dir/key")
------------------------------------------------------------------------------------------

The private key is deleted from this server now. Don't paste it anywhere except GitHub's secret box.
EOF
