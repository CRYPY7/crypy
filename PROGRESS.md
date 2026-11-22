# CRYPY — Progress

Last updated: 2026-11-22

## Milestones

| Milestone                                              | Status                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| M0 Setup and design approval                           | ✅ Done                                                                                       |
| M1 Foundation                                          | ✅ Done (2026-11-19)                                                                          |
| M2 Multi-chain core, search routing, wallet connection | ✅ Done (2026-11-20)                                                                          |
| M2.5 Free utilities                                    | ✅ Done (2026-11-20)                                                                          |
| M3 Address overview (Balance Scanner)                  | ✅ Built (2026-11-20); owner check with Alchemy pending                                       |
| Desktop sidebar layout, chain icons, recently viewed   | ✅ Done (2026-11-20, design approved)                                                         |
| M4 Transaction page                                    | ✅ Done (2026-11-20)                                                                          |
| M4.1 Transaction Intelligence                          | ✅ Done (2026-11-20, design approved)                                                         |
| M4.2 Transaction Intelligence V2, Part 1               | ✅ Built (2026-11-20, design approved with owner's conditions)                                |
| M4.5 Batch Balance Scanner                             | ✅ Built (2026-11-20, design approved)                                                        |
| M5 Token Security                                      | 🟡 Built, not complete: parts deferred (see roadmap "Deferred parts")                         |
| M5.2 Token Security: finishing parts                   | 🟡 Built 2026-11-20; explorer source check needs owner decision; 3 lockers pending addresses  |
| M5.1 Liquidity holders ("Who holds the liquidity")     | 🟡 Built 2026-11-20 (design approved, boards 21–23); parts deferred (see roadmap)             |
| M5.5 Token Market & Charts (own on-chain data)         | Planned (approved 2026-11-20)                                                                 |
| M6 Approvals and safe revoke                           | 🟡 Built 2026-11-21 (design approved, boards 24–27); parts deferred (see roadmap)             |
| M7 Activity tab (Address Analyzer)                     | 🟡 Built 2026-11-21 (design approved, boards 28–30); Alchemy path needs the owner's live test |
| M7 Gas Tracker, Timestamp & Block Converter            | ✅ Built 2026-11-21 (designs approved, boards 31–33); owner live checks passed                |
| M7 Chain picker (address tools)                        | ✅ Built 2026-11-21 (design approved, boards 34–35)                                           |
| M7 Base, Arbitrum, Polygon                             | 🟡 Built 2026-11-21: every tool incl. Token Security; some lockers and pool designs deferred  |
| M8 Part 1 Portfolio (Tool 7)                           | 🟡 Built 2026-11-21 (design approved, boards 36–38); sync and alerts added in Parts 2–3       |
| Alchemy per-second pacing                              | ✅ Built 2026-11-22; owner PC check pending                                                   |
| M8 Part 2 Wallet sign-in, database, Watchlist (Tool 8) | 🟡 Built 2026-11-22 (boards 39–41)                                                            |
| M8 Part 3 Alerts and Telegram                          | 🟡 Built 2026-11-22; owner's real Telegram test passed; parts deferred (see roadmap)          |
| M9 Part 1 Security review                              | ✅ Done 2026-11-22: 6 findings fixed, launch requirements written (ARCHITECTURE.md §10d)      |
| M9 Part 2 Accessibility and speed                      | 🟡 Built 2026-11-22: 0 axe violations, CLS 0; data pages below 90 in simulation (see roadmap) |
| M9 Part 3 Online (friends preview)                     | 🟡 Server scripts built 2026-11-22; owner's first setup on DigitalOcean pending               |
| M3–M9                                                  | Planned (see DEVELOPMENT_ROADMAP.md)                                                          |

## M8 Part 3 — Alerts: background checker, Telegram, quiet hours, history, Portfolio sync (boards 36, 39–41)

The Watchlist is live (no longer Beta).

- **Background checker** (`server/alerts/checker.ts`), inside the server process, about every minute:
  - Per chain, each round: the new blocks since last time, a few blocks behind the newest (reorganisation margin;
    after a pause at most 15 minutes back).
  - Three event searches cover every watched wallet at once: tokens sent, tokens received, new approvals. Plus one
    coin-balance read for all of them. The cost stays flat as more people watch.
  - Searches go to the free providers that allow wallet-wide searches (dRPC ≤ 100 blocks, Infura, Ankr, Chainstack,
    NodeReal, Arbitrum's own node), never Alchemy (10 blocks on its free plan). The step adapts (25–100 blocks).
  - A chain no provider can search is named on the page ("Not being checked right now") and in the server log, with
    what to add.
  - Coin transfers: a balance change is explained with the transaction from Alchemy when available, otherwise
    reported as a balance change. Without Alchemy, a drop together with a token send is treated as the fee.
  - Hourly, a few items per round: wallet value (big drop in a day, complete readings only), and token security
    and liquidity compared with last time. The first reading is a baseline, never an alert.
- **Spam and fakes** (anyone can emit events naming any wallet):
  - Received: no zero amounts, NFTs or tokens without a market price.
  - Sent: an unpriced token or an NFT counts only when the wallet sent the transaction itself.
  - Approvals: read back on-chain (allowance / operator / Permit2), for priced tokens only. Permit2 events must
    come from a real Permit2 contract. Collection-wide NFT approvals must be sent by the wallet.
- **Telegram bot** (@crypyalertsbot; `server/telegram/`):
  - Long polling (works without a public web address). `/start CODE` links the chat (code 10 minutes, single use,
    only its hash stored), `/stop` disconnects, anything else gets help.
  - "Mute this wallet / token" buttons. A blocked bot disconnects the account automatically.
  - Messages escape all labels (no HTML injection), link only to CRYPY pages, and never ask to connect a wallet or
    sign anything. On a local server the link goes in the text (Telegram only allows public links in buttons).
- **Delivery** (`server/alerts/deliver.ts`): every 10 s.
  - Each event is stored once (dedupe key). Quiet hours (default 23:00–07:00 in the person's time zone) hold
    alerts; more than 5 waiting go out as one summary.
  - About 1 message per second per chat. A failing send is retried for up to a day, then marked failed.
  - History is kept 90 days.
- **Page** (boards 39–40):
  - "Where alerts go": connect with QR code, "Open Telegram" or `/start CODE`; the page updates by itself. Then
    connected as @name, Send test, quiet hours (Change), Disconnect Telegram, "Email alerts later".
  - Recent alerts with All / Load older, and the status of each (waiting, not sent, muted).
  - "Checked about every minute". Mute / unmute per item.
- **Portfolio** (board 36, deferred from Part 1):
  - "Saved on this device only (no account). Sign in with your wallet to keep it on all your devices — optional",
    then a switch to keep the list on the account (merged across devices, checked like the browser copy).
  - "Watch for changes" → "Set up alerts" opens the Watchlist, which offers (on a click) to watch the Portfolio's
    wallets.
- **Your data:** the download now includes Telegram, quiet hours, alert history and the synced portfolio; deleting
  the account removes all of it.
- `pnpm env:check` now tests the Telegram token and says when Telegram can't be reached from the computer (for
  example where Telegram is blocked: turn on a VPN for the whole computer while testing).

Deferred (in the roadmap table): email alerts; alerts in other languages (with M9 translations); ERC-1155 transfers
and single-NFT approvals; coin transfers on chains without Alchemy details (reported as balance changes); running
the checker on several servers at once (needs a shared lock).

### M8 Part 3 checks (2026-11-22, in the cloud workspace)

- Typecheck, ESLint, Prettier, i18n check: passed. Build passed.
- Unit: 306 passed, 72 skipped (live tests), 0 failed. New: event decoding, alert rules (spam, thresholds, swaps,
  approvals, value drop, security and liquidity changes), quiet hours, message escaping and buttons, digest, Telegram
  linking and bot commands, mute, delivery (quiet hours, summary, blocked bot), portfolio merge.
- Live (`LIVE=1`): the checker read 30 real Ethereum blocks for Uniswap's router: 20 transfers → 9 priced alerts
  linking their transactions, in 0.6 s. Found while testing: the public PublicNode and BNB Chain nodes refuse
  wallet-wide searches, so a chain without a suitable provider is now named instead of failing silently.
- Browser (with a stand-in Telegram server), final build: 141 passed, 7 skipped, 2 failed (the FLOKI liquidity card
  under full load, the known free GoPlus limit; 8 of 8 when the Token Security file ran alone). An earlier run had
  the batch scanner fail once (4 of 4 alone); a free BNB Chain endpoint added in this round that answers "rate
  limit" as a normal reply was removed as a precaution. New: connect Telegram with the code (page updates by itself), Send test, quiet hours, Mute from a
  Telegram button and unmute on the page, disconnect; Portfolio "Set up alerts" offer; account sync restoring the
  list in an empty browser.
- On the owner's PC the full check first crashed the server; found and fixed (HTTP/2 in Node 26, not the alerts) —
  see "Server crash on the owner's PC" below. 2 of 2 runs since then kept the server up.
- **Owner check passed (2026-11-22):** with a VPN on (Telegram is blocked where the owner is), the owner connected the
  real bot (@crypyalertsbot), watched wallets and received the alerts in Telegram; everything worked. Still to repeat
  on staging and production at launch (the roadmap's "Done when").

## Alchemy per-second pacing (owner decision 2026-11-22)

Alchemy emailed that the account "hit its first rate limit". Its dashboard: 676.5K of 30M monthly CU used (2%), peak
275.7 of 300 CU per second, in short bursts during test runs. The monthly allowance was never at risk; the per-second
limit was. Owner decision: stay on the free plan (zero-API-cost rule) and pace requests instead of upgrading.

- **Pacer** (`server/chains/evm/alchemy-pace.ts`): one budget of 250 CU per second for all chains together (Alchemy's
  limit is per account), each request in a batch counted on its own.
  - Ordinary reads go to Alchemy only when its budget has room; otherwise straight to the next provider (other free
    providers, then public nodes), with no waiting and no penalty for Alchemy.
  - Alchemy-only calls (token list, transfer history, old-block reads) wait their turn (token list up to 2 s per page,
    history 4 s, old blocks 3 s) and go before ordinary reads. If the wait would be longer, the page says that part
    isn't available, as before.
  - If Alchemy still answers "too many requests", it is paused for 2 s (was: skipped for a whole minute, which
    turned big-wallet token lists into "well-known tokens only" for that minute).
  - One server log line per minute when pacing did anything: CU used, reads sent elsewhere, waits, refusals.
- **Tests:** 8 new (budget maths, priority of Alchemy-only calls, pause after 429, and fake-node tests showing a busy
  Alchemy hands reads to the next provider without being benched). This workspace has no Alchemy key, so the real
  Alchemy path is checked on the owner's PC (the per-minute log line).
- Checks here: typecheck, lint, Prettier, unit 282 passed, build passed, browser 139 passed, 7 skipped, 0 failed.
- **Owner's PC (full check with the real Alchemy key): 139 passed, 7 skipped, 0 failed, no crash. Alchemy answered
  "too many requests" 0 times** (log: 8,188 and 12,084 CU in the two busiest minutes; 272 and 341 reads sent to other
  providers; 11 and 14 Alchemy-only calls not sent because the wait would pass their limit). In that run 4 of 62
  token lists fell back to well-known tokens only (one wallet on 4 chains at the same moment), labelled on the page.
  More free providers reduce this further. A "socket idle timeout" network error (known since M7, server kept
  running) appeared again.
- **Free providers added by the owner (2026-11-22):** 5 extra on Ethereum and BNB Chain (dRPC, Ankr, Chainstack,
  NodeReal, Infura), 3 on Base, Arbitrum and Polygon (dRPC, Ankr, Infura); 24 of 25 answered in `pnpm env:check`.
  dRPC on BNB Chain answered "too many requests" in 2 of 3 checks (free-plan limit, not a URL problem). The check now
  asks once more after 3 s and reports a still-busy provider as BUSY instead of something to fix.
- **Owner actions:** add free providers (dRPC, Ankr, Chainstack, NodeReal, Infura) to `.env.local` to add capacity
  for free. (Usage alerts are a paid Alchemy feature, so instead: check the dashboard's usage now and then; the
  server's per-minute pacing line shows CU used.) Later steps already planned: Redis cache on the launch VPS, own nodes.

## M8 Part 2 — Wallet sign-in, database and Watchlist (design approved 2026-11-21, boards 39–41)

The Watchlist page works and is marked **Beta**: alerts are **not sent yet**. The page says so in a notice, in the
tool description and in the FAQ. Part 3 adds the background checker and Telegram delivery.

Built:

- **Database:** Drizzle ORM. PGlite (PostgreSQL inside Node, files in `.data/pglite`) when `DATABASE_URL` is not
  set; real PostgreSQL through `pg` when it is. The migration in `drizzle/` runs on first use. Tables: users,
  accounts (CAIP-10 wallet ids), sessions, sign-in codes, watch items.
- **Sign in with your wallet (SIWE, EIP-4361):** one-time code from the server; the message names this site, says
  it is a message and not a transaction, and expires in 10 minutes. The browser and the server check the same
  rules. Signatures are checked locally, and through the chain for smart-contract wallets (ERC-1271/6492). Session:
  a random code in an httpOnly cookie for 30 days; only its SHA-256 is stored.
- **Reviewed module:** `src/wallets/evm/sign-in-runner.ts` is the second module allowed to ask the wallet for
  anything, and only for `signMessage`. ESLint and a unit test enforce this.
- **Watchlist:** up to 10 items per account (addresses on every chain, or a token on a chain with Token Security).
  Each item has its own alert choices: sent / received above an amount, new approvals, big drop in value, token
  security changes, liquidity changes. Rename and remove; changes save immediately and roll back if saving fails.
- **Your data:** download everything as JSON, sign out, or delete the account and everything with it.
- **Protection:** same-site check on every change, rate limits (sign-in 20/min, account 60/min), zod validation,
  10-item limit enforced inside a database transaction, seed phrases refused in the add form.
- The wallet window closes by itself when sign-in continues after connecting, so the page stays visible while the
  wallet asks.

Not done yet (Part 3): background checker, Telegram bot and linking, quiet hours, alert history, optional Portfolio
sync to the account.

### M8 Part 2 checks (2026-11-22, in the cloud workspace)

- Typecheck ✅, ESLint ✅, Prettier ✅.
- Unit tests: 273 passed, 71 skipped (live-network tests), 0 failed. New: database, sign-in message rules, sessions
  (real signatures from a throwaway key), watchlist rules and limits.
- Build ✅.
- Browser tests: 137 passed, 7 skipped, 2 failed in the full run. The 2 failures were the FLOKI liquidity card while
  the free GoPlus limit was reached (the log shows calls held back); the Token Security file passed 8 of 8 when run
  again alone. New Watchlist tests (8 of 8, desktop and mobile): nothing signed before the click; the signed text
  names the site and says it is not a transaction; declining signs nothing; add, alert choices, rename, remove;
  seed phrase refused; download; delete account; 401 without a session; 403 from another site. The wallet test
  (no signing on connect) still passes.
- Owner's PC run (2026-11-22): 131 passed, 8 failed (all 8 Watchlist tests); sign-in failed in the owner's browser
  ("Sign-in didn't work"). See the follow-up below.

### M8 Part 2 follow-up (2026-11-22): sign-in failed on the owner's PC

- **Cause:** PGlite creates only the last folder of its path. The database folder is `.data/pglite` and `.data` didn't
  exist, so opening the database failed and every sign-in request answered 503. The cloud tests missed it because
  they ran the database in memory. Reproduced here in folder mode.
- **Fix:** the folder is created (with its parents) before PGlite opens it. A failed open is now logged in one line
  (`[crypy] database didn't open …`, connection strings removed) instead of only answering 503.
- **Tests:** new `tests/unit/db-disk.test.ts` opens the database in a folder whose parent doesn't exist; it fails
  without the fix and passes with it. Watchlist and wallet browser tests: 12 of 12 against a server using a real folder.
- `scripts/full-check.ps1` now gives its server an in-memory database, so test accounts never go into the owner's own
  `.data/pglite`. `node scripts/db-check.mjs disk` opens the database outside Next.js for diagnosis.
- The build warning about tracing the whole project (from `process.cwd()` in the database client) is gone.
- Checks here: typecheck, lint, Prettier, unit 274 passed, build passed.
- **Owner's PC after the fix (2026-11-22, `full-check.cmd`): 139 passed, 7 skipped, 0 failed; no crash; no database
  errors in the server log.** The check now also stops a CRYPY server left running on port 3000 or 3200 before it
  builds.

## M1 — what was built

- Next.js 16 + React 19 + TypeScript (strict), Tailwind CSS v4, shadcn/ui (Base UI), pnpm 12.
- Design system from the approved mockup: dark (default) and light themes, severity colours, touch-friendly sizes.
- App shell: header (logo, All tools, Portfolio/Watchlist/Gas links, compact search, language menu, theme toggle), footer with legal links and languages, skip link, mobile bottom tab bar.
- All tools dialog: searchable, grouped, opened by the header button, the mobile Tools tab or Ctrl/Cmd + K. Loaded only on first open.
- Tool registry with 13 tools (8 core + 5 utilities), all marked "Coming soon" with their milestone.
- Pages: home (hero search, trust points, 4 question tiles, all tools with category filters), all tools, 13 tool landing pages, settings (language, theme), privacy/terms/risk (marked as drafts), not found.
- Universal search: recognises EVM addresses and transaction hashes locally; nothing is sent to any server.
- Internationalisation: 10 languages registered, English complete, English fallback, right-to-left layout for Urdu and Arabic, language detection with saved choice, language-prefixed URLs, hreflang and sitemap for reviewed languages only.
- Security: Content Security Policy and security headers, no `X-Powered-By`, lint rule blocking secret environment variables in components.
- SEO: per-page titles and descriptions, canonical URLs, sitemap.xml, robots.txt.
- Performance: all pages pre-rendered as static HTML; automated budget tests. (The "≈ 120 KB gzipped" figure reported at the end of M1 was a measuring mistake: a stale server was missing some files. The correct M1 figure was ≈ 180 KB gzipped. See the M2 section for current numbers.)

## M9 Part 3 — Going online: friends preview (owner request 2026-11-22)

Owner decisions: DigitalOcean (account created), domain crypy.org (owned), public GitHub repository, **friends
preview** first (live and fully working, hidden from search engines until the official launch).

- **Server scripts** (`scripts/server/`, for Ubuntu 24.04):
  - `setup.sh` (run once as root): system updates and automatic security updates; firewall (SSH, HTTP, HTTPS only);
    fail2ban; 2 GB swap; Node.js 26 and pnpm 12.22.0; PostgreSQL on this server only with a random password;
    a `crypy` system user; the code in `/opt/crypy/app`; the keys pasted into the server's `.env.local` (mode 600;
    the server's own lines for site address, database and preview always win); build; a systemd service on
    127.0.0.1:3000 (restarts by itself; can write only to its own folder); nginx with the headers from §10d and a
    64 KB body limit; daily database backups kept 14 days.
  - `enable-https.sh`: checks that both names point to the server, then a free Let's Encrypt certificate with
    automatic renewal and http → https.
  - `update.sh`: pulls the latest code, installs, builds, restarts and checks that the site answers.
- **Preview mode** (`CRYPY_PREVIEW=1`, set by `setup.sh`): robots.txt disallows everything and every response
  carries `X-Robots-Tag: noindex, nofollow`. Removing it and running `update.sh` is the official launch switch.
  Unit test added; checked on a production build.
- README: "Putting it online" with the steps.
- Not tested here: the scripts on a real server (this workspace can't create one); `bash -n` and ShellCheck pass.
  The owner's first run is the test; any problem will be fixed in the scripts.

### Live server speed (owner report 2026-11-22: "pages take time to load on the live server")

The friends preview went live on crypy.org (DigitalOcean, San Francisco, 2 GB). Measured on the live site:

- Static pages answer in about 0.3–0.7 s and are compressed (home 22 KB). But nginx spoke only **HTTP/1.1**, so a
  page's ~15 script and style files queued over a few connections: slow from far away.
- **vitalik.eth's address page was 4.1 MB (560 KB compressed)**: with the Alchemy key, big wallets list thousands of
  airdropped tokens, and every one was in the page twice (as HTML and as page data) inside the collapsed "no reliable
  price" and "likely spam" groups.
- First visits to data pages take 5–11 s on the server (approvals and token security for big wallets: GoPlus and
  on-chain checks); the page shows its frame at once and fills in as data arrives. Repeat visits come from the
  cache.

Changes:

- **nginx** (`scripts/server/nginx-site.sh`, now used by setup, HTTPS and update): HTTP/2; the site's static files
  (`/_next/static`) sent by nginx straight from disk, compressed and cached for a year; kept-alive connections to the
  app; http and www redirected to https://crypy.org. A new file is swapped in only if `nginx -t` accepts it,
  otherwise the previous one stays. HTTPS now uses `certbot certonly` with a reload hook on renewal.
- **Collapsed token lists** show at most 50 rows per chain, with "N more aren't listed here, to keep the page fast";
  the counts in the headings stay complete. For vitalik.eth that is at most 500 rows instead of about 3,200 (to be measured on the live site after the update).
- **Background refresh:** balances, activity, chain checks and search keep serving the last result for up to
  30 minutes while refreshing in the background (was 5), so a repeat visit opens at once. Approvals and token
  security keep their short windows (safety data).
- Checks here: typecheck, lint, Prettier; unit 326 passed; build; browser 177 passed, 0 failed. nginx file rendered
  and reviewed here (nginx itself can't run in this workspace); the server tests it before using it.

### Fast everywhere: Cloudflare in front (owner request 2026-11-22: "fast for everyone, USA or Asia")

Plan (zero cost: Cloudflare's free plan): visitors connect to Cloudflare's nearest location (300+ cities); the site's
scripts, styles, fonts and images are cached there; pages travel to the San Francisco server over Cloudflare's
network. The owner moves crypy.org's nameservers from Namecheap to Cloudflare and keeps the server.

Server changes, so this works safely:

- **Visitor addresses:** behind Cloudflare every request comes from Cloudflare's servers, which would have put all
  visitors into one rate-limit bucket. `nginx-site.sh` now writes `/etc/nginx/conf.d/cloudflare-realip.conf`:
  the visitor's address is taken from `CF-Connecting-IP`, **only** for requests from Cloudflare's published ranges
  (downloaded each time, with a built-in fallback list), so nobody can fake it. Harmless without Cloudflare.
- **Certificates** are now obtained and renewed through files (`certbot --webroot`), served by every site block,
  so renewal also works through Cloudflare's https redirect. `enable-https.sh` checks that both names reach the
  server by reading back a test file (works with and without Cloudflare); `--renew` gets a fresh certificate once
  to switch an existing one to this method.
- Cloudflare settings for the owner: SSL "Full (strict)", Always Use HTTPS, Email Address Obfuscation off and
  Rocket Loader off (both inject scripts that the Content Security Policy blocks).
- **Abuse protection (owner question 2026-11-22):** `cloudflare-only.sh on` limits the web ports (80/443) to
  Cloudflare's published ranges, so bots can't skip Cloudflare by calling the server's address directly (it was
  public in DNS before Cloudflare); SSH unchanged; `off` reopens them. Owner's Cloudflare settings: Bot Fight Mode on,
  one free rate-limiting rule for `/api/` (per visitor, 10-second window). Free provider plans can't bill, so abuse
  can slow the site or use up a day's free quota (the site then falls back to public nodes) but can't cost money.
- **Live (2026-11-22, checked from outside):** crypy.org answers through Cloudflare over HTTP/2 with HTTP/3
  offered; static files are served from Cloudflare's cache (`cf-cache-status: HIT`, cached for a year); pages and
  the API pass through uncached (`DYNAMIC`, `no-store`); http and www redirect to https://crypy.org; the preview's
  `noindex` and disallow-all robots.txt are in place; the owner switched certificate renewal with `--renew`.

## M9 Part 2 — Accessibility and speed (2026-11-22)

**Accessibility.** axe (WCAG 2.2 AA + best practices) on 23 page/state combinations × phone and desktop, dark and
light: 4 kinds of problems found, all fixed; now 0.

- Language button: its accessible name didn't contain the visible text ("EN" / "English") → name is now
  "Language: English" with the visible text inside it.
- Light theme contrast: small severity chips (New, high, check…) were 3.5–4.2:1 → severity colours darkened
  (critical #b71f1f, high #9a4507, medium #7a5e00, low #126040) and secondary text #4e5768; all ≥ 4.5:1. Dark theme
  unchanged.
- Sideways-scrolling tables (gas costs, transaction transfers, support table) couldn't be reached by keyboard → they
  take focus now.
- The "translation not reviewed" notice sat outside any landmark → it is an `aside`.
- Keyboard walk: every stop has a visible focus indicator except bare text boxes (search, tools dialog, activity
  search, batch token box) → focus rings added. Tools dialog: focus moves in, stays in, Escape closes.
- New `tests/e2e/a11y.spec.ts` (32 tests): axe on home, all tools, a tool page, the Gas Tracker, settings, Urdu and
  the tools dialog in both themes, plus a live transaction and approvals page; and the search box's focus ring.
  New dev-only dependency `@axe-core/playwright` 4.14.0 (pinned; used only by tests).

**Speed (Lighthouse, mobile, simulated slow 4G and 4× slower CPU, median of 3 runs in the cloud workspace):**

| Page                       | Before | After | Notes                                              |
| -------------------------- | ------ | ----- | -------------------------------------------------- |
| Home                       | 85–95  | 92    | layout shift from the gas line removed             |
| All tools                  | 86     | 91    |                                                    |
| Unit Converter             | 88–93  | 90    |                                                    |
| Gas Tracker                | 68     | 90    | shift 0.21 → 0; less work per number               |
| Token Security (tool page) | 87     | 87    | measured LCP in a real browser 0.35 s              |
| Address (vitalik.eth)      | 86     | 81    | simulated; measured LCP 1.5 s with a 4× slower CPU |
| Transaction                | 56–66  | 76    | shift 0.22–0.31 → 0                                |

Accessibility, Best practices: 100 on every page measured; SEO 100 on indexable pages (result pages and preview
languages are `noindex` on purpose).

- **Layout shifts (CLS) now 0 on every page measured.** Causes fixed: the home gas line and the Gas Tracker's live
  fees arrived after the page and pushed text down (space is now kept); entity pages' loading placeholders were
  shorter than one screen, so the footer jumped (placeholders are now at least one screen tall); the transaction
  page's "your time" re-wrapped its line when it appeared (an invisible placeholder of the same length holds it).
- **Less main-thread work:** number formatters are created once and reused (`lib/format/intl.ts`); pages with
  hundreds of amounts created two per amount.
- What's left is mostly React and Next.js themselves (about 390 KB of framework JavaScript, ~120 KB compressed) and,
  on data pages, the simulated time to stream the live content. Real-world numbers come from PageSpeed Insights on
  the production server (roadmap).

Checks here: typecheck, lint, Prettier; unit 324 passed, 72 skipped; build passed; browser 175 passed, 7 skipped,
0 failed (including the 32 new accessibility tests).

Owner's PC full check (2026-11-22): 171 passed, 4 failed, server up, no crash. All 4 were page loads timing out
under the full suite on the 8 GB PC. Follow-up:

- The address and breadcrumb tests waited for the whole live stream to finish loading; they now wait for the content
  they check (same time limits).
- The tools-dialog accessibility test pressed Ctrl+K before the page's code had loaded; it now repeats the shortcut
  until the dialog opens.
- Found with it, a real bug: in the Batch Balance Scanner, a list typed or pasted before the page's code had loaded
  was in the box but not checked or scanned. The editor now takes it over when the page finishes loading (as the
  other tools' address boxes already did). New regression test with slowed page code.
- Here: browser 177 passed, 7 skipped, 0 failed.

## M9 Part 1 — Security review (2026-11-22)

Owner decisions (2026-11-22): M9 starts with the security review; hosting on **one VPS** (site, PostgreSQL, alerts
worker; about $6–12 a month); the owner reviews the **Urdu** text; Arabic stays marked as preview until a native
speaker reviews it.

Reviewed every API route, sign-in and sessions, revoke, alerts and the Telegram bot, outbound requests, logs, headers,
raw HTML, SQL, redirects and dependencies. Six findings, all fixed (details in ARCHITECTURE.md §10d):

- Rate limits could be dodged by sending a made-up `X-Forwarded-For` → the key now comes from the address our own
  proxy sets; IPv6 counted per /64.
- Request bodies had no size cap before reading → every API with a body now stops reading at 2–48 KB.
- The session cookie would have lost `Secure` behind nginx → https is detected from the proxy and the site address.
- Three account routes had no rate limit → added.
- Logged errors could contain provider URLs with keys → every logged URL keeps only its host; Telegram tokens removed.
- Unlimited link-code tries per Telegram chat → 10 per 10 minutes.

Accepted and documented: inline scripts in the CSP (static pages), two audit warnings in build-time and browser
wallet libraries, in-memory limits (one server). Launch requirements for nginx are listed in §10d.

Checks here: typecheck, lint, Prettier (generated `drizzle/meta` now ignored); unit 324 passed, 72 skipped (13 new:
client key and IPv6, body caps, Secure cookie behind a proxy, log redaction, code-try limit); build passed; browser
142 passed, 7 skipped, 1 failed (the batch scanner's first test under the full run, the known cold-start flake;
8 of 8 when that file ran alone).

## Server crash on the owner's PC: HTTP/2 in Node 26 (2026-11-22)

- **Symptom:** with M8 Part 3 on the owner's PC (Windows 11, 8 GB RAM, Node v26.13.1), the full check usually ended
  with the server aborting (0xC0000409) 1–3 minutes in. 6 of 8 runs crashed — **with and without the alerts worker**,
  so the worker was not the cause (an earlier clean run without it was luck).
- **What the new diagnostics showed:** the server's committed memory jumped from ~1 GB to ~12 GB in about 30 s (outside
  the JavaScript heap, so Node's own memory log never saw it), the main thread stopped answering for up to a minute
  (the watchdog could not pause it, so it was stuck outside JavaScript), during the heaviest address pages (a whale
  wallet, vitalik.eth overview and approvals). A V8 sample log showed HTTP/2 sessions in use for outbound requests.
- **Cause:** Node 26's built-in fetch (undici 8) switched to HTTP/2 by default for servers that offer it (Alchemy,
  dRPC, Ankr, …). Ruled out by test runs: WebAssembly trap handlers, WebAssembly memory/code limits, opening the
  database during load, the Telegram bot, the alerts delivery, oversized provider answers.
- **Fix:** outbound requests use HTTP/1.1 again (`src/server/http/agent.ts`, applied at server start; the server log
  says `outbound HTTP version: http/1.1 (…)` when the memory log is on, and always prints a line if it can't apply it).
  `CRYPY_HTTP2=on` keeps Node's default (diagnosis only). Unit-tested, including undici 8's two dispatcher slots.
- **Result on the owner's PC:** 2 of 2 full runs with the server up to the end, its memory at most ~1.1 GB:
  140 passed / 3 failed and 137 passed / 6 failed (timeouts of the heaviest live pages under the full suite on an
  8 GB PC, and the FLOKI trade test — the known live-data flakes; they pass alone).
- **Also added (kept):** provider answers over 32 MB are refused as a failed request and logged with host and method
  (third-party data is untrusted; none was seen); the built-in database opens before the first request when the
  alerts worker is on; opt-in diagnostics (`CRYPY_DEBUG_MEMORY=1`): sudden-growth lines, a main-thread watchdog that
  writes `.crash-reports/blocked-main-thread.txt` with the requests in progress, Node fatal-error reports, and the
  full check's per-process memory table (`memory-log.txt`).
- **Known, harmless:** an "unhandledRejection … getEthBalance … zero data" line can appear when a free node answers
  an empty result; the request is already handled as failed. To be traced later.
- Diagnosis launchers in `scripts/` (`full-check-no-bot`, `-delivery-only`, `-checker-only`, `-no-trap`,
  `-wasm-cap`, `-prof`) were only for this hunt and can be deleted.
- Here: typecheck, lint passed; unit 313 passed, 72 skipped; browser 143 passed, 7 skipped, 0 failed.

## Server stability under load (2026-11-21)

- **Shared request cap:** at most 32 outbound requests in flight per server; extra ones wait their turn (released as
  soon as the answer's headers arrive, so a slot can't leak). Unit-tested (never above the cap, every request
  completes, failures free their slot). The opt-in memory log now also prints requests in flight, the most at once
  and how many waited.
- Evidence on the owner's PC (Node v26.13.1, Alchemy key): before, 3 of 5 full runs ended with the server aborting
  (0xC0000409); isolation runs showed it needed the Portfolio test and the rest of the suite together. After: 2 of 2
  full runs 129 passed, 7 skipped, 0 failed, no crash; demand reached the cap and up to 263 requests waited per 30 s.
- Here: unit 258 passed; full browser run 129 passed.
- `scripts/full-check-no-portfolio.cmd` and `scripts/full-check-portfolio-only.cmd` added for isolation runs.

## Big-wallet speed (2026-11-21, measured on the owner's PC with Alchemy)

- Measured with an opt-in timing log (`CRYPY_DEBUG_TIMING=1`): for big wallets Alchemy's token list (10 pages read one
  after another) took 6–15 s per chain and prices 2–10 s, so Vitalik's address page took about 19 s with nothing else
  running and over 30 s under the test load. Normal wallets: 1 page, 1–3 s.
- **Token list time limit:** no further page is requested after 5 s (`TOKEN_LIST_BUDGET_MS`); the page then says how
  many entries were checked and that some tokens may be missing.
- **Well-known tokens are never missed:** when the list is cut off, each chain's well-known tokens (USDT, USDC, WETH…)
  are read directly from the chain (one multicall) and added; they are also priced first. Live test
  `tests/unit/balances-truncated-live.test.ts` (Vitalik's USDT found with a faked cut-off list); unit test for the time
  limit.
- Each chain is priced as soon as its own balances arrive (a slow chain no longer delays the others).
- Result on the owner's PC: full suite 3.3–3.6 min instead of 4.4; Vitalik's page 22 s under test load.
- Check scripts: `scripts/crash-check.cmd` (one big wallet three ways) and `scripts/full-check.cmd` (build, server
  with memory and timing logs, full browser suite, Windows crash records), each writing a text report.

## M8 Part 1 follow-up (2026-11-21): GoPlus shared between pages and the Portfolio

Owner's run: 126 passed, 3 failed. Causes:

- **FLOKI liquidity card (2 tests):** GoPlus didn't answer during the run (the page's Holders and Second opinion cards
  said so). FLOKI's Safe and OnlyMoons vault are found through GoPlus's LP-holder list, so that share correctly showed
  as "Holders not found" and was never counted as safe. A likely cause was found: the Portfolio's badges could send
  up to about 8 GoPlus token checks per wallet plus GoPlus approval lists for every chain, enough to use up GoPlus's
  free pace (150 compute units a minute) that the token and approval pages need.
- **Fix: one shared GoPlus pace** (`server/security/goplus-budget.ts`): at most 30 real GoPlus calls a minute per
  server (cached answers are free); token and approval pages go first; the Portfolio's checks run at "background"
  priority and may use only the first 8 slots of a minute; when GoPlus answers "too many requests", all calls pause
  for 60 s. Refused calls show as "not checked", as before. The server logs one line per minute with counts when
  anything was held back or failed (no addresses).
- **Portfolio honesty:** "Nothing flagged" now appears only for a wallet whose checks all ran; otherwise the Safety
  section says some checks didn't run and why.
- **Recently viewed (1 test, phone):** the test left the address page before the page's browser code had saved the
  visit; it now waits for the save. Not a site bug: the visit is saved as soon as the page has loaded.
- The FLOKI test now accepts any honest mix when GoPlus is down (Safe found from recent LP transfers, or "Holders not
  found"), and still requires the full holder list when GoPlus answers.

Checks: typecheck and lint clean; unit 255 passed (5 new for the pace); build passed; full browser run 129 passed,
7 skipped, 0 failed. Server log in that run: "GoPlus last minute: 30 sent, 4 failed, 4 page and 38 background calls
held back", so the free plan's limit is close to 30 calls a minute under the test load.

## M8 Part 1 — Portfolio (design approved 2026-11-21, boards 36–38)

- **Page:** `/tools/portfolio`, now live. No account and no wallet connection needed.
- **Saved only in this browser** (`localStorage`, key `crypy.portfolio`, versioned): up to 20 public addresses with
  the visitor's own labels and the last total seen. Read defensively (malformed, duplicate or extra entries dropped).
  Kept in step across open tabs; works for the visit when storage is blocked. The list is never sent as a list or
  stored on the server: each wallet is read on its own.
- **Add wallet dialog:** refuses a pasted seed phrase or private key (cleared at once, never saved, sent or logged),
  catches wrong EIP-55 checksums, junk and duplicates; labels are trimmed, capped at 40 characters and stripped of
  invisible and direction-changing characters. "Add my connected wallet" when a wallet is connected (no signing).
- **Per wallet** (`GET /api/v1/address/{address}/portfolio`, own rate limit of 60 a minute, read-only, nothing stored):
  balances on the chains the wallet uses; how many approvals need attention (CRYPY's own approval checks, 20 s
  limit); held tokens GoPlus reports as a honeypot or with a sell tax of 30% or more (the wallet's 8 most valuable
  tokens outside CRYPY's checked list; 8 s limit; labelled as GoPlus's finding). A check that doesn't finish says so.
- **Summary:** combined total across wallets and chains; "since you last looked" (kept at least an hour so a refresh
  doesn't reset it; only when every wallet and price loaded; labelled "not profit or loss"; adding a wallet starts a
  fresh comparison); tokens with value / without a price; approvals to check; flagged tokens; by-chain bar.
- **Wallets list:** value, share, chains, badges (approvals to check, flagged tokens, nothing flagged), open, rename,
  remove. **Safety** section with links to the approvals page and the token report. Never a "safe" verdict.
- **Top holdings:** merged across wallets; the same asset on several chains is merged only when CRYPY knows it's the
  same (each chain's coin, or a token on CRYPY's checked list with its address verified per chain). Any other token
  stays one row per chain and contract, so a look-alike is never merged with a real one. Spam stays hidden.
- **CSV export** of the holdings (formula-safe cells). Phone layout: stacked cards, scrollable holdings table.
- **Performance:** the portfolio code loads only when the page opens, not when a link to it is prefetched (the header
  and tab bar link to it from every page), so other pages stay within the JavaScript budget.
- **Deferred to M8 parts 2–3:** syncing the portfolio to an account, the "Watch for changes" box on board 36, and
  history beyond the last total seen.

## M8 Part 1 checks (2026-11-21, in the cloud workspace)

- `tsc --noEmit` and ESLint: clean.
- Unit tests: 250 passed, 70 skipped (live tests need keys/network flags); new `tests/unit/portfolio.test.ts` (10).
- `next build`: passed.
- Browser tests (full suite, 3 workers): 127 passed, 7 skipped, 2 failed on the first run — both were tests that used
  the Portfolio as the example of a "not live yet" tool. They now use the Watchlist; re-run: 40 of 40 passed in
  foundation + layout. New `tests/e2e/portfolio.spec.ts` (empty state, seed-phrase refusal, checksum, duplicate, two
  live wallets with total, holdings, saved snapshot, reload, remove): passed on desktop and mobile.

## M6 — Approval Checker and safe revoke (design approved 2026-11-20, boards 24–27)

- **Approvals tab** on every address (`/address/{address}/approvals`), with Overview | Approvals | Activity (soon) tabs
  on both address pages. Works for any address without connecting a wallet.
- **Finding approvals (free):** GoPlus's approval lists for tokens and NFT collections (leads only, with GoPlus's
  malicious / doubtful / trusted flags kept and labelled); every token the wallet holds × the contracts people
  commonly approve (routers, aggregators, Permit2); apps' allowances inside Permit2 for tokens approved to Permit2;
  recent Approval events of held tokens (free nodes only search events by contract address). Every allowance shown
  is read on-chain at one block; zero ones are dropped.
- **Who the spender is:** wallet, wallet with delegated code (EIP-7702) or contract, read on-chain; names only from
  CRYPY's own list; Sourcify source check for up to 8 unknown contract spenders.
- **Risks:** malicious (GoPlus) → high (a wallet spender) → check (unknown contract, source not published or
  unreadable) → known app / contract with published source. Spam tokens (hidden in balances) never need attention.
  "At risk now" = the smaller of allowance and balance at on-chain prices. Unused (nothing held), unlimited ("also
  covers tokens you receive later") and Permit2 expiry shown. Never a "safe" verdict.
- **Page:** summary with "Revoke the N flagged ones", 4 figures, filters (attention, unlimited, tokens, NFTs, chain),
  groups (needs attention / check these / looks normal / spam tokens), reasons, "How we checked", GoPlus-down and
  chain-down notices, read-only notice for another connected wallet, phone layout.
- **Revoke:** see the security review in ARCHITECTURE.md §10b. Preview shows contract, function, value 0 and the fee;
  the exact transaction is tested with `eth_call` first; account and network checked; the allowance is read again
  after the receipt. "Revoke flagged" runs one at a time (one confirmation each, stoppable). Batch revoke in one
  signature stays a paid tool for later.
- **Approval Checker tool page live** (`/tools/approval-checker`): address box and "Check my connected wallet".
- **API:** `GET /api/v1/address/{address}/approvals` (rate-limited, cached ~20 s, nothing stored).

Real results (2026-11-21): vitalik.eth — 9 approvals (Uniswap V3 Router, Permit2 and others found by CRYPY's own
checks; 3 wallet spenders on BNB Chain found through GoPlus). A BNB Chain wallet with two wallet-spender approvals
(WBNB unused, OINKY). Found while testing: public nodes refuse event searches without a contract address, so recent
events are searched per held token.

Not covered yet (tracked in the roadmap): complete approval history (indexer), contract age for spenders,
single-item NFT approvals, testnet revoke, batch revoke. **Owner checks:** compare your own wallets with Revoke.cash;
revoke one small real approval and confirm the page shows it gone.

## M7 part 4 — Base, Arbitrum and Polygon (2026-11-21)

Live on all address tools, the Gas Tracker, the transaction page, batch balances and search. Each chain was switched
on only after its live checks passed (`tests/unit/chains-live.test.ts`, 19 checks).

- **Config per chain:** CAIP-2 IDs (eip155:8453, 42161, 137), explorers (BaseScan, Arbiscan, PolygonScan), two
  public nodes each, Alchemy networks (`base-mainnet`, `arb-mainnet`, `polygon-mainnet`), 10 common tokens each,
  extra provider lists `BASE_RPC_URLS`, `ARBITRUM_RPC_URLS`, `POLYGON_RPC_URLS`, wallet connection (wagmi) and CSP.
  Chain badges follow the approved design (boards 34–35).
- **Prices:** Uniswap v3/v2 and PancakeSwap v3 (Base), Uniswap v3 and SushiSwap (Arbitrum), Uniswap v3 and QuickSwap
  (Polygon); every factory confirmed on-chain to list the WETH/WPOL–USDC pool. Live: ETH $1,633–1,636 on all three
  ETH chains (same as Ethereum), POL $0.075.
- **Names and approvals:** routers and aggregators per chain, each checked to hold code there. Found while checking:
  the Ethereum addresses of Uniswap's V3 routers hold unrelated code on Base, so they're listed only where they're
  Uniswap's; PancakeSwap's Permit2 isn't on Polygon. GoPlus approval lists answer for all three chains.
- **Activity:** Alchemy history on all three; internal transfers on Ethereum and Polygon only (Alchemy's docs
  disagree about Base, so the page says they may be missing there).
- **Rollup fees:** Base receipts' Ethereum data fee (`l1Fee`) is added to the fee and shown as its own line; on
  Arbitrum it is already part of the gas. Gas Tracker costs on Base and Arbitrum include an estimate of that data fee,
  read from the chain (Base GasPriceOracle, Arbitrum ArbGasInfo), and say so.
- **"Final" from the node:** the transaction page asks the node for its finalized block (on rollups: once the batch is
  final on Ethereum); block counts are only a fallback, and none is used for rollups.
- **Token Security:** not on these chains yet. Token pages there say so plainly; the scanner offers only Ethereum and
  BNB Chain. Tracked in the roadmap.
- Fixes found while testing: the Gas costs table scrolls sideways on phones instead of squeezing five columns; the
  price line names each chain; Arbitrum's own public node goes first (PublicNode refuses event searches over a few
  hours there); the recent-events limit is 4 s.

**Owner action:** in the Alchemy dashboard, enable Base, Arbitrum and Polygon for your app (otherwise those chains use
public nodes and the recent-only activity), then run `pnpm env:check`.

## M7 follow-up (2026-11-21): owner's run after Token Security on the new chains

- Browser suite on the owner's PC: **125 passed, 0 failed.** Live: 38 of 39.
- The one live failure was stale data, not a bug: the CAKE test expected PancakeSwap's fee collector to hold LP in the
  CAKE/BNB pool; it now holds none (checked on-chain: balance 0, fees withdrawn), and CRYPY correctly lists only
  holders with a share. The test now checks the rule (named whenever it holds LP) against the live balance.
- "socket idle timeout" still appeared once, so closing unread responses was not the cause. It doesn't happen here
  (this workspace has no Alchemy key, and it seems tied to that path). Added a monitor that only observes such escaped
  network errors and prints the full stack once, with provider keys removed (unit-tested), so the owner's next log
  shows where it comes from. Next.js keeps the server running when it happens.

## M7 part 5 — Token Security on Base, Arbitrum and Polygon (2026-11-21)

- **Exchanges:** Base: Uniswap v2 (trade-test hop), Uniswap v3, PancakeSwap v3. Arbitrum: SushiSwap (hop), Uniswap v2,
  Uniswap v3, PancakeSwap v3. Polygon: QuickSwap (hop), SushiSwap, Uniswap v2, Uniswap v3. Every router's factory()
  and WETH() and every position manager's factory() checked live. Found: Uniswap's Ethereum position-manager address
  holds unrelated code on Base (Base has its own).
- **Trade test works on all three** (live): DEGEN on Base and ARB on Arbitrum through Uniswap v3 pools called directly,
  QUICK on Polygon through the QuickSwap router, LINK on Polygon through a stablecoin pool after a POL → USD hop.
  Each bought, sent and sold with 0% tax. Test size about $10 (0.005 ETH; 100 POL).
- **Lockers:** UNCX's current Uniswap v2 locker (same code on every chain, addresses from UNCX's own repository) and
  UNCX's v3 locker on all three; the 2024 UNCX v2 lockers were also added on Ethereum and BNB Chain. Each answers its
  read method and is confirmed not upgradeable on-chain. Not listed (deferred): PinkLock (its Ethereum address holds
  different code on these chains or none), Team Finance (its address on Polygon doesn't answer the lock reads), farms.
- **Fixed while testing (all tools):** the address/hash boxes on the Token Security, Approval Checker, Balance Scanner
  and Transaction Checker pages lost text typed before the page had finished loading (seen in a phone test: the
  scanner then said "enter an address" although one was typed). They now keep it and read it when submitted.
- **Socket timeout:** responses CRYPY doesn't read (errors, 404s, too-large answers from GoPlus, Sourcify, Alchemy) are
  now closed at once instead of staying open until the socket's idle timer fired (the "socket idle timeout" uncaught
  errors in the owner's logs). Couldn't be reproduced here, so this is the likely cause, not a confirmed one.

Checks: typecheck and lint clean; unit 239 passed; live 39 passed (23 new-chain checks incl. 4 trade tests, 8 security,
8 liquidity incl. the locker registry on all five chains); build passed; full browser run 124 passed, 7 skipped,
1 failed once ("tool isn't live yet" page; passed 8 of 8 on repeat; its wait raised to 15 s).

## M7 follow-up 3 (2026-11-21): a resting node gets one more try

Owner's third run (6 failures, all on live-data pages) showed the remaining gap in the swap case: PublicNode refused
the old receipt, and the two nodes that have it (Alchemy, BNB Chain's own) were "resting" after slow answers under the
test load, so the request ended with the refusal. Now, when every awake node has failed or refused, the resting node
whose rest ends soonest gets one more try: a rest only ranks providers by speed, it never blocks an answer. Unit test
added. The browser suite now runs 3 browsers at once instead of 6: these tests read live blockchains through free
providers, and six at once made the providers themselves slow down. One test (tool page → token page) got a longer
time limit. Here: unit 239 passed; build passed; full browser run 122 passed, 7 skipped, 1 failed (that time limit,
now raised; the three affected files then passed 36 of 36).

## M7 follow-up 2 (2026-11-21): a node refusing old data stopped the transaction page

Owner's second full run: 4 failures (TATA swap page, FLOKI liquidity card, each on desktop and phone). The server log
showed the cause for the swap: PublicNode's BNB Chain node now answers receipts of older transactions with "Archive
requests require a personal token", sent as an "invalid parameters" error. CRYPY treated that error as a final answer
and never asked the next node (BNB Chain's own node has the receipt; checked). Now a refusal of old data always hands
over to the next node and is remembered for 10 minutes, as other refusals already were. A unit test covers it with a
fake node giving exactly that answer. The FLOKI card reads older lock data through the same path, so it is likely the
same cause; it passed here.

## M7 follow-up (2026-11-21): owner's full test run

5 of 130 browser tests failed on the owner's PC; causes and fixes:

- **"Too many requests" (2 tests, and the converter test):** all API calls from one visitor shared one budget of 30 a
  minute, including the Gas Tracker, which polls every 12 s from one shared cache. Now the Gas API has its own budget
  (120/min, almost free) and the Timestamp & Block Converter its own (30/min). The address APIs check their input
  first, so a bad request always gets "invalid input", never "too many requests".
- **Test setup:** each test worker now counts as its own visitor (as several people would), so the full suite no longer
  runs into the per-visitor limits that protect the site.
- **FLOKI liquidity card (2 tests):** passed here on its own and in the full run; under the owner's parallel run a
  locker read timed out. If it fails again, rerun just that test.
- A tool-page test now waits up to 60 s for the token page instead of 5 s.

Checks: typecheck and lint clean; build passed; full browser run here: 122 passed, 7 skipped, 1 failed (that slow
tool-page wait, now raised).

## M7 — Speed for big addresses (2026-11-21)

Measured in the cloud workspace (no Alchemy key; first visit, nothing cached), Approvals tab:

| Address                          | Before | After |
| -------------------------------- | ------ | ----- |
| Zero address (huge, junk tokens) | 6.9 s  | 3.9 s |
| Test wallet 0x8894…D4E3          | 5.2 s  | 3.8 s |

- **Approvals:** GoPlus (the slowest source, 2–3 s; up to 6 s for very busy wallets) now starts at once instead of
  after the balances; the block header and prices are read alongside other steps.
- **Recent Approval events** now have a 3 s limit: one public BNB Chain node took 5 s+ for the zero address. When the
  limit is hit, the page says "your approvals of the last few hours couldn't be searched" instead of staying silent.
- **Activity:** the Alchemy history no longer waits for the balances (they are only needed for the no-Alchemy fallback).
- **Balances with Alchemy:** each 100-token page's names and decimals are read while the next page is listed, 4
  batches at a time instead of one after another; token details (which never change) are remembered in memory, so
  repeat and popular tokens cost nothing. The Alchemy path itself can't be timed here (no key): **owner check** —
  open the zero address with your key and compare with the ~8.5 s from before.
- The remaining floor is GoPlus's own answer time; repeat visits within ~20 s come from the cache.

Checks: typecheck and lint clean; unit 237 passed (1 new: token details keep their order and are read once);
build passed; browser 33 passed (approvals, activity, chain picker, address).

## M7 part 3 — Chain picker on address tools (owner request; design approved 2026-11-21, boards 34–35)

- Overview, Approvals and Activity now have a **"Chains:" picker**: _chains where it's used_ (default), _all
  chains_, or _pick chains_. The choice goes into the link (`?chains=used|all|bsc,ethereum`) and a first-party cookie
  (`crypy_chains`, a list of chain names only), so it is remembered on this device; the link wins over the cookie.
  Tabs carry the choice. Panel under the button on wider screens, bottom sheet on phones; Escape and outside click
  close it without changes.
- **"Used" check:** the search lookups every page already does (contract code, sent transactions, coin balance) plus
  one multicall per remaining chain for its well-known tokens, so a wallet that only received USDT still counts.
  A chain whose check failed counts as used: a provider outage never narrows a scan.
- One line says what was scanned and what wasn't ("Scanned on … · No activity found on … · Scan these too").
- **Safety rule:** on Approvals, used chains left out of a narrowed scan get a warning with a "Check … too" button,
  so a narrowed scan never looks like a full one.
- Less work per visit: chains with no sign of use are skipped, which also speeds up large addresses on unused chains.
- APIs `/api/v1/address/{a}/approvals` and `/activity` accept optional `?chains=`; without it they scan every chain
  as before. Invalid values return 400.

Checks: typecheck and lint clean; unit 236 passed (9 new: link parsing, order, unknown chains, used/all/pick
scopes); build passed; browser 90 passed, 7 skipped (8 new chain-picker tests on desktop and phone, live data).
CSS 73.4 KB raw: the budget is being raised to 80 KB by the owner (decision 2026-11-21).

## M7 part 2 — Gas Tracker and Timestamp & Block Converter (designs approved 2026-11-21, boards 31–33)

- **Gas Tracker live** (`/tools/gas-tracker`): one `eth_feeHistory` call per chain (1,024 blocks, tips at the 25th,
  50th and 90th percentile) gives low / average / high priority (next base fee + median tip of the last 20 blocks),
  the base fee, and a trend line (base fee on Ethereum; typical tip on BNB Chain, which has no base fee). Cost of
  sending coins and tokens, approving or revoking, swapping and sending an NFT, at typical gas and on-chain prices;
  small fees keep two significant digits ("$0.00055") instead of "$0.00". Refreshes every 12 s while visible; shared
  server cache ~10 s; API `GET /api/v1/gas`. Numbers render per request (never baked in at build time).
- **Home page gas widget** ("Gas now"), loaded after the page.
- **Timestamp & Block Converter live** (`/tools/timestamp-block`): date → first block at or after it on every chain
  (interpolation then bisection over real block headers, ~1–3 s), block → date, Unix ↔ date in the browser; future
  dates give a labelled estimate. API `GET /api/v1/blocks?time=` / `?block=&chain=`.
- "Runs in your browser" note now only on tools that truly never send input (the converter reads the chain).
- Fixed: the dev-mode "params outside Suspense" error on not-yet-live tool pages.

Checks: unit 227 passed (11 new: speeds, no-base-fee chains, trend, costs, fee formatting, fee-history parsing,
date/Unix inputs); live 4 passed (both chains: ordered speeds; the block found for a date is the first at or after
it); build passed; browser 115 passed (new: Gas Tracker, home widget, converter on desktop and phone). CSS 72.3 of
72 KB rounded: kept in budget by merging near-identical classes; the budget is nearly used up.

## M7 part 1 — Activity tab (design approved 2026-11-21, boards 28–30)

- **Activity tab** on every address (`/address/{address}/activity`), third tab next to Overview and Approvals; the
  Address Analyzer tool page is live (`/tools/address-analyzer`) and opens it.
- **Full history (free):** Alchemy's Transfers API (`alchemy_getAssetTransfers`, 120 compute units per call) read
  twice per chain (sent and received), coins, tokens and NFTs, zero-value transfers included (needed for the
  poisoning check). Internal transfers on Ethereum only (Alchemy has none for BNB Chain; the page says so). Block
  times come with the data on Ethereum and are read from the chain on BNB Chain. 50 per stream per page, merged by
  block number so paging never skips or repeats a transfer (`completeAbove`). First activity: two extra calls on the
  first page.
- **Without Alchemy** (no key, error or daily budget used): the last few hours of token transfers for tokens the
  wallet holds, read from the chain; coin transfers can't be found that way. The page says so ("last few hours only").
- **Rules (pure, unit-tested):** likely spam (tokens the balance view hides, links or bait words, zero-value incoming
  tokens) hidden by default and counted; **address poisoning** (heuristic): a zero or dust transfer whose other side
  starts and ends like the wallet or like an address it paid; swaps = our reading of one transaction with something
  out and something else in ("Interpretation").
- **Page:** last activity, first activity, transfers loaded, spam hidden; filters (received/sent, coins/tokens/NFTs,
  chain), search, time range, spam switch; grouped by day; "Load older activity"; CSV export built in the browser
  (formula injection blocked); "How we got this". API: `GET /api/v1/address/{address}/activity?cursor=bsc:N,ethereum:N`.
- Tool description updated to what is built (the old text promised "total transactions" and "most-used contracts",
  which aren't part of this design).

Checks (cloud workspace, which has no Alchemy key): unit 221 passed (8 new: Alchemy parsing for every category and
junk, paging cut-off, look-alikes, poisoning, spam, swap grouping, CSV); the no-Alchemy path read live on BNB Chain;
build passed (CSS 72.5 KB of 72); browser 109 passed (new: activity tab, tool page, cursor validation).
**Not verified here:** the Alchemy history path itself. `tests/unit/activity-live.test.ts` checks it with the owner's
key (ordering, every transfer involves the wallet, page 2 continues without repeats).

## M6 follow-up (2026-11-21): owner's wallet vs revoke.cash

Owner check: CRYPY showed 0 approvals for a BNB Chain wallet where revoke.cash shows 94. Causes found and fixed:

- **GoPlus "partial data" was treated as a failure.** For busy wallets GoPlus answers with code 2 ("partial data
  obtained") and still sends the list; it also took 3–6 s, over CRYPY's 4 s limit. Now code 2 is accepted (the page
  says the list may be partial), with a 15 s limit for approval lists. Result: **94 of 94** approvals found, matching
  revoke.cash.
- **0x AllowanceHolder** (official 0x contract, docs.0x.org) is flagged as malicious by GoPlus. It is now on CRYPY's
  list, and when GoPlus flags a contract CRYPY's list names, the approval shows as **"Check — GoPlus: flagged"** with
  both views explained, instead of "Malicious".
- **PancakeSwap Permit2** (developer.pancakeswap.finance) and PancakeSwap Universal Router added; app allowances are
  read from both Permit2 deployments, and revoke supports both (guarded the same way).
- **New contracts:** an unknown spender created less than 30 days before the approval is flagged "New contract"
  (creation time from GoPlus, labelled).
- GoPlus's contract name is shown as "Named by GoPlus: …" for spenders not on CRYPY's list (a label only).
- Summary now says "N approvals to check" when nothing is flagged but unknown contracts remain.

Checks: unit 212 passed; live 14 passed (incl. the new contracts having code on their chains); build passed;
browser 102 passed + 1 recently-viewed test that timed out once on live data and passed on re-run.

## M6 checks (2026-11-21, in the cloud workspace)

- Typecheck, lint, Prettier: passed. Unit tests: 209 passed (11 new: risk rules, spam tokens, unlimited thresholds,
  GoPlus parsing, revoke calldata guard, "only the revoke runner can send" source scan).
- Live (`LIVE=1`): approvals 2 passed (known spenders are contracts on both chains; a real wallet read on-chain);
  security live tests still pass.
- Build passed. Playwright: 103 passed (new: approvals page with live data, read-only for another wallet, revoke flow
  with a recording fake wallet — tested first, nothing sent before the click, exact `approve(spender, 0)`, rejection
  handled — and the tool page; desktop and phone).
- CSS kept within the 72 KB budget (three near-identical grid classes elsewhere merged).

## Speed fix for the transaction page (owner report 2026-11-20)

Owner reported slow transaction pages on his PC. Measured cause: the reader asked the nodes 6–8 questions one after
another, so every extra bit of network distance was multiplied; old transactions also tried "past" reads that free
nodes can't answer, then retried them on a second node.

- **3 network requests per transaction** (was 6–8): transaction + receipt + latest block together; then block, contract
  code, token names, failure reason and price pools together; then pool readings. The price engine itself now needs 2
  rounds instead of 4 (native coin and tokens together; unknown decimals read in the first round).
- **Past-state reads only when they can work:** failure-reason replay and transaction-time prices are tried for recent
  transactions (last ~100 blocks) or when an archive-capable provider (Alchemy) is set; both have a 2.5 s limit, today's
  prices 4 s. Nothing optional can hold the page up.
- **Unreachable providers are skipped for 60 seconds** after a timeout, network error, HTTP 5xx or 429 (never after a
  normal node answer such as a revert). Per-request time limit lowered from 8 s to 5 s.
- **Settled transactions are cached for 5 minutes** (64+ confirmations); pending and recent ones for 15 seconds.
- Cloudflare's Ethereum node stopped answering ("Cannot fulfill request"); replaced by the free public dRPC node
  (`eth.drpc.org`), checked working.
- `pnpm env:check` now shows each provider's response time from the owner's computer (fast / ok / slow) and also tests
  the built-in public nodes.

| Measured (same 5 real transactions) | Before    | After     |
| ----------------------------------- | --------- | --------- |
| Network requests per transaction    | 6–8       | 3         |
| With 400 ms added to every request  | 2.6–2.9 s | 1.4–1.6 s |
| Fast network (this workspace)       | 0.9–1.3 s | 0.3–0.6 s |

Checks: lint, Prettier, 128 unit tests (2 new for skipping unreachable providers), 16 live tests, clean build, 81 browser
tests — all passed.

**Follow-up after the owner's `pnpm env:check` (2026-11-20):** from the owner's PC Alchemy answered in ~2.5 s per request,
public nodes in ~0.45 s. Because Alchemy was always tried first, every round waited ~2.5 s.

- **Speed-ranked rotation:** CRYPY measures every provider's real response time (moving average, forgotten after 10
  minutes) and tries the fastest working one first. Until measured, the old order applies (Alchemy, extra, public).
- **Hedging:** if a provider hasn't answered within 2.5× its expected time (0.7–2.5 s), the same read also goes to
  the next provider and the first answer wins. Reads only; the server never sends transactions.
- **Old-block reads go to Alchemy only** (archive), recent ones to any node; no archive → skipped.
- **Free-plan batch limit:** dRPC's free plan rejects more than 3 requests per batch; non-Alchemy providers now get at
  most 3 per call (larger rounds go out as parallel calls).
- Simulation (first node 2.5 s, the other 0.4 s per request): after the first page, 1.5 s per transaction with every
  request on the fast node; the first page ~4 s while speeds are learned.
- `.gitattributes` added (LF line endings everywhere) so Git on Windows stops warning about CRLF.
- **Fix (owner report: "We couldn't find this transaction"):** with speed ranking, a fast public node could answer
  "not found" for a transaction it hadn't seen yet (nodes lag or disagree), and that answer was taken as final. Now a
  null answer to a transaction or receipt lookup makes CRYPY ask every remaining provider at once; "not found" only when
  none has it (or the rest failed). 6 tests with local fake nodes cover this, hedging, reverts and errors.
- 3 new unit tests for ranking; 131 unit, 16 live and 81 browser tests passed.

## M4.1 — Transaction Intelligence (design approved 2026-11-20)

The transaction page now explains instead of listing (design boards 11–16).

- **Interpretation engine** (`src/lib/tx/interpret.ts`, pure, unit-tested): classifies send, token send, NFT send, receive,
  swap, approval, revoke, mint, burn, wrap, unwrap, contract creation, empty self-transaction, contract call and unknown
  call. Events are evidence; a decoded function name is only a clue (a "transfer" call without a Transfer event is not
  called a transfer). Each result carries an evidence level: confirmed / decoded / likely / unknown. Output is template
  keys and values, so every sentence is translatable.
- **Simple view (default):** headline ("Sent 84.74 USDC to 0xD37A…06B4"), status, network, type, time ago + the visitor's
  own time + UTC; visual flow (wallet → assets → wallet/contract, exchange both ways, dashed for permissions, failed and
  pending); progress line (sent → in a block → final after 64 blocks on Ethereum / 15 on BNB Chain); the sender's
  changes from token events (labelled, with the limit that coins moved inside contracts may be missing); cost in dollars
  first with a "What is this?" tip; "Good to know" notes; all token events and technical details on demand.
- **Failed-transaction explainer:** insufficient balance or allowance, price moved (slippage), deadline, access denied,
  paused, inner token transfer failed, math error, standard named errors (ERC20InsufficientBalance, …), "probably out of
  gas" only when ≥ 97% of the gas was used, and honest "no message" / "not available" cases. The contract's own message
  is always shown; "What usually helps" only for well-understood cases.
- **Approvals:** what the permission means, unlimited vs limited vs whole NFT collection, and "Is it still active?
  Not checked yet" (no claim either way until the Approval Checker in M6).
- **Pending:** last checked time, fee shown as a labelled maximum estimate, and "Can it still go through?" from evidence:
  if the sender already used this nonce, it can't confirm (replaced or cancelled).
- **Advanced view:** chain ID and CAIP-2, block hash, position in block, nonce, type; gas limit/used, base fee, priority
  fee (only where the chain has a base fee), effective and max prices, burnt, total; function and parameters; asset
  movements and permissions; every event in original order with raw topics and data; input data. The choice is
  remembered on the device and applied before the page draws.
- **Names for well-known contracts** (`src/config/known-contracts.ts`): 25 routers, aggregators, Permit2, wrapped coins
  and major tokens on both chains, plus burn addresses; a live test checks each is a real contract.
- **Decoder:** Universal Router `execute` (Uniswap / PancakeSwap) added; nested calls are only decoded for real multicall
  functions.
- **Prices:** today's on-chain price, or the price at the transaction's block when the node still has that state (recent
  blocks on free nodes; any block with an archive provider). Never mixed; always labelled.
- **Export:** copy plain summary, copy link, download readable report (text), details (JSON) and the node's raw
  transaction and receipt (`GET /api/v1/tx/<hash>?chain=&format=text|json|raw`, rate-limited, nothing stored).
- **Transaction Checker tool page is live** (`/tools/tx-checker`): hash box, how-to, FAQ and a per-network support table
  (supported / partial) from `src/config/tx-support.ts`.

## M4.1 checks (2026-11-20, in the cloud workspace)

| Check                                                                                                             | Result            |
| ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| typecheck, lint, Prettier, i18n check                                                                             | ✅ Passed         |
| `pnpm test` — 126 unit tests (23 new for the engine: every type, evidence rules, failure categories, net changes) | ✅ Passed         |
| Live tests (`LIVE=1`) — 16, incl. all 25 known contracts having code and the 10 real transactions                 | ✅ Passed         |
| `pnpm build`                                                                                                      | ✅ Passed         |
| `pnpm test:e2e` — 81 browser tests run twice in a row (162 runs; 9 for the transaction page and tool, live data)  | ✅ Passed         |
| Visual: send, failed, unknown contract call, contract creation, Advanced view, tool page, phone, Arabic RTL       | ✅ Looked correct |

Spec test list coverage: native send, token transfer, failed with message and without, unknown contract call, many
events, no events, contract creation, not found, pending (M4, real mempool transaction), mobile, Simple/Advanced, RTL —
checked on real transactions. Covered by unit fixtures only (no clean real example captured yet): approval/revoke,
swap through a known router, mint, burn, wrap, replaced pending transaction, out of gas. **Owner check:** open an approval
and a swap of your own on CRYPY to confirm the wording.

## M4 — Transaction page (Tool 5)

- **Plain-language summary** at the top: "0xc838…ff47 called transfer on USDC (0xA0b8…eB48). It moved 1 asset."; failed, pending and contract-creation cases have their own wording.
- **Overview:** time (UTC) and how long ago, block and confirmations, from, to (wallet or contract, token name when it is a token), contract created, value sent, network fee, burnt base fee (Ethereum), gas used of limit, gas price, nonce, transaction type. Tiny amounts show "< 0.00000001" and "< $0.01" instead of a misleading 0. Fee-free BNB Chain transactions say so.
- **Failed transactions:** the contract's error message, read by replaying the call one block earlier (e.g. "ERC20: transfer amount exceeds balance"). When the node no longer keeps that state, the page says the reason isn't available; it never guesses.
- **Asset movements:** ERC-20 / BEP-20, ERC-721 and ERC-1155 transfers and WETH/WBNB wrapping from the receipt's events, with token links and USD value at today's on-chain price (labelled as such).
- **Spending permissions changed:** token approvals and NFT operator approvals, with a warning when permission was granted and "Unlimited" highlighted.
- **Function called:** decoded with the Transaction Data Decoder's 31 known functions (parameters linked, approval/ownership warnings); unknown functions show their ID only. Raw input data in a collapsed box (first 2 KB).
- **Pending:** status, sender, gas limit and max gas price; the page refreshes itself every 15 seconds (stops after 10 minutes or when the tab is hidden).
- **Not found:** explains the likely reasons and links to a search across all networks.
- Non-standard events are counted ("3 events aren't standard token events") but never interpreted.
- Cost per page: about 6–9 node requests (batched), cached 15 seconds; no paid API.

## M5.2 — Token Security: finishing parts (2026-11-20)

No new screens: the existing Trade test, Owner and Liquidity cards show the new facts.

- **Trade test v3 (new contract `CrypyTradeTestV3.sol`):** one contract for both exchange designs. Uniswap-v2-style
  pools go through their router; Uniswap-v3-style pools (Uniswap v3, PancakeSwap v3 and forks) are called directly,
  so no router is needed. Pools paired with a stablecoin are tested by first swapping the native coin to that
  stablecoin through the chain's main v2 exchange; the card says so. The test picks the deepest supported pool by
  value. When a v3 pool rejects a sale because the token takes a fee on the way in, the fee is measured and the card
  explains it (still a failed sale: it can't be sold through that pool).
- **Owner powers from verified source:** when the source is published on Sourcify (for a proxy: the implementation's
  source), CRYPY reads every power-like function by its real name, who may call it (owner, role, another named
  account, anyone, or not recognised) and the limits it checks (shown as written). Renouncing ownership lowers only
  owner-gated powers; powers held by roles or named accounts stay, and an "anyone can call" power is flagged. Without
  verified source, powers still come from the compiled code as before. Source text is never executed; names and
  limits are shown only if they look like plain Solidity.
- **Lockers:** DeepLock (BNB Chain) added, read per token from the contract. Every locker now carries whether it is
  upgradeable (checked against the proxy slots by the live test): Team Finance and PinkLock v1 are; their locks show
  "the lock is only as safe as that operator", with a low note in the report. The old DxSale locker drained in May
  2026 is not trusted (it counts as an unidentified contract).
- **Timelocks:** recognised live on real contracts (Uniswap governance Timelock, ENS DAO TimelockController: 48 h).

Real results (2026-11-20): FLOKI 0.3% fee measured as before (v2); a v3-only token traded directly on PancakeSwap v3;
a USDT-only token traded through BNB → USDT first; SafeMoon's buy still fails. CAKE's mint is owner-only (from
source); USDC's mint, blacklist and pause belong to named accounts (from the implementation's source).

Decision needed (explorer source check): Etherscan's free API plan is licensed for personal and research use only;
a commercial site, displaying its data to users, is not allowed. BscScan's API was replaced by Etherscan's. So CRYPY
keeps Sourcify (open) for source checks until the owner decides (options in the roadmap).

Not added yet: GemPad, Mudra and DXLock (newer "personal locker" contracts): their official contract addresses and
read methods couldn't be confirmed from their own documentation; holdings there show as unidentified contracts.

## M5.2 follow-up (2026-11-20): when every node is resting

On the owner's PC two live tests failed in 1–3 ms: after heavy checks every BNB Chain node was in its one-minute
rest, so requests failed without asking anyone. Now, when all of a chain's providers are resting at once, the one
whose rest ends soonest is asked again (`wakeOneIfAllResting`); providers over their daily budget stay off. Unit test
added; unit tests 198 passed; security live tests 8 of 8 passed.

## M5.2 checks (2026-11-20, in the cloud workspace)

- Typecheck, lint, Prettier: passed. Unit tests: 197 passed (new: source reading — names, access, limits, comments
  and strings ignored, unsafe names dropped; renounce rules for role-held and open powers; v3 fee rejection).
- Contract: `scripts/verify-trade-test.mjs` runs the contract in a local in-memory EVM against a 1%-fee token and a
  v3-style pool: buy fee, transfer fee and the rejected sale's fee all measured as 1% (4 of 4 passed). The bytecode
  it compiles equals the production bytecode.
- Live (`LIVE=1`): 16 passed (new: v3-only and stablecoin-only trade tests, Sourcify source reading for CAKE and the
  USDC implementation, timelocks, locker upgradeability flags, DeepLock's read method).
- Build passed. Playwright: 95 passed in total; one batch-scanner test failed once under load and passed when re-run
  (that page wasn't changed).

## M5.1 — Who holds the liquidity (design approved 2026-11-20, boards 21–23)

Replaces M5's "main pool only, PinkLock/UNCX balance = locked" check, which showed liquidity held inside other
contracts as "not locked".

- **Every pool:** all registered exchanges (now also ApeSwap, BabySwap, BakerySwap and MDEX on BNB Chain, liquidity
  only), plus pools GoPlus names, accepted only after the pool's own factory confirms it (`getPair`). Pools under
  $1,000 are listed but not counted; totals are weighted by each pool's value.
- **Finding holders (free nodes):** known addresses (burn, owner, token, pool, every registered locker and farm, each
  exchange's fee collector read from `feeTo()`), GoPlus's largest LP holders (as leads only), everyone in the pool's LP
  transfers of the last few hours, and the lockers' own lists of locked v3 positions. Every share is then read
  on-chain. Whatever isn't found is shown as **"Holders not found / Not checked"**, never as safe.
- **What each holder can do (read on-chain):** burn address; lock contracts from CRYPY's checked list with every lock's
  end date read from the locker (UNCX v2 Uniswap/SushiSwap/PancakeSwap, PinkLock v1/v2 incl. vesting, Team Finance,
  UNCX v3); OnlyMoons vaults (trusted only when the factory confirms the vault); Safe multisigs (threshold of signers;
  1-of-n counts as one person); timelocks (delay); staking farms (PancakeSwap MasterChef v1/v2/v3, SushiSwap
  MasterChef, Uniswap v3 Staker); the exchange's fee collector; the owner; the token contract; wallets; unidentified
  contracts. A contract that only calls itself a lock is unidentified.
- **v3 pools:** positions (NFTs) of the owner, the token, burn addresses, GoPlus leads and registered v3 lockers,
  valued by their liquidity at the current price; shares by value. A locked position counts only while the locker
  still holds the NFT.
- **Lock indexes:** Team Finance and UNCX v3 can't list one token's locks on-chain, so the server keeps an in-memory
  index of which locks belong to which token/pool (built at server start, gently: one 250-lock read at a time;
  topped up on each check). Lock terms are always re-read live. While the index is still building, those locks show
  "terms couldn't be read" (unknown, never protected).
- **Rules:** protected = burned or locked for more than 30 days; protected ≥ 90% → pass, else low (≥ $100k) or
  medium; owner ≥ 50% high, ≥ 10% medium, else low; unlocking within 30 days medium from 5%; ended locks count as
  removable (high from 50%, medium from 10%); unidentified contracts or unread locks a low heuristic note from 1%;
  holders not found from 5% → "not checked".
- **Card:** "Who holds the liquidity", full width: totals, a coloured bar, every pool with its holders (type, share,
  lock or control, status), small pools, empty-pool count and "How we checked".

Real results (2026-11-20): FLOKI main pool — UNCX lock until 2286 (84.2%), Safe 3-of-5 (9.4%), OnlyMoons vault with
no end date (6.5%), 100% of holders found; ApeSwap/Biswap pools' holders not found (shown as such). A PinkLock v2
token: 100% in one lock. A Team Finance token (Ethereum): its lock read through the index. A PancakeSwap v3 pool: two
UNCX v3-locked positions until Nov 2028 (99.9% found). CAKE: LP mostly staked in PancakeSwap farms; fee collector
named.

Not covered yet (tracked in the roadmap): the complete LP holder list (needs the pool's full transfer history: CRYPY's
own indexer, M5.5 Stage 2); v3 positions staked in farms or locked in Team Finance/PinkLock; lockers not yet in the
checked list (GemPad, DxLock, Mudra and others); a live example of a timelock-held pool (logic unit-tested only).

## M5.1 checks (2026-11-20, in the cloud workspace)

- Typecheck, lint, Prettier: passed. Unit tests: 192 passed (15 new: lock timing, locker splits, unread locks, 1-of-n
  multisigs, pool split, weighting and dust pools, every new rule, GoPlus lead parsing, v3 position values).
- Live (`LIVE=1`): 7 new passed (registry methods, FLOKI, PinkLock, Team Finance, UNCX v3, CAKE farms, GoPlus pool
  leads); security live tests still pass.
- Build passed. Playwright: 95 passed (new: FLOKI liquidity card on desktop and phone). CSS kept within the 72 KB
  budget by simplifying the card's classes.
- Found while testing: big bursts of lock-index reads made free nodes time out, and a timed-out node is skipped for a
  minute by every check, so the index is built one small read at a time.

## M5 — Token Security (design approved 2026-11-20, boards 19–20)

Owner requirement: designed so new exchanges and blockchains can be added without changing the page.

- **Layers:** a chain-family adapter supplies plain facts (`TokenSecurityFacts`, `lib/security/types.ts`) → one
  shared, pure rules module turns them into checks (`lib/security/evaluate.ts`) → the page and the API render the
  report. A new chain family implements `getTokenSecurity` and declares the `tokenSecurity` capability; nothing else
  changes. A missing fact becomes "not checked".
- **Exchange registry** (`server/chains/evm/security/dex-registry.ts`): Uniswap v2, SushiSwap, PancakeSwap v2 (Ethereum);
  PancakeSwap v2, Uniswap v2, Biswap (BNB Chain); Uniswap v3 and PancakeSwap v3 on both. Another Uniswap-v2-style fork
  is one line; a new exchange design adds a pool reader and a trade simulator for its protocol. Every router is
  checked on-chain by a live test (factory and wrapped coin match).
- **Trade test (CRYPY's own, free):** `contracts/security/CrypyTradeTestV2.sol` buys about $10 of the token, transfers 10%
  to a second address and sells the rest, inside a read-only `eth_call` with a state override. Never deployed; nothing
  signed or sent. Measures buy, sell and transfer tax and reports the step that failed with the contract's own error.
  Test size is capped at 0.5% of the pool. A unit test fails if the source changes without rebuilding the bytecode.
- **Contract reads:** owner (`owner()` / `getOwner()`), renounced or not, wallet or contract owner; proxies (EIP-1967,
  EIP-1822, beacon, older ZeppelinOS slots used by USDC, EIP-1167 clones, which are not upgradeable); owner powers
  found in the code (mint, fees, blacklist, pause, limits, cooldown, upgrade, SELFDESTRUCT), including the
  implementation's code for proxies.
- **Liquidity:** pools on every registered exchange against the wrapped coin and stablecoins, USD value. (Who holds the
  liquidity was replaced by M5.1 above.) Empty pools are counted, not listed.
- **Outside sources (free, cached):** Sourcify for published source code (1 day); GoPlus for holders and a second opinion
  (1 hour), always shown with its name, compared with CRYPY's own checks ("agrees on 4 of 4"), never mixed in.
  Honeypot.is is not used: its terms forbid offering its functions to others.
- **Rules:** critical only for what the trade test observed (selling or transfers blocked, a tax of 50% or more); a
  function found in the code tops out at high, one step lower when the owner is a contract, low once ownership is
  renounced; a burned proxy admin is low; unprotected LP is low in deep pools (≥ $100k), medium in small ones; empty
  pools high. There is never a "safe" verdict.
- **Pages:** the token page now opens on a Security tab (Market marked "Soon"); the Token Security Scanner tool page is
  live with an address box and chain choice; `GET /api/v1/token/{chain}/{address}/security` returns the report.

Real results (2026-11-20): CAKE and USDT "Some warnings" (a contract owner can mint), USDC "Risks found" (upgradeable
proxy and mint/blacklist powers held by a wallet), PEPE and FLOKI "No major risks found" (FLOKI's real 0.3% fee
measured), SafeMoon "Risks found" (buying fails with "Pancake: TRANSFER_FAILED"), a new four.meme token: empty pools,
fixed clone. GoPlus agreed with CRYPY on every shared check for CAKE, USDC and the four.meme token.

Not covered yet: trade test on v3-only or stablecoin-only tokens ("not checked"), holders without GoPlus, contract
age and creator, source verification on block explorers, owner powers from verified source (all tracked in the roadmap).

## M5 checks (2026-11-20, in the cloud workspace)

- Typecheck, lint, Prettier, i18n check: passed. Unit tests: 177 passed (13 new: every rule, code reading, GoPlus
  parsing from a real answer, source/bytecode guard).
- Live (`LIVE=1`): 5 new passed (routers and lockers, CAKE, FLOKI's 0.3% fee, USDC's proxy, a non-token contract).
- Build passed. Playwright: 93 passed (new: token page report, tool page form, a "not live yet" page).
- A free-plan limit seen while testing: GoPlus stopped answering after about 10 quick calls; the page then shows
  "not checked" for holders and the second opinion.

## M4.5 — Batch Balance Scanner (design approved 2026-11-20, boards 8–10)

What was built (`/tools/batch-balance`, Wallet category, "New" badge in the sidebar):

- **Address list editor:** paste, type, drag-and-drop or upload CSV/TXT (read in the browser, 1 MB cap); line numbers;
  per-line notes drawn beside each line: duplicate (merged, label kept), wrong checksum (possible typo, never "fixed"),
  invalid, several addresses on one line, over the 500 limit. Labels after a comma (or before the address) are cleaned
  of invisible and direction-changing characters and **never leave the browser**.
- **Chains:** Ethereum and BNB Chain (from the chain registry; new EVM chains appear automatically).
- **Assets:** native coin always, plus up to 5 tokens: quick picks from a list of 14 well-known tokens (per-chain
  contracts and decimals, all checked on-chain by a live test), or any pasted contract, checked on every chain
  ("not a token on Ethereum, skipped there").
- **Scan:** batches of 100 addresses per chain, chains in parallel, progress bar and Cancel; each batch retried once;
  every batch of a chain read at that chain's first block (falls back to the latest block if a node no longer keeps it).
- **Server reads per batch** (`POST /api/v1/batch-balances`): one multicall (`getEthBalance` + `balanceOf`) and one
  "deployless" `eth_call` running a 37-byte hand-written program that returns each address's code size (wallet or
  contract; EIP-7702 delegated wallets confirmed by their code). First batch also returns on-chain USD prices.
  Read-only; nothing stored or logged; 16 KB body limit; 40 requests per minute per visitor.
- **Results:** status line with each chain's block and time; total value (priced assets only), addresses with a balance,
  empty addresses (only when every check succeeded), failed checks; total per asset per chain; table with search, chain
  filter, hide empty, sorting by any column, totals row, share bars, 50 rows per page, retry per failed row; phone layout
  with cards and a bottom Copy / Export bar.
- **Export:** CSV built in the browser (UTF-8 with BOM for Excel, exact amounts, formula injection blocked); copy the
  table, the addresses with a balance, or the empty addresses.
- **Wide tool pages:** `ToolPage` has a `wide` option (full content width for tables; reading text stays narrow).

Bug found and fixed during checks: results from the second chain overwrote the first chain's rows (rows were matched by
address only). A browser test now checks that each chain shows its own block.

## M4.5 checks (2026-11-20, in the cloud workspace)

- Typecheck, lint, Prettier: passed. Unit tests: 164 passed (12 new: parsing, totals, sorting/filtering, CSV safety).
- Live (`LIVE=1`): 4 new passed: token decimals on both chains, types (wallet / contract / delegated) and balances equal
  to single reads at the same block, a full 100-address batch at a fixed block, block fallback.
- Build passed. Playwright: 87 passed (new: list checks; two-chain scan with different blocks, labels never sent, CSV).
- Values spot-checked against direct reads: Binance 8 holds 14,000,000,000.000668 USDT on Ethereum; the burn address
  holds 5,524,547,438 CAKE on BNB Chain. A 6-address × 2-chain scan took under 1 second here.

## M4.2 — Transaction Intelligence V2, Part 1 (design approved 2026-11-20, boards 17–18)

What was built:

- **Evidence levels everywhere** (`lib/tx/assets.ts`): on-chain fact · standard event · verified with the protocol ·
  reported by a contract · interpretation · not identified. A conclusion is only as strong as its weakest input.
- **Actions detected** (`lib/tx/actions.ts`): one transaction → many actions (coin and token transfers, NFT moves,
  mint, burn, wrap/unwrap, pool swaps, liquidity add/remove, permission granted/changed/set/used/removed, router
  reports, contract creation, Safe and ERC-4337 executions), each with its events and evidence, plus "X of Y events
  explained" and the list of events we don't identify (never guessed).
- **Permissions:** granted vs changed vs **used** (an Approval next to a matching Transfer out of the owner) vs removed;
  value before (read from the chain at block − 1 when the node keeps it, otherwise worked out from events and labelled
  so), after (from events) and **today** (read now, with the time and a note that it doesn't say when or why it changed).
  The old "this transaction gave spending permission" warning now appears only when a permission was actually given.
- **Pools:** Uniswap v2/v3-style Swap, Sync, Mint and Burn events (and PancakeSwap v3's variant). A pool is "verified"
  only when a known factory lists it (getPair/getPool); otherwise it shows as "not verified". Factories: Uniswap v2/v3,
  PancakeSwap v2/v3, SushiSwap (Ethereum), Uniswap v2/v3 and Biswap (BNB Chain), all checked on-chain.
- **Router reports:** KyberSwap `Swapped`/`Exchange`/`ClientData`, read only when the known KyberSwap router emitted
  them, and labelled "reported". The same event from an unknown contract is ignored.
- **Coins paid inside contracts:** measured from the sender's balance before and after the block (recent blocks, or any
  block with an archive provider). A matching router report is upgraded to an on-chain fact; otherwise it stays
  "reported". When neither is available, the page says the coin side isn't visible.
- **Route template** (`lib/tx/route.ts`): a connected chain of steps from the sender (any number of hops, wraps and
  unwraps shown on the node), side payments listed separately ("possible fee (unverified)" only for a small payment of
  the same token out of the sender), or separate relationships when movements don't connect. Vertical steps on all
  screens, so long routes fit on phones.
- **Who was involved:** sender, called contract, router, pools, intermediaries, recipients, possible fee, spenders,
  tokens; contract or wallet read from the chain.
- **Neutral wording:** "Sender wallet", never "Your wallet". A "You" badge appears only when the visitor's connected
  wallet is the sender.
- **Consistent prices:** every value uses the price at the time when available, otherwise today's price, and says
  which (the Advanced table's "Value now" column was fixed).
- **Advanced view agrees with Simple:** each event shows which action explains it, with protocol event names.
- **Providers:** a node that refuses old data ("archive requests require a token", "missing trie node") is asked last
  for that kind of request for 10 minutes. Never removed.
- **Coverage registry** (`config/tx-support.ts`): actions, permissions, pools, router reports, smart wallets and coins
  inside contracts, each with its level and note.

Works reliably (tested on real transactions): coin transfers, token transfers, failed transactions, contract creation,
unknown calls with custom events, Uniswap v2 swaps, multi-pool aggregator trades (Uniswap v3), KyberSwap router swaps
with a PancakeSwap pool (the TATA regression case), approvals and permissions being used.

Partial or not yet decoded: coins paid inside contracts on old blocks without an archive provider; routers other than
KyberSwap (read from their token events only); Uniswap v4, Curve, Balancer and other pool types; lending, bridges and
NFT marketplaces (shown as their token movements, not named actions); Safe/ERC-4337 inner calls; execution traces.

## M4.2 checks (2026-11-20, in the cloud workspace)

- `tsc --noEmit`: passed. `eslint`: passed. Prettier: clean.
- `vitest run`: 152 passed (new: 14 intelligence tests built from the real TATA receipt, 1 provider-refusal test).
- Live tests (`LIVE=1`): 12 passed, including the TATA swap, a Uniswap v2 swap and a 35-event Uniswap v3 aggregator trade.
- `next build`: passed. Playwright: 82 passed (new: router swap page test on desktop and mobile), 7 skipped as before.

## M4 checks (2026-11-20, in the cloud workspace)

| Check                                                                                                                  | Result            |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------- |
| typecheck, lint, Prettier, i18n check                                                                                  | ✅ Passed         |
| `pnpm test` — 103 unit tests (7 new for event parsing: ERC-20/721/1155, approvals, wrapping, junk, caps)               | ✅ Passed         |
| Live tests (`LIVE=1`): 8 new on 10 real transactions — plain transfer, token transfer, failed, contract creation, swap | ✅ Passed         |
| Pending case: a real waiting Ethereum transaction caught from the mempool and opened                                   | ✅ Looked correct |
| `pnpm build`                                                                                                           | ✅ Passed         |
| `pnpm test:e2e` — 73 browser tests (5 new for the transaction page, live data)                                         | ✅ Passed         |

Values were cross-checked against direct node reads (block, value, gas, fee = gas used × price, created contract address, token symbol and decimals). Explorer websites can't be opened from this workspace, so **owner check:** open two or three of the test transactions on CRYPY and on Etherscan/BscScan side by side (hashes in `tests/unit/tx-live.test.ts`).

CSS budget raised from 60 to 72 KB uncompressed (one shared file, 11 KB gzipped).

## Desktop layout and UI polish (design approved 2026-11-20)

- Desktop (1024 px and wider): a left tools sidebar grouped by category, with icons, "Soon" badges and a Home link.
  It is plain server-rendered links; the only browser code highlights the current page and runs the collapse button.
  Collapsing to icons is remembered on this device (localStorage) and restored before the page draws, so it never jumps.
- The desktop header is slimmer: logo, search, language, theme, wallet. Tablet and phone layouts are unchanged.
- Chain icons (Ethereum, BNB Chain) from the `cryptocurrency-icons` set, licence CC0-1.0, about 0.5 KB each, in
  `public/chains/`. Shown in search results, identity cards, chain filters, holdings headings, the "other chains"
  strip, token and transaction badges, and a new "Works on" row on the home page.
- Breadcrumbs on address, token and transaction pages.
- "Recently viewed on this device" on the home page (last 8 lookups). It is stored only in the visitor's browser,
  never sent to the server, and can be cleared.
- Checks: typecheck, lint, Prettier, i18n, 96 unit tests, build, 60 e2e tests passed (4 skipped: desktop-only
  sidebar tests on the phone profile and one existing skip). Screenshots checked at 1440, 1280 (collapsed), 1024,
  820 (tablet) and Arabic RTL.

## Zero-API-cost foundations (owner rule, 2026-11-20)

- **Rule written into the docs** (ARCHITECTURE D15, roadmap, CLAUDE.md): no paid APIs or data services ever; only domain and servers are paid.
- **Provider rotation with daily budgets** (`src/server/chains/evm/providers.ts`): Alchemy free plan → extra free providers (`ETH_RPC_URLS`, `BSC_RPC_URLS`) → public nodes. Each provider has a daily budget (Alchemy 1M compute units ≈ 30M/month ÷ 30; others 50,000 requests), counted per request; an exhausted provider is skipped until midnight UTC. Concurrent requests go out as one JSON-RPC batch. The health page shows today's usage per provider (names and counts only).
- **Own price engine** (`src/server/chains/evm/prices.ts`): USD prices read on-chain from PancakeSwap v2/v3 (BNB Chain) and Uniswap v2/v3 (Ethereum) pools; the deepest pool against USDT/USDC/wrapped native wins; pools with less than $5,000 on the quote side are ignored, so tiny scam pools can't set a price. Two bundled reads per chain. **DefiLlama removed.** Live check: BNB $567.74 vs DefiLlama $568.32, ETH $1,739.57 vs $1,740.52, BTCB $61,515 vs $61,561, CAKE $1.5654 vs $1.5651.
- **Tidier balances:** the main table shows the native coin and priced tokens; tokens without a reliable price fold into a collapsed group with a safety note; spam stays hidden with reasons.
- **`pnpm env:check`** also live-tests every extra provider URL (right chain, answering) and prints host names only.

Checks: typecheck, lint, Prettier, i18n, 96 unit tests (provider budgets, price maths, DEX address checksums), 7 live tests (both chains, prices), build, 53 browser tests — all passed.

## Multi-chain addresses (owner request, design approved 2026-11-20)

One address can be a different thing on every chain (the USDT contract on Ethereum is an ordinary wallet holding BNB on BNB Chain). Search and pages now show this instead of hiding it:

- **Search:** checks every chain at once. Used on one chain → opens that page (token → token page, otherwise the address page). Used on several → a panel lists each chain with what the address is there (token name, wallet balance, contract) and the right button, plus "Open overview on all chains". Chains with no activity are summarised in one line. The no-JavaScript search page shows the same list.
- **Address page = all chains:** "Found on X of Y chains" cards (identity + key fact per chain), a chain filter with values (`?chain=bsc`, shareable), a note with a link when the address is a token contract on some chain, totals for the selected view, then holdings per chain.
- **Token page:** always one chain; a "Same address on other chains" strip links to the address elsewhere.
- "In use" = contract code, sent transactions, or a coin balance (search); the address page also counts tokens. A wallet that only ever received tokens may show as unused in search (the address page still shows them).
- The "All chains ▾" search filter from the design is deferred until more chains are live.
- Design canvas: "CRYPY — Multi-chain address design" (claude.ai artifact).

Checks: typecheck, lint, Prettier, i18n check, 86 unit tests (3 new resolver rules), build, 53 browser tests (2 new, live data) — all passed.

## M3 — what was built

- **Balance Scanner on the address page** (`/address/0x…`), for Ethereum and BNB Chain at once:
  - Native coin and every token with a balance (Alchemy token index, up to 300 tokens per chain; very large wallets are told the list is cut).
  - Token name, symbol and decimals read from the contracts themselves (multicall), sanitized.
  - USD prices from DefiLlama (low-confidence prices dropped); total value, value per chain, price per token.
  - Tokens without a reliable price are shown but not counted, and the page says how many.
  - Likely spam (website in the name, bait wording without a price, contracts that don't answer) is hidden in a collapsed list with the reason and a safety note. Heuristic, never deleted.
  - Each token links to its token page; the wallet/contract type per chain stays visible.
- **Free fallback:** without an Alchemy key (or if Alchemy fails), ten well-known tokens per chain are checked through public nodes, and the page says so.
- **Resilience:** one chain failing doesn't hide the other; if prices fail, balances still show.
- **Light:** rendered on the server, cached for 60 seconds per address; no extra browser JavaScript (tested).
- **Mobile:** on phones the balance sits under the value so nothing is cut off.
- **Search fixes (owner feedback):** the header search shows its messages in a floating panel (closes with Esc, click outside or X) so the header never changes height; the loading state clears after opening a page; a checksum warning now offers "Look it up anyway" (opens the lowercase form, with a reminder never to send funds to a mistyped address).
- **Balance Scanner tool page is live:** address box (format check, works without JavaScript), how-to and FAQ with FAQ structured data. The "runs in your browser" note now appears only on browser-only utilities.

## M3 checks (2026-11-20, in the cloud workspace)

| Check                                                                                                            | Result            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| typecheck, lint, Prettier, i18n check                                                                            | ✅ Passed         |
| `pnpm test` — 83 unit tests (9 new: spam rules, sorting, totals, Alchemy response parsing, token list checksums) | ✅ Passed         |
| Live tests (`LIVE=1`): real balances and USD values on both chains via public nodes and DefiLlama                | ✅ Passed         |
| `pnpm build`                                                                                                     | ✅ Passed         |
| `pnpm test:e2e` — 46 browser tests (2 new for the address page, live data)                                       | ✅ Passed         |
| Visual check: large exchange wallet, normal wallet on mobile                                                     | ✅ Looked correct |

**Not verified here:** the full token list through Alchemy (this workspace has no Alchemy key; Alchemy's demo key is blocked). The parsing is unit-tested with recorded responses. **Owner check:** open your own wallet's address page with your key set: the "Only well-known tokens were checked" warning must not appear, and balances should match BscScan/Etherscan.

## M2.5 — what was built

- **Four working tools**, running entirely in the browser (nothing typed is sent anywhere; browser tests check this):
  - **Unit Converter:** wei ↔ gwei ↔ ETH/BNB, exact BigInt maths (no rounding), scientific notation, clear errors.
  - **Hex Converter:** hex ↔ decimal up to 256 bits, 32-byte form, byte size, signed (int256) reading, and readable text when the bytes are text.
  - **Address Formatter:** EIP-55 checksum check for one address or up to 500; mistyped addresses are never "fixed" or offered for copying.
  - **Transaction Data Decoder:** 31 well-known functions (ERC-20/BEP-20, ERC-721/1155, WETH/WBNB, Permit2, multicall with nested calls, Uniswap V2/PancakeSwap router, Ownable). Heuristic warnings for unlimited approvals, NFT operator approvals and ownership changes. Unknown functions are shown as raw data, never guessed.
- **SEO:** each tool page has how-to steps, an FAQ, FAQPage structured data and its own preview image.
- **Lightweight:** each working tool has its own route, so a page downloads only its own tool. Home and "coming soon" pages: ≈ 157 KB gzipped JavaScript; tool pages 159–178 KB.
- **Health page** (`/api/v1/health`) now names the provider each chain uses and tests Alchemy, custom and public nodes separately (names only, never URLs or keys).
- **`pnpm env:check`:** checks `.env.local` (missing, empty, duplicated or commented-out keys, wrong file name) and live-tests the Alchemy key, without printing any value.
- **Header fix:** the header now fits on one row at every width (it wrapped at 768 px and 1280 px after M2 added the Connect button).

## M2.5 checks (2026-11-20, in the cloud workspace)

| Check                                                                   | Result            |
| ----------------------------------------------------------------------- | ----------------- |
| `pnpm typecheck`, `pnpm lint`, Prettier, `pnpm i18n:check`              | ✅ Passed         |
| `pnpm test` — 74 unit tests (19 new for the utilities)                  | ✅ Passed         |
| `pnpm build`                                                            | ✅ Passed         |
| `pnpm test:e2e` — 42 browser tests incl. utilities and page budgets     | ✅ Passed         |
| Visual check: all four tools, mobile, Urdu right-to-left, header widths | ✅ Looked correct |

## Owner checks on Windows (2026-11-20)

- `pnpm install` works after setting `@reown/appkit: false` in `pnpm-workspace.yaml`.
- Search, health page and MetaMask connection work locally; Alchemy and Reown keys verified with `pnpm env:check`.
- **Phone wallet via QR code tested with SafePal: works.** Trust Wallet / MetaMask app links on a phone still need testing after the first deployment.

## M2 — what was built

- **Multi-chain core:** CAIP identifiers (`src/lib/chains/caip.ts`), chain settings for Ethereum and BNB Chain (`src/config/chains.ts`), one `ChainFamilyAdapter` interface (`src/lib/chains/types.ts`) and the EVM adapter (`src/server/chains/evm/adapter.ts`). Adding another blockchain family = one adapter registered in `src/server/chains/registry.ts`.
- **Data providers (free first):** Alchemy when `ALCHEMY_API_KEY` is set, then an optional custom RPC, then free public RPCs, with automatic fallback, 8-second timeouts and batched contract reads. DefiLlama price client ready for M3 (low-confidence prices are dropped, never guessed).
- **Search resolver:** a pasted value is checked by every registered family, then looked up live on all matching chains in parallel. A token on one chain opens its token page; a token on several chains shows a chooser; wallets open the address page; transaction hashes are found on the right chain. A chain that fails is reported, not hidden. Wrong EIP-55 checksums are caught before any lookup (usually a typo). EIP-7702 delegated wallets are recognised.
- **API:** `GET /api/v1/health` (block height per chain) and `GET /api/v1/search/resolve?q=` with input validation, one response format (`{ok, data, meta}` or an error code) and per-visitor rate limits.
- **Result pages:** `/address/…`, `/token/{chain}/…` (name, symbol, decimals, total supply, link-in-name phishing warning), `/tx/…` (status, block, from, to), and `/search?q=` which also works without JavaScript. These pages are `noindex`, rate-limited and show explorer links. Their full tool sections arrive in M3–M6.
- **Untrusted token text:** names and symbols are stripped of invisible and direction-changing characters and length-capped.
- **Wallet connection (optional):** browser wallets found automatically (EIP-6963: MetaMask, Trust, Rabby, …) and WalletConnect with a QR code and Trust/MetaMask phone links when a Project ID is set. Wallet code (≈ 60 KB gzipped) downloads only when someone clicks Connect, or for returning wallet users. Connecting never asks for a signature or transaction: an ESLint rule blocks the signing hooks and a browser test fails if any signing method is called. Stays connected when the language changes.
- **SEO:** JSON-LD (WebSite with site search, Organization; WebApplication and breadcrumbs on tool pages), Open Graph preview images for the home page and every tool page (generated at build time), robots.txt now keeps crawlers away from result pages and the API.
- **Security headers:** Content Security Policy now allows only the RPC hosts and WalletConnect services the site actually uses.

## Checks run (2026-11-20, in the cloud workspace)

| Check                                                                                                 | Result     |
| ----------------------------------------------------------------------------------------------------- | ---------- |
| `pnpm typecheck`                                                                                      | ✅ Passed  |
| `pnpm lint`                                                                                           | ✅ Passed  |
| `pnpm test` — 55 unit tests (CAIP, EVM parsing, resolver incl. a fake second family, API, formatting) | ✅ Passed  |
| `LIVE=1 pnpm test tests/unit/live.test.ts` — 3 tests against real Ethereum and BNB Chain nodes        | ✅ Passed  |
| `pnpm build`                                                                                          | ✅ Passed  |
| `pnpm test:e2e` — 28 browser tests, desktop + mobile (incl. wallet connect and budget)                | ✅ Passed  |
| Live checks: USDT on Ethereum and BNB Chain, a real wallet, a real transaction, a made-up hash        | ✅ Correct |

Measured home page weight (production build): JavaScript ≈ 157 KB gzipped (523 KB uncompressed, budget 650 KB); CSS ≈ 10 KB gzipped.

Not yet run: Lighthouse score, real phones beyond the SafePal QR test.

## M1 checks (2026-11-19)

| Check                                                                             | Result            |
| --------------------------------------------------------------------------------- | ----------------- |
| `pnpm typecheck`                                                                  | ✅ Passed         |
| `pnpm lint` (incl. no hard-coded text rule)                                       | ✅ Passed         |
| `pnpm test` — 23 unit tests                                                       | ✅ Passed         |
| `pnpm build` — 220 static pages                                                   | ✅ Passed         |
| `pnpm test:e2e` — 24 browser tests, desktop + mobile                              | ✅ Passed         |
| Visual check: home dark/light, mobile, Urdu RTL, tool page, dialog, language menu | ✅ Looked correct |

Not yet run: Lighthouse score, testing on real phones, checks on the owner's Windows PC.

## Status labels

- ✅ Complete: everything in the milestone's scope is implemented and tested.
- 🟡 Built, not complete: works and is tested, but named parts are deferred; each is listed in DEVELOPMENT_ROADMAP.md
  under "Deferred parts" with the milestone it belongs to. Never called complete until that list is empty.

## Moved to later milestones

- **M2 (done):** connect button, search routing, checksum validation, providers and API.
- **M3:** balances and USD values on the address page (the price client is ready).
- **M9:** reviewed Urdu and Arabic fonts and translations.

## Known issues

- **Fixed (2026-11-21): server crash on the owner's Windows PC.** Under the full browser suite the app server sometimes
  exited with Windows code 0xC0000409 (a native abort inside Node v26.13.1, no JavaScript error, normal memory): 3 of
  5 full runs. Isolated on the owner's PC: the suite without the two-wallet Portfolio test passed with no crash, and
  the Portfolio test alone (6 times, 3 at once) passed with no crash; only both together crashed, i.e. too many
  outbound requests at once. Fix: one server-wide cap of 32 outbound requests in flight (`server/http/limit.ts`, used
  by every provider, Alchemy, GoPlus and Sourcify call). Then 2 of 2 full runs: 129 passed, no crash. Not seen on
  Linux; production runs on Linux.
- **Fixed (2026-11-22, M9 security review):** per-visitor limits used the first `X-Forwarded-For` address, which a
  visitor can fake. They now use the address our proxy sets (`X-Real-IP`, else the last `X-Forwarded-For` entry); on
  the VPS, nginx must set `X-Real-IP` (launch requirements in ARCHITECTURE.md §10d).
- After pulling new files, if the site's styles look out of date, delete the `.next` folder and build again (the build cache once kept an old stylesheet here).
- Transaction page: execution traces need our own node (later). Coins moved inside contracts are measured from balances only for recent blocks or with an archive provider. "First seen" time for pending transactions needs a mempool watcher (later).
- TATA and other small tokens can show no USD price: the price engine only reads the main pools against stablecoins and the wrapped coin, above a liquidity floor.

- Transaction page USD values use today's price (historical prices need archive data; planned with the M5.5 indexer).
- Revert reasons need recent state; for older failed transactions public nodes usually can't replay them, and the page says so.

- Prices come from on-chain pools only: tokens that trade on other DEXes, or only against other quote tokens, show "No reliable price" until more DEXes are added (M5.5 decoders).
- Alchemy's token list includes tokens a wallet held in the past (now zero). We read up to 1,000 entries per chain (10 pages × 20 compute units, cached) and drop the zeros; wallets that touched more than 1,000 tokens are told some may be missing. (Fixed 2026-11-20: the first version stopped at 300 entries and its warning wrongly said "holds" 300 tokens.)
- Rate limits are kept in memory per server. Fine for one server; a shared store (Upstash Redis free tier) is needed if the site runs on several servers.
- Open Graph images use English for every language until reviewed Urdu/Arabic fonts ship (M9).
- On Urdu/Arabic pages, untranslated English text shows full stops on the wrong side; fixed by the M9 translations.

- Unknown tool URLs show the not-found page with `noindex` but HTTP status 200 (Next.js Cache Components limitation). Not harmful for SEO.
- Browsers without CSS anchor positioning show the language menu centred instead of under its button.
- Legal pages are short drafts and must be reviewed by a lawyer before launch.

## Decisions log

- 2026-11-22: M9 order: security review first. Hosting: one VPS (site, PostgreSQL, alerts worker). The owner reviews
  Urdu; Arabic stays a preview language until a native speaker reviews it.
- 2026-11-21: M6 revoke transactions are built in the browser by one reviewed module and checked by decoding them again; only `revoke-runner.ts` may ask the wallet to send (ESLint + source-scan test).
- 2026-11-20: **Zero API cost (owner rule):** no paid APIs or data services ever; only domain and servers are paid. Free providers rotate with daily budgets; own price engine from DEX pools replaces DefiLlama; self-hosted database/cache/indexer on a VPS at launch; own nodes later.

- 2026-11-20: Addresses are multi-chain: search never hides another chain's identity; the address page is the all-chains view; token pages are per chain with links to the others.

- 2026-11-20: Token Market & Charts approved as M5.5: candles and trade history built from our own on-chain reads, starting at $0 (no data API, no extra server); long history and more DEX designs later (ARCHITECTURE.md §12b).

- 2026-11-20: Working tools get their own route folder (`app/[locale]/tools/<id>/`) so each page loads only its own code; `[toolId]` serves the "coming soon" pages.
- 2026-11-20: The decoder never guesses unknown functions (no 4byte lookups) to avoid showing a wrong meaning.

- 2026-11-20: wagmi 3 with `ssr: true`; wallet code is lazy-loaded; signing hooks blocked by ESLint until a feature needs them with explicit user approval (M6 revoke).
- 2026-11-20: Result pages (address, tx, token, search) are `noindex` and blocked in robots.txt; curated token pages for SEO come later.

- 2026-11-19: Performance rule — pages must stay light (D10 in ARCHITECTURE.md).
- 2026-11-19: next-intl 4.15.1 pinned (4.15.2/4.15.3 published the same day were refused by pnpm's one-day safety window).
- 2026-11-19: Translations kept server-side; client components get strings as props.
