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
   `bash /opt/crypy/app/scripts/server/update.sh`.

Useful on the server: `systemctl status crypy`, `journalctl -u crypy -n 100 --no-pager` (the app's log), backups in
`/var/backups/crypy` (daily, 14 days). `CRYPY_PREVIEW=1` (set by `setup.sh`) keeps search engines out until the
official launch; remove it from the server's `.env.local` and run `update.sh` to launch.

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
