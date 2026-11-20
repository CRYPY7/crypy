# CRYPY — Progress

Last updated: 2026-11-20

## Milestones

| Milestone                                              | Status                                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| M0 Setup and design approval                           | ✅ Done                                                 |
| M1 Foundation                                          | ✅ Done (2026-11-19)                                    |
| M2 Multi-chain core, search routing, wallet connection | ✅ Done (2026-11-20)                                    |
| M2.5 Free utilities                                    | ✅ Done (2026-11-20)                                    |
| M3 Address overview (Balance Scanner)                  | ✅ Built (2026-11-20); owner check with Alchemy pending |
| Desktop sidebar layout, chain icons, recently viewed   | ✅ Done (2026-11-20, design approved)                   |
| M4 Transaction page                                    | ✅ Done (2026-11-20)                                    |
| M4.5 Batch Balance Scanner                             | ⏭ Next (design approved 2026-11-20)                     |
| M5.5 Token Market & Charts (own on-chain data)         | Planned (approved 2026-11-20)                           |
| M3–M9                                                  | Planned (see DEVELOPMENT_ROADMAP.md)                    |

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

## Moved to later milestones

- **M2 (done):** connect button, search routing, checksum validation, providers and API.
- **M3:** balances and USD values on the address page (the price client is ready).
- **M9:** reviewed Urdu and Arabic fonts and translations.

## Known issues

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
