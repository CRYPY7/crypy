# CRYPY

The wallet safety and research toolkit for BNB Chain and Ethereum users — in your language.
Production domain: **crypy.org**

CRYPY is non-custodial: it never asks for seed phrases or private keys, and every research tool works on public addresses without connecting a wallet.

> **Status:** M3 built: universal search finds real addresses, tokens and transactions on Ethereum and BNB Chain; address pages show real balances and USD values (Balance Scanner); wallets can connect (optional, never signs); four browser tools are live. Every tool page says honestly whether it is live. See [PROGRESS.md](./PROGRESS.md).

## Requirements

- Node.js 22 or newer (LTS recommended)
- pnpm 12 (`npm install -g pnpm`)
- Git

## Run it on your computer

```bash
pnpm install          # install dependencies (first time, and after pulling changes)
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
pnpm dev              # start the development server
```

Open <http://localhost:3000>. You'll be sent to `/en`. Try `/ur` to see the right-to-left layout.

### Keys (optional, free)

The site works without any keys using free public nodes. For more reliable data, add to `.env.local`:

- `ALCHEMY_API_KEY` — server-only, from the Alchemy dashboard (enable Ethereum and BNB Smart Chain mainnet for the app).
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — from Reown Cloud; turns on the QR code and phone wallets. In Reown, allow only `crypy.org` and `localhost`.

- `ETH_RPC_URLS` / `BSC_RPC_URLS` — extra **free** providers (endpoint URLs from their dashboards, comma-separated). CRYPY never uses paid APIs: providers rotate with daily budgets, then free public nodes.

Restart `pnpm dev` after changing `.env.local`. Check your keys any time with `pnpm env:check` (never prints the values), and see which provider each chain uses at <http://localhost:3000/api/v1/health>.

## Useful commands

| Command                        | What it does                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Development server with live reload                                                                                                       |
| `pnpm build` then `pnpm start` | Production build and server (closest to the real site)                                                                                    |
| `pnpm check`                   | Type check, lint, unit tests and production build, in the right order                                                                     |
| `pnpm test`                    | Unit tests (Vitest). `LIVE=1 pnpm test tests/unit/live.test.ts` also checks real chains                                                   |
| `pnpm test:e2e`                | Browser tests (Playwright), including the performance budget. Run `pnpm build` first. First time: `pnpm exec playwright install chromium` |
| `pnpm env:check`               | Checks `.env.local` and live-tests the Alchemy key without printing any values                                                            |
| `pnpm i18n:check`              | Validates all translation files against English                                                                                           |
| `pnpm format`                  | Formats the code with Prettier                                                                                                            |

## Putting it online (one server)

CRYPY runs on one Ubuntu 24.04 server (for example a DigitalOcean droplet, 2 GB RAM): nginx in front, the app as a
service on `127.0.0.1:3000`, PostgreSQL for accounts and alerts, a free Let's Encrypt certificate. All of it is set
up by the scripts in `scripts/server/` (see ARCHITECTURE.md §10d for the security settings they apply).

1. **Server:** log in as root (`ssh root@<server-ip>`) and run, with your repository's address:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/scripts/server/setup.sh -o setup.sh
   bash setup.sh https://github.com/<you>/<repo>.git crypy.org
   ```
   It asks you to paste your keys into the server's `.env.local` (the same keys as on your PC; never in a chat).
2. **Domain:** at your registrar, point `crypy.org` and `www.crypy.org` to the server's IP (two DNS `A` records).
3. **HTTPS:** once the domain points to the server: `bash /opt/crypy/app/scripts/server/enable-https.sh crypy.org`.
4. **Updates later:** commit and push from your PC, then on the server:
   `bash /opt/crypy/app/scripts/server/update.sh`. GitHub builds the site after each push (Actions tab, about 5–8
   minutes) and the server downloads that build; started earlier, the script waits for it. If GitHub's build isn't
   usable, the server builds it itself (`CRYPY_BUILD_HERE=1` forces that). One-time setup on GitHub: Settings →
   Secrets and variables → Actions → Variables: `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`,
   the same values as in the server's `.env.local`.

The web server settings live in `scripts/server/nginx-site.sh` (run by the other scripts; run it again instead of
editing nginx by hand). Useful on the server: `systemctl status 'crypy@*'`, `journalctl -u 'crypy@*' -n 100 --no-pager` (the app's log; it
runs as `crypy@3000` or `crypy@3001`, and each update switches to the other without a gap), backups: see
"Backups" below. `CRYPY_PREVIEW=1` (set by `setup.sh`) keeps search engines out; removing it
from the server's `.env.local` and running `update.sh` opens the site to search engines (done for crypy.org's public
beta on 2026-11-22).

After each update, `update.sh` also runs `indexnow.sh`, which tells Bing and other IndexNow search engines about the
sitemap's pages. SEO plan and status: `SEO_ROADMAP.md`.

Behind Cloudflare, `bash /opt/crypy/app/scripts/server/cloudflare-only.sh on` lets only Cloudflare reach the web
ports (run it again now and then to refresh Cloudflare's address list; `off` undoes it).

### Backups

Every night at 03:17 UTC the server saves the database to `/var/backups/crypy` (kept 14 days) and, once set up below,
copies it **encrypted** to a Cloudflare R2 bucket (also kept 14 days: the privacy page promises that deleted data leaves
the backups within 14 days). Every Sunday a **restore test** restores the newest backup into a throwaway database and
checks that accounts, watchlists, alerts and portfolios came back. Results: `crypy-backup status` on the server, the
"Database backups" row on /admin, and a Telegram message to you if a backup, its R2 copy or a restore test fails.
Cached wallet and token lookups (`saved_results`) aren't copied: they rebuild themselves, and visitors' looked-up
addresses needn't sit in a second company's storage. All of this is installed by `update.sh`
(`scripts/server/install-backup.sh`; the script runs as `/usr/local/sbin/crypy-backup`, a root-owned copy of
`scripts/server/backup.sh` taken from git).

**One-time R2 setup (owner):**

1. Cloudflare dashboard → **R2 Object Storage** → enable it (free up to 10 GB; it may ask for a card, nothing is
   charged at CRYPY's size) → **Create bucket**, e.g. `crypy-backups` (location: Automatic).
2. R2 → **Manage API tokens** → **Create API token**: permission **Object Read & Write**, **only** the
   `crypy-backups` bucket. Keep the page open: it shows the **Access Key ID** and **Secret Access Key** once. Your
   **Account ID** is on the R2 overview page.
3. On the server: `crypy-backup setup`. Paste the account ID, bucket name and both keys (the secret isn't shown).
   It makes a backup, copies it to R2, downloads it again, decrypts it and reads it (a full round trip).
4. It then prints the **backup key** (`AGE-SECRET-KEY-1…`) once. Save it in your password manager as
   "CRYPY backup key". It is the only way to open the copies in R2, and it is deleted from the server. Never paste it
   into a chat.

**Restoring (if the server is lost):**

1. Make a new server with `setup.sh` (above). It starts with an empty database.
2. Cloudflare → R2 → `crypy-backups` → download the newest `crypy-….dump.age`, and copy it to the server
   (`scp crypy-….dump.age root@<server-ip>:/root/`).
3. On the server, put the backup key in a file only root can read: `nano /root/backup-key.txt` (paste, save), then:
   ```bash
   apt-get install -y age
   age -d -i /root/backup-key.txt -o /root/crypy.dump /root/crypy-*.dump.age
   shred -u /root/backup-key.txt
   systemctl stop 'crypy@*'
   chown postgres /root/crypy.dump && mv /root/crypy.dump /var/backups/crypy/restore.dump
   runuser -u postgres -- pg_restore --clean --if-exists --no-owner --role=crypy --exit-on-error -d crypy /var/backups/crypy/restore.dump
   systemctl start crypy@3000
   ```
   (Use `crypy@3001` instead if `cat /opt/crypy/app/.crypy-port` says 3001.) Accounts, watchlists, alerts, Telegram
   links and portfolios are back; saved lookups refill as people use the site.
4. If the old server still exists but its database is damaged, step 3 alone works with the newest file in
   `/var/backups/crypy` (no decryption needed).

Only one running server may use the Telegram bot token: when the live site has it, set `CRYPY_WORKER=off` in your
PC's `.env.local` (or use a second test bot there).

## Project layout

```
messages/            Translations: one JSON file per language (en is complete)
src/app/[locale]/    Pages (every URL starts with a language, e.g. /en/tools)
src/components/      UI: layout (header, menus), search, tools, shadcn/ui primitives
src/config/          Tool registry (tools.ts), chains (chains.ts) and public settings (env.ts)
src/server/          Server-only code: chain adapters, search resolver, API helpers, rate limits
src/wallets/         Optional wallet connection (loaded only when used)
src/modules/tools/   Browser tools: logic, widget and server wrapper per tool
scripts/             Helper scripts (env:check)
src/i18n/            Language registry, detection and message loading
src/lib/             Search format detection, routes, metadata helpers
src/proxy.ts         Sends "/" to the visitor's language
tests/               Unit (Vitest) and browser (Playwright) tests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design and [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) for milestones.

## Adding things

- **A tool:** add it to `src/config/tools.ts` and its texts to `messages/en.json` under `tools.<id>`. It appears in the menu, home page and tool pages automatically. Keep `status: "soon"` until it works with real data and is tested. When it goes live, give it its own folder in `src/app/[locale]/tools/<id>/` and add it to `src/modules/tools/own-route.ts` (see the four utilities).
- **An EVM chain:** add it to `src/config/chains.ts` (and its RPC hosts to the CSP in `next.config.ts`); keep it out of `live` until verified.
- **A language:** add it to `src/i18n/locales.ts` and create `messages/<code>.json`. Set `status` to `complete` only after a professional review.

## Security

- Never put secrets in variables starting with `NEXT_PUBLIC_` — those are visible in the browser.
- Keep real keys only in `.env.local` (ignored by Git) and in the hosting provider's settings.
- pnpm refuses packages published in the last day and blocks install scripts unless listed in `pnpm-workspace.yaml`. Keep these protections on.
