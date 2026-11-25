# CRYPY — Progress

Last updated: 2026-11-25

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
| M9 Part 3 Online (friends preview)                     | ✅ Live 2026-11-22 on crypy.org (DigitalOcean + Cloudflare), abuse protection verified        |
| M9 Part 4 Public beta                                  | 🟡 Built 2026-11-22: open to search engines; legal pages await a lawyer (see roadmap)         |
| SEO Phase 1 Technical and on-page                      | ✅ Built 2026-11-22 (SEO_ROADMAP.md); Search Console setup by the owner pending               |
| SEO Phase 2 Learn hub (12 guides)                      | ✅ Built 2026-11-22 (design approved, boards 42–45)                                           |
| SEO Phase 3 Gas by chain, token checks                 | ✅ Built 2026-11-22 (design approved, boards 46–50); daily checks start on the server         |
| M9 Part 5 Monitoring: health checks, status, admin     | ✅ Built 2026-11-23 (designs approved, boards 51–54); owner sets ADMIN_WALLETS on the server  |
| Languages wave 1 (6 Beta languages)                    | 🟡 Built 2026-11-23: all text and 12 guides translated; native review pending for each        |
| Stabilization S0–S6 (owner decision 2026-11-24)        | 🟡 In progress: S0, S1 started; S2 built; S3 started 2026-11-25; features paused until S6     |
| M3–M9                                                  | Planned (see DEVELOPMENT_ROADMAP.md)                                                          |

## Utilities U3: developer tools (2026-11-25)

- **New sidebar group "Developer"** (folds like Calculators, opens itself on its pages). The Hex Converter and the
  Transaction Data Decoder moved into it from Utilities; their pages and links are unchanged.
- **Keccak-256 Hash & Function Selector** (`/tools/keccak-hash`): Keccak-256 and SHA-256 of text (UTF-8) or hex bytes;
  when the input is a function, event or error signature (`transfer(address,uint256)` or a full Solidity line with
  names and `indexed`), shows the canonical form, the 4-byte selector or the event topic. Covers the catalog's
  Keccak, function selector and event topic calculators.
- **ABI Encoder & Decoder** (`/tools/abi-encoder`): reads a JSON ABI, a build artifact with `abi`, or human-readable
  lines; rejects unknown types (e.g. `uint257`); lists functions, events and errors with selectors and topics; encodes
  a call (addresses checksummed, integers as exact BigInt, arrays and tuples as JSON); decodes call data and event
  logs (topics + data). Only builds bytes: nothing is signed or sent. The Transaction Data Decoder links unknown or
  mismatched functions here with the data in the URL fragment (`#data=`), which browsers never send to a server.
- **Base58 & Base64 Converter** (`/tools/encoding-converter`): text, hex, Base64 (padding optional), Base64URL and
  Base58 (Bitcoin alphabet, no checksum) both ways, with byte size; says when bytes aren't readable text. Its FAQ warns
  never to paste a private key.
- **JSON & CSV Formatter** (`/tools/json-csv`): format, minify and validate JSON with the line and column of an error;
  JSON list of objects ↔ CSV (RFC 4180 quoting, comma or semicolon). CSV cells starting with `=`, `+`, `-` or `@` get an
  apostrophe so a spreadsheet can't run them as formulas. Download is made in the browser.
- No new dependencies (viem and `@scure/base` were already there). Translations of all new texts in the 6 Beta
  languages; `messages/pending-translation.json` is empty.

**Checks:** typecheck, lint, Prettier, translation check clean. Unit: 583 passed, 76 skipped (10 new: Keccak/SHA-256
and selector vectors, ABI read/encode/decode round trip and logs, Base58/Base64 vectors, JSON errors and CSV safety).
Build passed. Browser, full run: 308 passed, 19 skipped, 1 failed — two new SEO titles were over 60 characters;
shortened, rebuilt, and the SEO and U3 files re-run: 14 passed, 4 skipped. 6 new U3 browser tests, each checking that
nothing typed is sent. CSS 80.5 KB (82,430 bytes): still exactly at the 80 KB budget with rounding, 1 byte of room.

## Utilities U2: three DeFi calculators, Bitcoin and Solana formats, signature decoder (2026-11-24)

- **Loan-to-Value & Liquidation Calculator** (`/tools/loan-to-value`): LTV, health factor (collateral value ×
  liquidation threshold ÷ debt), room left at the maximum LTV (negative when over), liquidation price and how far the
  price can fall; states safe / close (< 1.2) / liquidatable (< 1). Covers the catalog's "liquidation threshold
  calculator" too. Says protocols use their own prices, thresholds and growing interest.
- **Impermanent Loss Calculator** (`/tools/impermanent-loss`): 50/50 constant-product pools, loss = 2·√r ÷ (1 + r) − 1
  from both tokens' price changes, with held vs pooled dollar values. Fees, rewards and v3 are stated as not included.
- **Slippage & Price Impact Calculator** (`/tools/slippage-calculator`): minimum received / maximum sent from a
  tolerance; price impact, total cost (with the pool fee, 0.3 % by default), spot, execution and after-trade prices for a
  v2 pool from typed reserves. Read-only.
- **Address Formatter** now recognises Bitcoin (legacy P2PKH and P2SH by base58check; native SegWit, SegWit script and
  Taproot by bech32 / bech32m per BIP-173 and BIP-350; testnet) and Solana public keys (32 bytes in base58), catches
  Bitcoin checksum typos and mixed-case bech32, and says what a valid format does and doesn't prove. New dependency:
  `@scure/base` 1.2.6 (base58 / bech32; MIT, audited, already installed as part of viem, now a direct dependency).
- **Signature Request Decoder** (`/tools/signature-decoder`, Security): paste EIP-712 typed data (object, JSON string,
  or the wallet's `[address, data]` params) or a `personal_sign` message (text or hex). Recognises ERC-2612 permits,
  DAI-style permits, Permit2 PermitSingle / PermitBatch / transfers and Seaport orders; flags unlimited amounts,
  spenders not on CRYPY's list (names only from `known-contracts.ts`), no or very long expiry, missing or unsupported
  chains, orders that pay someone else, raw 32-byte hashes (blind signing) and unreadable bytes; shows every field and
  the EIP-712 hash. Unknown request types are never called harmless. Nothing is signed, sent or looked up.
- **Sidebar:** the Calculators group folds (closed by default, opens itself on a calculator page), so new calculators
  don't push the sidebar past one screen. Short sidebar names for the new tools.
- Translations of every new and changed text in the 6 Beta languages; `messages/pending-translation.json` is empty.
  Found while translating: an English error text containing "{ to }" was read as a placeholder; reworded everywhere.

**Checks:** typecheck, lint, Prettier, translation check clean. Unit: 573 passed, 76 skipped (19 new: LTV, impermanent
loss table, slippage and v2 impact, Bitcoin/Solana test vectors, signature decoder). Build passed. Browser: 298 passed,
18 skipped, 0 failed (6 new U2 tests, each also checking that nothing typed is sent). CSS 80.5 KB: at the 80 KB budget
(rounded); the next batch needs a little room, see below.

## Utilities U1: five browser-only tools (owner decision 2026-11-24)

Owner decisions 2026-11-24: browser-only tools may be built during stabilization; new screens are built directly
without design approval first (the owner reviews them on the site); each batch is built in English, then translated
into the Beta languages in one pass before it ships; Learn guides only where they really help.

- **Token decimals** (Unit Converter, `#token-decimals`): token amount ↔ base units for any decimals 0–36, both ways,
  exact BigInt, with 6 / 8 / 18 shortcuts; refuses more decimal places than the token has.
- **Your own fee** (Gas Tracker and each chain's gas page): gas × gas price (gwei or wei), exact in wei, gwei and the
  coin; dollars only from a price the visitor types. Says that a gas limit gives the highest possible fee, and that
  rollups add an Ethereum data fee. Typical gas shortcuts (send, token send, approve, swap, NFT).
- **Token Supply & Valuation Calculator** (`/tools/token-valuation`, new "Calculators" group): market cap
  (circulating × price) and FDV (maximum, else total supply × price, labelled) kept apart; circulating share, created
  but not circulating, not yet created; warns when FDV is 1.5× the market cap or more; refuses contradictory supplies.
  Never fetches a price.
- **APR / APY & Compound Interest Calculator** (`/tools/apy-calculator`): APR or APY, daily to yearly compounding,
  days / months / years up to 100 years, a deposit at the end of each period, year-by-year table, effective APY and
  the formula. Fixed-point decimals with 30 digits (`lib/math/decimal.ts`; APY→period rate by an exact Newton root);
  only the display is rounded. Warns that it is an estimate and not a promise of returns.
- **Address QR code** (Address Formatter and a QR button beside the address on every address page): drawn in the
  browser from the checksummed address (the `qrcode` library, already a dependency, loaded on opening); the network is
  chosen and printed beside the code and on the downloadable PNG, with a warning that the same 0x address exists on
  every EVM network. The Address Formatter now refuses anything that looks like a recovery phrase or private key.
- **Navigation:** sidebar group "Calculators" with short names (Market Cap & FDV, APY Calculator); sidebar rows are a
  little tighter so every tool still fits on a 1440×900 screen.
- **Translations:** all new and changed texts in the 6 Beta languages. New mechanism: `messages/pending-translation.json`
  lets a batch's new keys stay English-only while it is built; `pnpm i18n:check` counts them, and the list is empty
  again before delivery (it is now).
- No new dependency, API route or server work. CSS 80.3 KB (budget 80, rounded).

**Checks:** typecheck, lint, Prettier, translation check clean. Unit: 553 passed, 76 skipped (19 new: exact decimals,
valuation, compound interest incl. 100 years daily, token decimals, manual fee). Build passed. Browser: 286 passed,
17 skipped, 1 failed: the admin page's accessibility test on a phone ran before the streamed heading arrived (12 of 12
alone); the test now waits for the heading, and the accessibility file then passed 56 of 56. New browser tests (12,
desktop and phone): each tool's results, refusals and that nothing typed is sent; QR download name; recovery phrase refused.

## QUIC error on first load (B-031, owner report 2026-11-24)

Edge sometimes showed a QUIC error on a first load, then reloaded by itself about 2 s later. Cause: Cloudflare offered
HTTP/3 (`alt-svc: h3`), which runs over UDP; networks that block or throttle UDP (VPNs, some routers and providers)
make that connection fail, and the browser falls back to HTTP/2. The owner turned off HTTP/3 (with QUIC) in Cloudflare;
checked from outside: no `alt-svc: h3`, pages answer over HTTP/2. Browsers remember HTTP/3 for up to 24 hours, so the
error may still appear until then. Our server never used QUIC (nginx speaks HTTP/2 to Cloudflare). Right after the switch, Edge on the owner's PC
showed ERR_CONNECTION_RESET for a few minutes while the site answered normally from outside and from `curl` on the same
PC (200 in 0.5 s); it cleared by itself (Edge's leftover connections). HTTP/3 was turned back on meanwhile, so it is on
for now; plan: turn it off again at a quiet moment, fully restart Edge, and watch whether the QUIC error returns.

## Day 2026-11-25: S3 started — saved GoPlus answers, crawlers cost nothing, per-method provider rest

Unattended (owner out); nothing deployed, committed or pushed. No new screens; one new notice text (7 languages).

- **GoPlus answers saved (B-005, S3):** token answers are reused without a call for up to 1 hour and kept as a
  fallback for 24 hours (the shown time is when GoPlus answered); approval lists are reused for 5 minutes and a
  fallback list up to 24 hours old is marked partial. Kinds `goplus-token` / `goplus-approvals` in `saved_results`
  (same table, same 7-day clean-up). Test: `tests/unit/goplus-store.test.ts`.
- **Crawlers cost nothing on result pages (B-021 follow-up):** `src/lib/crawler.ts` recognises crawlers, link
  previews and scripted clients by user agent (an empty one counts as scripted). On address, approvals, activity,
  token, transaction and search pages they get a short notice and no blockchain lookups at all (`pageAccess()` in
  `page-guard.ts` replaces `pageRequestAllowed()`). Page titles for link previews still work. Real browsers
  (including the browser tests' headless Chrome) are unaffected. Tests: `tests/unit/crawler.test.ts`, one e2e test.
- **Per-method provider rest (S3):** a node that times out, answers malformed or with HTTP 5xx on one kind of
  request now rests for 60 s for that method only; cheap reads keep using it. A second method failing in the same
  minute, a connection failure or "too many requests" still rests the whole provider. Ranking, the "wake one if all
  rest" rule and the last-try rule look at the method asked. Test: `tests/unit/provider-method-rest.test.ts`.

- **Provider capability map (S3):** `pnpm providers:map` (`scripts/providers/map.mjs`, read-only, prints host names
  only) measures each provider: right chain, speed, largest batch, old-block reads (100,000 blocks back), token
  events over 1,000 blocks, wallet-wide event searches. `--candidates` also tests keyless nodes CRYPY doesn't use;
  `--md` prints a table. Run here 2026-11-25 on the public nodes (no keys in this workspace):
  - Old-block reads: only eth.drpc.org, base.drpc.org and base-rpc.publicnode.com answered; BNB Chain, Arbitrum and
    Polygon have no free public node that does (Alchemy or an extra provider needed).
  - Token events over 1,000 blocks: PublicNode on Ethereum, Base, Polygon and Arbitrum's own node; dRPC stops at 100.
  - Wallet-wide searches (alerts checker): dRPC on every chain and Arbitrum's own node; PublicNode refuses them, and
    on BNB Chain no public node CRYPY uses allows them (bsc-dataseed answers "limit exceeded").
  - Candidates: 1rpc.io answers on all 5 chains but limits event searches to 50 blocks and was rate-limited during
    the run; eth.llamarpc.com and base.llamarpc.com were down (HTTP 525), polygon-rpc.com didn't answer, bsc.drpc.org
    was rate-limited, rpc.mevblocker.io is a transaction-protection service. None is worth adding as is; the owner's
    keyed free providers (dRPC, Ankr, Chainstack, NodeReal, Infura) remain the way to add capacity. The owner can run
    `pnpm providers:map` on the server to see the keyed ones too.

**Checks:** typecheck, lint, Prettier, i18n clean. Unit: 535 passed, 76 skipped (live tests). Build passed.
Browser: 275 passed, 17 skipped, 0 failed.

## Morning 2026-11-25: B-014 faster, B-007 measured, B-015

Unattended (owner asleep); nothing deployed, committed or pushed.

- **B-014 fixed (date → block):** block headers are read in rounds of several at once (newest; block 1 and blocks
  10, 100, 1,000 … back; then the interpolated block with ±1, ±8, ±64 steps around it) instead of one after another.
  Measured here on public nodes, all 5 chains together: recent date 3.3 s → 1.3 s, old date 2.6 s → 0.55 s, same
  blocks as before. Tests: `tests/unit/block-time.test.ts` (offline: uneven block times, several blocks in one second,
  block 0 at time 0, future estimate), and the live test now checks the exact first block on all 5 chains for an old
  and a recent date.
- **B-007 measured, decision for the owner:** a 271 KB address page is 41 KB as sent (Cloudflare compresses it), the
  USDT token page 321 KB → 46 KB. About two thirds is Next.js's page data, sent a second time so the browser can take
  over the page and navigate without full reloads; that is how Next.js works. The biggest repeat is the sidebar's
  styling (~8 KB before compression), which could only shrink by adding CSS (at its budget). Recommendation: won't fix.
- **B-015:** not reproducible here (the slow part is Alchemy's history; no Alchemy key in this workspace). Repeat
  visits open at once from saved readings now; measure the first visit live.
- **Test made robust:** the S2 outage test failed once in the full run: after the drill ended, Ethereum's free public
  nodes really failed for a while under the test load, so the page rightly kept showing the saved reading. The test
  now presses "Try again" as a visitor would, for up to 90 s.

**Checks:** typecheck, lint, Prettier clean. Unit: 527 passed, 76 skipped (live tests). Live block test: 7 passed.
Build passed. Browser: 274 passed, 16 skipped, 0 failed (the earlier run: 1 failed, the outage test above).

## Overnight 2026-11-25: saved readings at once, transactions, search, B-016, B-027

Unattended work (owner asleep); nothing deployed, committed or pushed; no new screens (board 60's state 2, approved).

- **Saved readings shown at once while a slow read finishes** (B-006, B-013, B-018, B-025; board 60 state 2):
  `server/saved/fresh-or-saved.ts`. Each chain (balances, approvals, activity first page) and each token report
  starts a fresh read; when it isn't back within 2.5 s and a saved reading is young enough, the saved one is shown at
  once with a blue "… shown from 12 minutes ago · checking for changes…" notice. The read finishes in the background
  and is saved; the page reloads itself 5 s later and gets it at once (kept 1 minute for that reload). At most one
  fresh read per chain and subject runs at a time, shared by every visitor. Token reports also use a curated token's
  daily check (at most 6 h old). A token, wallet or chain nobody has looked up yet is still as slow as before: the
  live numbers after the update will tell how much this helps.
- **Transactions:** a confirmed transaction (final, or 64+ confirmations) is saved; when the chain can't be read, the
  page shows it with its age ("a confirmed transaction doesn't change: only its confirmation count and today's dollar
  values may have"). Pending transactions are never saved.
- **Search when no chain answers:** the address pages, the header search and the no-JavaScript search page now open a
  valid address's page anyway, so its saved readings show (before: "couldn't reach the networks").
- **B-016 fixed:** right after a restart, "Daily token checks" says "slow: first round still running" instead of failing.
- **B-027 cause found and fixed:** on phones every page view prefetched about 4 pages (bottom tabs); every page also
  prefetched the logo's home link, and tool, guide and gas pages their related links. The long lists suspected in the
  bug list were not the cause (checked: Next.js didn't prefetch them). These links now prefetch only on touch, hover
  or focus, so the B-029 spinner and quick opening stay. Measured here: 48 automatic prefetches over 5 page views on a
  phone before, 0 after; 19 on desktop before, 0 after.
- **Outage drill:** the test file also takes `slow:chain:address` (that read waits 4 s).
- **CSS:** the new notice first pushed the stylesheet to 80.6 KB (over the 80 KB budget); it reuses existing styles
  now: 80.3 KB.

**Checks:** typecheck, lint, Prettier and the i18n check are clean. Unit: 525 passed, 73 skipped (new: the
fresh-or-saved helper 5, slow and failed chains on the overview 2, saved transactions, the offline address page,
B-016). Build passed. Browser: 274 passed, 16 skipped, 0 failed (new: a slow chain shows "checking for changes" and the
page updates itself; no automatic prefetches on 6 main pages, desktop and phone, and hovering still prefetches).
Found while testing: a fresh reading kept for a minute even when no page waited for it hid the outage drill; it is now
kept only when a page was shown a saved reading.

## Spinner too fast with "reduce motion" on (owner report 2026-11-24)

The page-change spinner (B-029) turns once every 0.7 s. The site's "reduce motion" rule (for visitors whose device asks
for less animation) shrank every animation to 0.01 ms, so on those devices the spinner flickered instead of turning.
Now loading spinners (the page-change one and every `animate-spin` icon) keep turning, at a calm 1.5 s per turn, when
"reduce motion" is on; other animations stay off. New browser test checks the speed both ways (0.7 s and 1.5 s).
Layout and budget tests: 44 passed.

## Saved results: never an error when a good answer exists (S2, boards 60–61, approved 2026-11-24)

Owner decision: wallet results are saved in the database and deleted 7 days after the wallet was last looked up; no IP
or visitor id is stored with them.

- **Saved per chain** (`saved_results`, migration 0007): balances, activity (first page), approvals, token security
  and gas. When a fresh read of a chain fails, its last reading is shown with its age, for at most 7 days (balances,
  activity), 6 hours (approvals, token security) or 10 minutes (gas). A complete reading is never replaced by an
  incomplete one (a well-known-tokens-only list, recent-only activity) unless it is over a day old. Approvals and token
  security are saved only when every source answered.
- **One shared notice** on every tool: "Read 12 minutes ago · Refresh"; amber "Ethereum: shown from 2 hours ago …
  Try again" per chain; grey dashed "BNB Chain: not checked … this isn't 'empty'" instead of red error boxes. The total
  says "Includes Ethereum from an earlier reading." Chain cards say "From 2 hours ago", and a chain that wasn't checked
  no longer says "No coins or tokens" (that was wrong before too). Token reports: "Report from 3 hours ago … Check
  again before you buy." Revoke still reads the chain first. Gas: "From 3 min ago" on the chain card.
- **Partial answers are no longer kept for 30 minutes**: an answer with a missing or saved chain is cached for 1 second,
  so "Try again" really reads again. Full answers keep their lifetimes.
- **Portfolio:** lists chains shown from an earlier reading, and skips "since you last looked" while any chain is
  missing or saved (a missing chain used to be able to look like a loss).
- **Privacy page and Portfolio FAQ** updated in all 7 languages.
- **Outage drill:** `CRYPY_FAULT_CHAINS=polygon` on staging makes Polygon look down for every tool (S2's "Done when");
  browser tests use `CRYPY_FAULT_FILE` for one address at a time.
- **Differences from the boards:** states 1 and 2 are one line ("Read 12 minutes ago · Refresh"): the page doesn't
  update itself when a background refresh finishes; Refresh or the next visit shows it. The approvals page keeps its
  own "checked at" line instead of the new one.
- **Not covered yet:** the transaction page and search (a search failing on every chain still shows an error); the
  staging check needs the staging server (S4).

**Checks:** typecheck, lint, Prettier and the i18n check are clean. Unit: 518 passed, 73 skipped (11 new: saving,
age limits, quality rule, size cap, 7-day deletion, overview fill-in, and per tool: gas, approvals, activity, token
security). Build passed. Browser: 270 passed, 14 skipped, 0 failed. New test: a chain taken down for one address shows
the saved reading with its age, the other says "not checked" (never "empty"), and "Try again" reads them fresh. The
first full run had one failure in this new test (it counted a hidden copy of streaming text); fixed, then 5 of 5 alone
and the full run passed.

## "Scan in my browser" (S2 Part A.2, board 55; always free, owner decision 2026-11-24)

- **Choice before the scan.** "On CRYPY's servers" (recommended, private, up to 500 wallets in the page) or "In my browser" (always free, up to 10,000 wallets). Choosing the browser first shows the warning that public node services see the visitor's IP address and the wallets.
- **Same engine, run in the page** (`modules/tools/batch-balance/browser-scan.ts`, loaded only when that mode runs). It reads from each chain's keyless public nodes (`config/chains.ts`), with the same retries, splitting, waiting and cross-check as the server. The reader code moved to `lib/batch-scan/read.ts`, so server and browser share it.
  - Prices: only the token contracts go to CRYPY (`GET /api/v1/batch-prices`, cached 60 s), never the wallet list.
  - The page's CSP now allows every public node; `tests/unit/csp.test.ts` keeps the CSP and `config/chains.ts` in step.
- **Rows the public nodes can't read** (the engine stops trying after 10 minutes in the browser) get "Finish them on CRYPY's servers": a server scan of just those rows, merged into the same table.
- **Found and fixed while load-testing:**
  - The results view did work proportional to wallets × rows on every render: listing empty addresses, and sorting with a position lookup per comparison. With 10,000 wallets on 5 chains (50,000 rows) this froze the page. The scan's own timers ran late, so nodes looked slow and chunks shrank to a few wallets; after 8 minutes only 201 balances had been read.
  - Now every pass over the rows is memoized and linear (sort keys computed once), and new rows go into the table at most every 0.75 s. This also helps big server scans.
- **Load test (real Chromium, public nodes):** 10,000 wallets × 5 chains × 1 asset, complete in 34 s; nothing left unread.
  - Pasting a 10,000-line list takes about 0.2 s in the page.
  - Playwright's `fill` is the slow part for huge text, not the page, so the test sets the value as a paste would.
- **Checks:**
  - Typecheck, lint, Prettier and the i18n check are clean.
  - Unit: 507 passed, 73 skipped. New: reader error mapping, one reader per public node, the bigger list limit, the CSP covering every public node.
  - Build passed; CSS is 80.2 KB of the 80 KB budget.
  - Browser: 267 passed, 13 skipped, 0 failed. New: browser mode shows the warning, reads from public nodes and never calls the server scan.

**Owner's first browser-mode scan (2026-11-24):** 10,000 wallets × 2 chains, complete, 110 cross-checked, all matched, nothing left unread. But every price was missing, so the total showed $0.00. That couldn't be reproduced here: the price API answers, and the browser test now checks that the total isn't $0.

- Prices are now tried 3 times (waiting as the server asks) and once more when the scan ends.
- Big numbers are formatted ("10,000", not "10000").
- The tool description mentions the 10,000-wallet browser mode in all 7 languages.
- The owner checked `https://crypy.org/api/v1/batch-prices?chain=bsc&tokens=` on the live site: it answers (BNB $548, USDT $1). Most likely cause: the old page asked for prices only once and never retried. The owner will confirm with a new browser scan.
- **A missing price is never shown as $0.00** (approved 2026-11-24). If wallets hold something on a chain whose prices never arrived, the "Total value" card says "Price unavailable" (or the partial total), names the chains, and offers "Try again", which asks for those prices once more. This works in both modes. A single token without a reliable price is normal and is still marked per cell.

Checks: typecheck, lint, Prettier and the i18n check are clean; unit 507 passed, 73 skipped; build passed; browser 269 passed, 13 skipped, 0 failed. New browser test: the price service fails → "Price unavailable", never $0.00 → "Try again" loads the prices.

## Batch scanner that never shows a failed row, and loading feedback (S2 Part A, B-028, B-029; designs approved 2026-11-24, boards 55–59)

**Cause found (reproduced here):**

- The page sent one request per 100 wallets per chain: 25 for the owner's scan. Our limit is 40 a minute per visitor.
- A second scan within a minute had 10 of 25 batches refused ("too many requests"). The page gave up on any wait over 10 s, so those rows showed as failed.
- On the server, viem split every batch into 1 KB multicall pieces: about 100 node requests per batch, around 800 per scan. That made free nodes refuse too.

**Built:**

- **Scan engine** (`lib/batch-scan/engine.ts`, plain code, shared with the browser mode in Part A.2):
  - Chunks go to the healthiest node.
  - "Slow down" answers rest that node for as long as it asks.
  - Timeouts and "too big" answers split the chunk, down to single wallets, and the node's chunk size is remembered.
  - Empty or wrong answers count as failures.
  - Cells a node couldn't read are read elsewhere, up to 3 times.
  - When every node is down, the chain waits, says "stalled" after 10 minutes and gives up only after 1 hour.
  - At the end a sample (2%, at least 5 wallets) is read again by a different node at the same block. A third reading settles any disagreement and corrects the row.
  - A pruned block is read at the latest block instead, and the block range is reported.
- **Server readers** (`server/batch-scan/readers.ts`):
  - One reader per node provider; Alchemy is excluded, so its units stay with pages.
  - At most 2 scan requests at once per provider. Extra providers stop at 40% of their daily budget, so pages keep theirs.
  - One multicall request per chunk instead of 1 KB pieces.
  - A multicall whose every call failed is a failed read, not unreadable balances.
- **Scan jobs** (`server/batch-scan/jobs.ts`, `service.ts`):
  - At most `SCAN_MAX_RUNNING` (4) scans at once; up to `SCAN_MAX_QUEUED` (50) wait in line, with their place and expected start.
  - One scan per visitor at a time. `SCAN_MAX_WALLETS` (1,000) per scan, `SCAN_DAILY_WALLETS` (5,000) per visitor per UTC day.
  - Tokens are checked per chain first ("not on this chain"). Prices are read separately, with retries.
  - Results are kept 1 hour after the scan ends; an abandoned place in line is dropped after 30 minutes.
  - Lists live in memory only, never logged or written to disk.
  - The outcome of each scan goes into "What visitors got".
- **API:**
  - `POST /api/v1/batch-scans` (same-site, 10 starts a minute) answers with the scan's id, or why it can't start: busy, daily limit, too many, already running.
  - `GET /api/v1/batch-scans/{id}?since=N` (progress plus new rows) and `POST …/{id}` (pause, resume, cancel), 300 a minute.
- **Page:**
  - Before the scan: number of balances and the expected time.
  - While running (board 56/58): overall and per-chain progress with plain states ("Nodes busy, slowing down and retrying · nothing lost"), pause and cancel, and results usable at once.
  - The scan survives a refresh (sessionStorage in this tab; labels never leave the browser).
  - Finished (board 57): block ranges per chain and the cross-check result. "Checks that failed" became "Still being read". The rare-outage box has "Try these now".
  - Refusals are shown as messages, never errors; when a scan is already running, "Stop that scan" is offered.
- **Privacy page and FAQ (7 languages):** lists are held in memory while scanning and deleted within 1 hour. The outdated "2 chains" answer was corrected.
- **Not built yet:** the "In my browser" choice on board 55 is Part A.2, next. Until then the page shows only the server scan.
- **Loading feedback (B-029, board 59):**
  - The clicked sidebar item or bottom tab shows a spinner.
  - After 150 ms, a thin bar runs along the top and the page fades a little. Screen readers hear "Loading".
  - Sidebar pages are prefetched when the pointer rests on them, focus reaches them or a finger touches them. Result pages are never prefetched.
  - Measured here, tool pages answer in 10–150 ms. The 2–5 s delays on the live server most likely come from pages not being prefetched (sidebar links had prefetch off) while the server was busy (Meta's crawler, updates). Server-side fixes continue in S2 and S4.

**Load tests (this workspace, public nodes only, no API keys):**

| Test                                                                              | Result                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner's scan (500 wallets × 5 chains × 6 assets), 10 times in a row, same visitor | 10 of 10 complete, 0 unread, about 2.1 s each, every cross-check matched                                                                                     |
| 10,000 wallets on BNB Chain                                                       | complete in 25 s, 0 unread                                                                                                                                   |
| 10,000 wallets × 5 chains × 6 assets (300,000 balances), twice                    | complete in 25–32 s, 0 unread. The first try found 800 unread rows on Arbitrum (whole failed multicalls reported as unreadable); fixed, see "Server readers" |
| 100 scans at once (500 × 5 × 6 each), with pages measured meanwhile               | all 100 complete, 0 unread, the last one ended after 85 s (in line). Pages: p50 12 ms, p95 157 ms (idle: 10 / 44 ms)                                         |

This workspace has more CPU than the 1-vCPU droplet: the limits stay as set until the same tests run on the server.

**Checks:**

- Typecheck, lint, Prettier and the i18n check are clean.
- Unit: 503 passed, 73 skipped. New: engine 12 (slow down, splitting, wrong answers, unread cells, outage, stall, correction, block range, cancel, give up, pause, sample), jobs 6 (end to end, line, one at a time, daily allowance, pause/cancel, 1-hour retention), plus a live test (500 × 5 chains × 6 assets, all read, cross-checks matched).
- Build passed. CSS stays inside the 80 KB budget at 80.2 KB (a first version was at 80.5 KB and was slimmed).
- Browser: 264 passed, 12 skipped, 0 failed. Before that, a mobile run failed once on a hidden duplicate label in my new test; fixed. New tests: server scan and finding it again after a refresh, the offer to stop a running scan, and the spinner plus top bar on a slow page change.

## Cloudflare traffic check and B-010 (2026-11-24)

**Who visits.** Cloudflare showed 49k requests and 31k "visits" a day. Most are bots; real people are likely a few hundred page views a day.

- **Meta's AI crawler** (`meta-externalagent/1.1`, ASN 32934) made about 30k requests in 7 days. It opened address pages in every language, even though robots.txt disallows them.
  - The owner blocked Meta-ExternalAgent in AI Crawl Control.
  - robots.txt now also lists each language's result pages explicitly (`/en/address/`, `/zh-CN/tx/` …), besides the `/*/address/` wildcards. Test: tests/unit/robots.test.ts.
- **Googlebot** made about 10k requests a day (good).
- **The 404s** (about 1.1k a day) are scanners looking for `/.env`, `/.git/config` and `/wp-login.php`. The owner added a Cloudflare custom rule that blocks those paths at the edge.
- **DMARC** is now on with p=none (reports only). Move it to quarantine after about 2 weeks of reports.
- Bug list: B-021 to B-027 added; B-021, B-022 fixed; B-024 won't fix. Still open:
  - B-023: 502s around updates
  - B-025: 499s from slow pages
  - B-026: unexplained 403s
  - B-027: prefetch load

**B-010 fixed: a real token reported as "not a token".**

- Cause: one node answered empty code, or failed the decimals/supply read, and that single answer was final.
- Fix: before concluding "not a token", token security asks up to 3 other providers at once (`token-recheck.ts`, cooling-down providers skipped, 4 s limit). The first full answer is used. A bad node can't invent a valid answer, so any full answer is trusted.
- Real wallets and non-token contracts still return "not a token", only after the other providers agree.
- Logic in `token-basics.ts`; tests: tests/unit/token-recheck.test.ts (5).

**Planned for S3:** an app-side limit on result pages, so any future bot that ignores robots.txt costs little.

## First live numbers: audit on the server and "What visitors got" (2026-11-24)

Live audit (server, real Alchemy key and GoPlus): 52 cases, 43 ok, 9 partial, **0 findings, 0 errors** (wrong data or
crashes: none). Visitor numbers after a few hours: errors 0% on every tool (the 2 "token security" errors were the
audit's own "not a token" cases, see below); partial results: balances 16.5% (token lists cut for big wallets),
approvals 72.7% (GoPlus busy or partial), activity 35.7%, portfolio 66.7%. Findings, all in the bug list:

- **Activity lost its history on Base, Arbitrum and Polygon (B-017, fixed):** a first page sends Alchemy 4 calls per
  chain at once (sent, received, first sent, first received: 20 × 120 units); at 250 units a second the last chains
  waited over 4 s, gave up and fell back to "recent only" on most visits. Now the transfer lists go first and may wait
  up to 10 s; the first-activity calls come after them with a 1.5 s limit (a busy second costs only the first-activity
  date, never the history). New test: 5 chains at once against a stand-in Alchemy; it failed before the fix
  (Arbitrum and Polygon "recent") and passes now.
- **Updates slowed the live site (B-019, improved):** during the 9-minute build every chain check timed out, the home
  page check failed and memory fell to 5% free. The build now runs at the lowest CPU and disk priority (`nice`,
  `ionice`); the full fix is building elsewhere (S4).
- **"Not a token" counted as an error (B-020, fixed):** a missing report means the address isn't a token there, which
  the page explains; failures throw and are still counted.
- **Can show "not a token" for a real token (B-010, cause found):** one bad node answer (empty code, unreadable
  decimals) is taken as final. Next: ask another provider before concluding that.
- Slow first visits measured live: balances 29.1 s for Vitalik and 12.1 s for the test wallet (B-018, needs a timing
  log), approvals 10.8 s, token security 9.6–9.9 s (USDT, CAKE). Saved results (S2) are the main fix.
- Earlier gas and BNB Chain balance failures (B-008, B-009) haven't come back since the broken-answer fix (B-001).

**Checks:** typecheck, lint, Prettier, i18n check: clean. Unit 479 passed, 72 skipped. Build passed. Browser: first run
258 passed, 1 failed (the token page's trade test while GoPlus was at its limit; 8 of 8 alone, twice); second full run
260 passed, 0 failed.

## Stabilization S0 and S1 started (owner decision 2026-11-24)

Owner's answers: pause new features until S6; more free providers per chain; a staging droplet; the bug list in a
Sheet ("CRYPY — Bug list", 16 entries so far). Plan: DEVELOPMENT_ROADMAP.md "Stabilization".

**S0 — See every failure (built):**

- Every visitor request to a tool is classified and counted: **full**, **partial** (something missing and the page says
  so: a chain unavailable, a cut or well-known-only token list, prices missing, GoPlus unavailable, activity limited to
  recent transfers, approvals' recent-event search skipped) or **error**, with time taken. Rules: `lib/outcomes/classify.ts`
  (pure). Search, balances, approvals, activity, token security, transactions, gas, batch balances, portfolio,
  timestamp & block and token info, on their pages and APIs (`observe` in `server/outcomes/record.ts`). The answer is
  passed on unchanged; counting never breaks a page.
- Every error that reaches Next.js while serving a visitor is counted too (`onRequestError` in `instrumentation.ts`),
  as "Server errors" with the tool it belongs to.
- Counts only: per tool and 5-minute bucket (full, partial, errors, slow ≥ 3 s, total time, the 12 most frequent
  reason codes). Reasons are cleaned of addresses, hashes, URLs, long numbers and keys. Saved every minute in
  `visitor_outcomes` (migration `0006_visitor_outcomes`), counts added so several processes can save; kept 90 days.
  CRYPY's own background work isn't counted.
- **/admin → "What visitors got (last 24 hours)":** per tool the requests, full / partial / error shares, slow
  requests, average time, the 7-day error share and the most frequent reasons.
- **Telegram to the owner** when a tool fails for visitors (over 2% of requests in 10 minutes, at least 3 errors), and
  once when it works again.

**S1 — Audit (tool built, first run):** `scripts/audit/run.mjs` runs 51 cases through every tool's API on all 5
chains: normal, empty and tricky inputs (wrong checksum, spaces, unknown hash, a contract or a wallet as a token),
paging, and consistency checks (fee = gas used × price + L1 fee; gas speeds in order; balances equal to a direct
read from a public node at the same block; activity only involves the wallet, newest first, no repeats on page 2;
totals add up; never a "safe" verdict). It waits when CRYPY asks it to slow down, and writes `audit-report.md`.

- First run here (no Alchemy key, no GoPlus access in this workspace): 51 cases, 0 findings, 0 errors, 12 partial
  (all explained by the missing key and GoPlus). Slow first visits recorded as bugs: token security 9–10 s (USDT,
  CAKE), approvals 4.7 s, activity 3.8 s, date → block 3.3 s.
- Found while building it: the outcome rules first counted "recent events not searched" on chains where the wallet
  holds no token (nothing to search); fixed before release (the page itself never showed that warning).
- **Next:** the owner runs the audit on the server (real Alchemy key and GoPlus), which gives the real picture; a
  week of S0 numbers; then S2 (saved results) and S3 (sources).

**Checks (2026-11-24):** typecheck, lint, Prettier, i18n check: clean. Unit: 478 passed, 72 skipped (9 new: every
classifier, reason cleaning, route mapping, counting with a throwing classifier, the reason cap, saving twice into the
same bucket with the real migration, the alert rule). Build passed. Browser: 260 passed, 12 skipped, 0 failed, plus the
admin test now expecting the new section (10 of 10). A live run with the worker on saved without errors.

## Faster updates without downtime (owner report 2026-11-24: "each update takes 5–10 minutes")

The owner's server log: compile 67 s, TypeScript check 82 s, 1,548 pages generated in 3.8 min on the 1-CPU droplet.
And `update.sh` built inside the live site's own `.next`, which `next build` empties first: for those minutes visitors
could get errors or pages without styles, and the build competed with the site for memory.

- **No downtime:** the new version is built into the folder that isn't live (`.next-a` / `.next-b`), then
  `.crypy-dist` names it and the app restarts (a few seconds). `next.config.ts` reads the build folder from
  `CRYPY_DIST_DIR` (while building) or `.crypy-dist` (at start); anywhere else it stays `.next`. If the new version
  doesn't answer within a minute, the previous folder is put back automatically; a failed build never touches the
  live site.
- **Static files of recent versions side by side** in `.static` (nginx serves from there): a page already open in a
  browser keeps finding its files after the switch. Files unused for 30 days are removed.
- **Only the languages people can choose are built in advance** (`builtLocales`: complete + Beta). The 5 hidden ones
  (Urdu, Arabic, Hindi, French, German) still answer when their address is opened, rendered on request. 928 pages
  instead of 1,548 (−40%).
- **No second type check on the server** (`CRYPY_SKIP_TYPECHECK=1`, set only by `update.sh`): it already ran before
  the push.
- `update.sh` now runs the freshly pulled copy of itself (a script rewritten by `git pull` while bash reads it could
  misbehave), and prints how long the update took.
- `tsconfig.json` lists the type folders of both build folders, so Next.js never edits it on the server (an edited
  tracked file would stop the next `git pull`).
- Expected on the droplet: about 3–4 minutes per update (compile about 1 min, pages about 2.3 min), with the site
  up the whole time except the restart. The next step (stabilization S4): build on GitHub Actions (free for a public
  repository), so the server only downloads and switches, in under a minute.

- **First run on the server (owner, 2026-11-24):** the build into `.next-a` succeeded, then the script stopped at the
  static-file copy: `find`, run as the `crypy` user from root's home folder, couldn't return to it ("Failed to restore
  initial working directory: /root: Permission denied"). Nothing was switched; the site kept running the previous
  version. Fixed: the script works from the app folder. Re-tested with a real second user starting in `/root`.
- That run compiled in 3.5 min instead of 67 s: a new build folder has no build cache. Measured here: a folder's own
  cache cuts compiling from 34 s to 2.3 s; a cache copied from another folder doesn't help (40 s). So the first build
  into each of `.next-a` and `.next-b` is slow once; after that each reuses its own.

**Checks (2026-11-24):** typecheck, lint, Prettier, i18n check: clean. Unit 469 passed, 72 skipped. Builds into
`.next-a`, `.next-b` and `.next` passed, `tsconfig.json` unchanged by them. Browser: 260 passed, 12 skipped, 0 failed,
with the site served from `.next-a` through `.crypy-dist`; hidden languages answered on request (0.1–0.7 s the first
time). `update.sh` run with stand-ins for git, pnpm, systemd and curl: first switch from `.next`, second switch
(old `.next` removed), a new version that doesn't answer (rolled back), a failed build (live site untouched), a normal
update after that. ShellCheck clean.

## Admin dashboard findings fixed (owner report 2026-11-24)

The owner's /admin showed: Alchemy at 1,000,010 of 1,000,000 units for the day, "Wallet activity (Ethereum)" down
16 times ("no transfers for a wallet that has them"), "Cannot convert undefined to a BigInt" on the BNB Chain, Base,
Arbitrum and Polygon connections, the alerts checker, approvals, token security, transaction lookup and gas, and
memory down to 5% free once.

- **"Cannot convert undefined to a BigInt" (fixed):** a free provider sometimes answers a batched request with its id
  only, no result and no error (seen under load). viem passes `undefined` on as the result and reading the block number
  fails. Reproduced with a fake node: exactly this error. Now such an answer counts as a provider failure: the next
  provider is asked, the faulty one rests a minute, and the server log names it once per 10 minutes (host only).
  Two regression tests (they fail without the fix).
- **Alchemy daily budget (tiers):** ordinary reads that other providers can also answer went to Alchemy whenever it was
  fastest, and background work spent from the same budget, so by evening nothing was left for what only Alchemy does
  (full token lists, transfer history, old blocks). Now: ordinary reads use Alchemy only for the first 30% of the
  day's units; background work (alerts worker, health checks, daily token checks, the lock index at start) stops at
  50%; the rest is kept for visitors' Alchemy-only requests. Each tier falls back as before. Background is marked with
  AsyncLocalStorage (`server/background.ts`); health checks of tools run with visitors' rules, since they measure what
  a visitor gets. /admin now shows Alchemy units by background vs visitors, the tier limits and the largest methods
  today, so the next report shows exactly where the units go. 3 unit tests.
- **Wallet activity check:** when full history isn't available it now says why: "full history paused until 00:00 UTC
  (Alchemy daily budget used); recent activity only" (shown as having problems, not down), or that it didn't load.
- **Memory:** the app used 620–770 MB here under load with the worker running; with Alchemy's full token lists and
  the lock indexes it is higher on the server. 26% free on the 2 GB droplet is expected; the 5% dip most likely came
  from `update.sh` building while the site runs (the build needs about 1–1.5 GB; 2 GB swap covers it). No setting
  changed; stabilization S4 (worker split, build headroom) addresses it.
- **Alchemy limit follows the month (owner's Alchemy dashboard, 2026-11-24):** Alchemy showed 3.5M of 30M units used
  this month while CRYPY stopped at a fixed 1M a day, and every restart reset the count. Now the counters are saved
  every minute (new table `provider_usage`, migration `0005_provider_usage`) and added back after a restart, and
  today's Alchemy limit = (90% of the monthly plan − units spent earlier this month) ÷ days left, at most 2× a
  normal day (2M in a 30-day month). The 10% margin covers the same key used on the owner's PC, which the server
  can't see. `ALCHEMY_MONTHLY_CU` (default 30M) is new; `ALCHEMY_DAILY_CU`, when set, still fixes the day. The tiers
  above apply to today's limit. /admin explains the day's limit and the units spent earlier this month. For the rest
  of November the server knows only what it saves from now on, so it uses at most 2M a day: with the 3.5M already
  spent, the month stays under 18M of 30M. 5 unit tests (month lengths, spreading, cap, unknown history, save and
  reload with the real migration).
- Browser tests that counted a streaming page's hidden copy (known issue) now count visible text only, and the robots
  tag check accepts the brief repeat (same content).

**Checks (2026-11-24, final):** typecheck, lint, Prettier, i18n check: clean. Unit: 469 passed, 72 skipped (10 new
in total). Build passed. Browser: 259 passed, 12 skipped, 1 failed (the robots-tag repeat above, fixed; its file then
passed 10 of 10 three times).

## Languages wave 1 — six Beta languages (owner decision 2026-11-23)

Owner decision: instead of Urdu and Arabic first, start with the biggest crypto markets. Wave 1 = **Spanish,
Portuguese (Brazil), Chinese (Simplified), Russian, Turkish and Vietnamese**, released as **Beta** (selectable, marked
"Beta translation", hidden from search engines) until a native speaker reviews each one. Urdu and Arabic stay hidden for
later; their right-to-left support stays in place.

**Built:**

- Every website text translated in all six languages (about 2,700 strings each: tools, entity pages, transaction
  story, token security, approvals, portfolio, watchlist, status page, legal pages, errors). The admin dashboard stays
  English only (owner-facing).
- All 12 Learn guides translated in each language (`src/content/learn/<locale>/`). Section ids, link targets, list
  lengths and bold marks match English; every search title is 60 characters or less and every description 160 or less.
- Russian uses its full plural forms (one / few / many / other). Number formats follow each language in prose (for
  example 1.024 in Portuguese and Turkish, 1 024 in Russian); input fields still use a dot for decimals, and the hint
  says so.
- Legal pages: the Beta notice adds "if this translation differs from the English text, the English version applies".
- Locale status: `beta` = in the language menu and footer, `noindex`, notice under the header, not in the sitemap or
  hreflang, not auto-detected. `planned` = hidden. Missing keys fall back to English.
- Fonts: Inter's Cyrillic and Vietnamese files are self-hosted with the rest; headings switch to Inter for Russian
  (Space Grotesk has no Cyrillic). Chinese uses the system's Chinese fonts.
- Checks: `scripts/check-translations.ts` now fails if a Beta language misses any key (except `admin`), or if a
  translation changes a placeholder, plural/select shape, rich-text tag or list length.
- New browser test `tests/e2e/languages.spec.ts`: for each Beta language, the home page and a guide are translated,
  the Beta notice shows, the page is `noindex`, the language is not in the sitemap, and the footer links to it.

### Languages wave 1 checks (2026-11-23, in the cloud workspace)

| Check                                                             | Result                        |
| ----------------------------------------------------------------- | ----------------------------- |
| Translation check (`pnpm i18n:check`)                             | ✅ Passed                     |
| Type check, lint, Prettier                                        | ✅ Passed                     |
| Unit tests (`pnpm test`)                                          | ✅ 460 passed, 72 skipped     |
| Production build                                                  | ✅ Passed                     |
| Browser tests (`pnpm test:e2e`, desktop and mobile)               | ✅ 260 passed, 12 skipped     |
| Language tests (6 languages × 2 tests × 2 screen sizes)           | ✅ 26 passed (included above) |
| Visual check: home desktop and phone, a guide, for every language | ✅ Looked correct             |

**Still to do (owner):** a native speaker reviews each language; when one is approved, its status changes from `beta`
to `complete` (it then appears in search engines with hreflang and is offered automatically to matching browsers).

## M9 Part 5 — Monitoring: health checks, status page, admin dashboard (owner request 2026-11-23)

**Built (no screens yet): the health-check engine.**

- Every 5 minutes the server runs small real checks and saves each result (pass / slow / fail / skipped, time taken,
  a short private reason) in the new `health_checks` table, kept 90 days:
  - website (its own home page), each of the 5 chains (newest block, and that it keeps moving), database, the alerts
    checker and delivery jobs (heartbeats), the Telegram bot, freshness of the daily token checks, server memory and
    disk, and the origin certificate (every 6 hours);
  - real tool runs with fixed public test data (a well-known wallet, transactions and USDT): search, balances,
    transaction lookup, token security (GoPlus at background priority), approvals, activity, gas and block-at-time.
    About every 30 minutes each, at most 2 per round, alternating Ethereum and BNB Chain, to stay well inside the free
    plans.
- Rules (pure, unit-tested): one failure or a slow run = "having problems"; two failures in a row = "down"; no result
  for 3 intervals = "not checked" (nothing claimed); skipped checks (not set up on that server) are never shown as
  problems. The public summary has states and 90-day bars only, never reasons, timings or provider names.
- `CRYPY_WORKER_SKIP=health` turns it off (browser tests do). No new settings, keys or dependencies.

**Status page and admin dashboard (designs approved 2026-11-23, boards 51–54), built:**

- **`/status` (public, in the sitemap, footer link "Status"):** headline (working / some problems / major problem / not
  checked yet; "everything checked so far passed" while some parts are still waiting for their first check), last
  check time, updates written by the owner (ongoing and planned first, fixed ones for 90 days), and every component
  with its state and 90 daily bars (30 on phones): website and search, the 14 tools (linked), the 5 chains, wallet
  alerts and the daily token checks; then "Features: live and coming" and how the checks work. States, bars and the
  owner's updates only: no reasons, timings, provider names or server details.
- **`/admin` (private: `noindex`, disallowed in robots.txt, not in the sitemap):** the usual wallet sign-in, then
  only wallets listed in `ADMIN_WALLETS` on the server see anything. Others get "This wallet isn't an admin". Shows:
  right now / last 24 hours / Alchemy free plan / Telegram tiles; every check with state, time taken, when and reason
  (filters: problems, website, chains, tools, alerts, data, server); free-plan use today per provider, GoPlus calls
  sent and held back, requests refused by the rate limit; server (disk, memory, certificate, database size, uptime,
  backup schedule); failed checks of the last 24 hours grouped by reason; and the form to publish a status update and
  mark it fixed. Publishing uses `POST /api/v1/admin/status-updates` and `PATCH …/{id}` (same-site, rate-limited,
  admin only, plain text only, length limits, invisible characters removed).
- **Telegram to the owner:** when a check fails for the second time in a row, one message with the reason; one more
  when it passes again ("Fixed … after N minutes"). Sent only to the Telegram chats linked to admin wallets (link
  Telegram on the Watchlist page while signed in with that wallet). Never asks to connect or sign anything.
- **New:** table `status_updates` (migration `0004_status_updates`); `ADMIN_WALLETS` setting (public addresses,
  comma-separated; empty = nobody); daily counters for GoPlus and the rate limit.
- **Differences from the boards:** the admin page sits inside the normal site layout (header and sidebar) instead of
  its own header; Health / Providers / Status updates are jump links to sections of one page; the backup row shows
  the schedule, because the backup folder isn't readable by the app; "Recent errors" lists failed health checks
  (other server errors aren't saved).

**Checks (2026-11-23, health checks):** typecheck, lint, Prettier: clean. Unit: 376 passed (13 new). Build: passed.
Browser: 216 passed, 12 skipped, 0 failed (one earlier full run had 1 intermittent failure in an existing SEO test,
see Known issues).

**Checks (2026-11-23, status page and admin):** typecheck, lint, Prettier, i18n check: clean. Unit: 385 passed, 72
skipped (9 new: owner messages once per problem and once when fixed, escaping and key removal, admin list, update
validation, which updates show, counters, sorting and grouping). Build passed. Browser: 234 passed, 12 skipped, 0
failed (new: status page and sitemap, admin signed out, APIs refuse visitors and other sites, a non-admin wallet sees
nothing, admin dashboard and filters, a published update appears on /status and is marked fixed; accessibility on
both pages). Screenshots checked on desktop and phone with real health results. Live run on the built site: website, all 5 chains, search, balances, jobs and database passed on real data;
bot, token checks and certificate skipped as expected (not set up there).

**Owner:** add `ADMIN_WALLETS=<your wallet address>` to the server's `.env.local`, then run `update.sh`; link
Telegram on the Watchlist page with that wallet to get the messages. External uptime monitor: done by the owner.

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

## SEO Phase 3 — Gas by chain and daily token checks (design approved 2026-11-22, boards 46–50)

Owner decision: about 10 tokens per chain chosen by CRYPY (50 in total); nobody can pay to be listed.

- **Gas by chain** (`/gas/ethereum`, `/gas/bnb-chain`, `/gas/base`, `/gas/arbitrum`, `/gas/polygon`): the Gas
  Tracker's live card for that chain only (same numbers, refreshed every 12 seconds), a short explanation written for
  each chain (Ethereum's burned base fee; BNB Chain without a base fee; Base's Ethereum data fee; Arbitrum's data
  cost inside the gas and first-come ordering; Polygon's gwei vs dollars), three questions per chain with FAQ
  structured data, links to the other chains, the Gas Tracker and the gas guide. The Gas Tracker links to each
  chain's page.
- **Curated token list** (`config/seo-pages.ts`): each chain's 10 well-known tokens, the same contracts its
  `commonTokens` already lists (checked on-chain by the live tests; a unit test makes sure nothing else gets in).
- **Daily checks:** a new table `token_checks` (migration `0002_token_checks`) holds CRYPY's own security report per
  token with its time. The background worker checks the never-checked tokens first and then the oldest ones, 4
  every 10 minutes, at background priority for GoPlus, so all 50 are checked about once a day without bursts (a fresh
  server has them all within about 2 hours). Pages and the sitemap only read what is saved; a visitor or a crawler
  never starts a check.
- **Token checks list** (`/tokens`): every curated token by chain with its result, whether the test trade could sell
  it, the measured buy and sell tax and the check time; jump links per chain; a box to check any token. Linked from
  the Token Security Scanner and the footer.
- **One token's check** (`/tokens/<chain>/<token>`, e.g. `/tokens/ethereum/usdc`): name, chain, contract with copy,
  the check time and "Run a fresh check" (the live token page), then the full report exactly as on the live token
  page (the view is now shared: `TokenSecurityReportView`), "About this check" (not an audit, owners can change
  settings), three questions answered from the saved report ("Can I sell…", "…buy or sell tax", "Is … safe?" — never
  yes), learn links and other checked tokens. Before the first check is saved, the page says so, links to a live
  check and is `noindex`.
- **Sitemap:** now built per request: the 5 gas pages and `/tokens` always, and each token page only once its first
  check is saved, with that check's date.
- **404s:** unknown gas chains and tokens outside the list answer 404 (`/tokens/bsc/cake` too: links use
  `bnb-chain`).
- Differences from the boards: the gas page reuses the Gas Tracker's own card (same layout as the tracker) instead of a
  separate design; the token page shows the full report as on the live token page instead of a shorter summary; chain
  filters on the list are jump links (no browser code).
- Checked with real data here: USDC (Ethereum) "Risks found" (blacklist, mint, upgradeable proxy), CAKE (BNB Chain)
  "Some warnings", PEPE "No major risks found in these checks", each saved and shown with its time.
- Checks here: typecheck, lint, Prettier, i18n check; unit 363 passed, 72 skipped (8 new: list rules, check order,
  summaries, save and read with the real migration, a worker round with a failing token); build passed; browser 216 passed,
  12 skipped, 0 failed (new: gas page for one chain staying one chain after the refresh, Gas Tracker links, the list
  of 50, a token waiting for its first check (noindex, live-check link), 404s and the sitemap; accessibility on the
  gas and token-checks pages).

## SEO Phase 2 — Learn hub (design approved 2026-11-22, boards 42–45)

- **12 guides** (`src/content/learn/en/<slug>.json`, one structured file per guide and language; English is the
  source and the fallback): checking a token for scams, honeypots, liquidity locks, token approvals and revoking,
  unlimited approvals, address poisoning, seed phrase safety, failed transactions, reading a transaction, gas fees,
  wei/gwei/ether and checksum addresses. 300–680 words each (2–3 minutes), written to match what each CRYPY tool
  really does, including its limits; never a "safe" claim. Inline text allows only **bold** and links to CRYPY tools
  and guides, rendered as React elements (no HTML).
- **Pages:** `/learn` (title and intro, "Start here" guide, a quick-check search box, all guides with topic
  filters) and `/learn/<slug>` (topic, title, lead, byline with update date and reading time, "In short", sections,
  approvals diagram, warnings and tips, questions, a call to action for the guide's tool, related guides; "On this
  page" beside the article on desktop and folded on phones). Every guide is in the server-rendered HTML; the topic
  filter only changes what shows.
- **Structured data:** Article (dates, author and publisher CRYPY, image), BreadcrumbList and FAQPage on each guide;
  CollectionPage + ItemList on the hub. Each guide has its own preview image.
- **Links both ways:** each tool page now ends with "Learn more" (its guides) and "Related tools" (three next steps,
  `config/related-tools.ts`); guides link to their tool in the text, in the side box and at the end.
- **Navigation:** "Learn" in the desktop sidebar (under Home), the tablet header and the footer; on phones the bottom
  tabs are Home, Tools, Learn, Portfolio, Alerts (Settings moved to the footer link, as in board 44).
- **SEO:** the hub and the 12 guides are in the sitemap (guides with their real update date) and checked by the
  automated SEO test; unknown guide addresses answer 404; a guide opened in a language it isn't translated into shows
  the English text with a notice and is `noindex`.
- Differences from the boards: the side box on a guide links to the tool instead of holding an address box (one
  tool page per job, no duplicate forms); reading times are measured from the text (2–3 minutes).
- Found while testing: the hub's search box and the header's had the same accessible name; the hub's now has its own.
- Checks here: typecheck, lint, Prettier, i18n check; unit 355 passed, 72 skipped (29 new content checks: search
  title and description lengths, every link points to a real tool or guide, related guides, section anchors, no raw
  HTML, English fallback, reading time); build passed; browser 198 passed, 12 skipped, 0 failed (new: hub and
  topic filter, guide page and its "On this page" links, structured data, tool-page links, Learn in the navigation,
  404 and English fallback; accessibility on the hub and a guide in both themes; SEO checks on all 13 new pages).

## SEO Phase 1 — Technical and on-page (owner request 2026-11-22)

Owner request: "very good SEO for the whole website", first. Full plan in **SEO_ROADMAP.md** (6 phases, based on an
audit of the live site's 20 sitemap pages). Phase 1, built:

- **Search titles and descriptions** (`tools.<id>.seoTitle` / `seoDescription`, `seo.*`): each tool page, the home
  page and the all-tools page now have a title of 42–57 characters with the words people search for (for example
  "Token Approval Checker: Find & Revoke Approvals | CRYPY", "Gas Tracker: Live Gwei Prices on 5 Chains | CRYPY")
  and a description of 123–153 characters. The names on the pages are unchanged.
- **Content on the four thin tool pages:** how-to steps and 5–6 FAQ answers for the Approval Checker, Address
  Analyzer, Gas Tracker and Timestamp & Block Converter, in the existing layout (so FAQ structured data too). Every
  answer follows what the tool really does, including what may be missing.
- **All-tools page:** CollectionPage + ItemList structured data (14 tools).
- **Icons:** `favicon.ico` (16/32/48 px), Apple touch icon (180 px), web manifest with 192/512 px and maskable
  icons; the Organization structured data now uses a 512 px PNG logo.
- **Real 404s:** unknown tool addresses answered 200 (a "soft 404"); now 404. Every unknown address under a language
  also showed the framework's bare 404 page; it now shows CRYPY's own page (header, navigation, link home) with a
  404 status. `/EN/...` redirects once to `/en/...`.
- **Sitemap:** Settings removed and marked `noindex` (19 pages).
- **IndexNow:** a key file in `public/` and `scripts/server/indexnow.sh`, run by `update.sh` after each update:
  tells Bing, Yandex and other IndexNow engines about the sitemap's pages (skipped while the site is in preview).
- **Automated SEO checks** (`tests/e2e/seo.spec.ts`): every sitemap page answers 200 with a 15–60 character title,
  a 110–160 character description (legal pages 70+), exactly one H1, a canonical link to itself, no `noindex`,
  valid structured data and no duplicate titles; unknown tools answer 404; Settings is `noindex`; icons, manifest and
  the IndexNow key are served.
- **Owner steps:** Google Search Console (domain property, TXT record in Cloudflare, submit `sitemap.xml`), Bing
  Webmaster Tools (import from Google), Cloudflare Web Analytics off.
- Checks here: typecheck, lint, Prettier, i18n check; unit 326 passed, 72 skipped; build passed; browser 178
  passed, 12 skipped (desktop-only and live-key tests), 0 failed, including the 3 new SEO tests. `indexnow.sh`
  passes ShellCheck; it runs for real on the server after the next update.

## M9 Part 4 — Public beta (owner request 2026-11-22)

The owner asked to open the site to everyone and to search engines now, as a beta.

- **Search engines:** the preview switch (`CRYPY_PREVIEW=1`) is removed on the server; robots.txt then allows the site
  (result pages and the API stay blocked) and lists the sitemap: home, all tools, the 14 tool pages, settings and the
  3 legal pages, English only (Urdu and Arabic stay `noindex` until reviewed). Every page already had its own title,
  description, canonical link, preview image and structured data (checked on the live site).
- **Beta label** next to the logo ("CRYPY is in beta…" on hover). On phones narrower than 390 px it sits under the
  name, so the header stays on one row (checked at 360–1280 px).
- **English texts for five chains:** the site description and eight texts (search progress, FAQs, features, the wallet
  notice) still said "Ethereum and BNB Chain"; they now name Ethereum, BNB Chain, Base, Arbitrum and Polygon.
- **Legal pages rewritten** to describe what CRYPY really does: no seed phrases or keys; lookups go to providers from
  the server, not the visitor's browser; what stays in the browser; the three cookies (plus Cloudflare's security
  cookie); wallet connection and sign-in; what an account stores; Telegram and 90-day alert history; download and
  delete; 14-day backups; server logs about two weeks; no selling of data. Terms and risk updated for the beta. Each
  legal page now has its own description. The notice says they haven't been reviewed by a lawyer yet.
- **Still open:** lawyer review and a contact address on the legal pages; the owner adds crypy.org to Google Search
  Console and Bing Webmaster Tools and submits the sitemap.
- Checks here: typecheck, lint, Prettier, i18n check; unit 326 passed, 72 skipped; build passed; browser (layout,
  accessibility, foundation, utilities) 84 passed, 6 skipped (desktop-only tests on the phone profile).

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
  First run of the script closed the web ports to everyone (a `grep` with no match stopped it under `set -e` before the
  Cloudflare rules were added, so the site showed error 522 for a few minutes). Fixed: the search can't stop the script,
  and if no Cloudflare rule ends up added it reopens the ports itself. On the server, git must run as `crypy`
  (`sudo -u crypy git -C /opt/crypy/app pull --ff-only`), as `update.sh` does. **Verified 2026-11-22:** site works
  through Cloudflare; `ufw` holds the Cloudflare rules; `http://159.89.155.81` no longer answers (owner checked);
  Bot Fight Mode and the `/api/` rate-limiting rule are on.
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

- **Intermittent (seen once, 2026-11-23):** on the phone-size browser test, a pending token-check page once had its
  `noindex, follow` robots tag twice (same content, harmless for search engines); 6 repeat runs and a second full
  run passed. Cause found while building the status page: while a page streams, Next.js keeps a hidden copy of the incoming part
  for a moment before moving it into place; a test that counts elements at that instant sees two. Visitors and
  search engines see one. Tests now look inside the visible main area.

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
