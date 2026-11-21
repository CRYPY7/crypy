# CRYPY — Development Roadmap (V1)

Status: **Approved** — Nov 2026 (rev. 6). **M0–M2.5 done; M3–M6 built (M6 on 2026-11-21).** Every milestone ends with typecheck, lint, tests and build actually run, PROGRESS.md updated, owner review.

## M0 — Setup (owner) + design approval

- [x] Node.js LTS, pnpm 12, Git, VS Code installed
- [x] Alchemy, Reown Cloud (WalletConnect) and GitHub accounts created
- [x] Name and domain chosen: **CRYPY**, **crypy.org**
- [x] Design mockup created and revised for usability (all-tools menu, goal tiles, mobile tab bar)
- [x] **Owner approved design** (2026-11-19)
- Note: owner's PC has hardware virtualization disabled, so Claude builds and verifies in the cloud workspace and copies files into the local project folder.

## M1 — Foundation ✅ (2026-11-19)

Next.js + TS strict + Tailwind v4 + shadcn/ui; tooling; design system from approved mockup; app shell (header with search, All tools menu, Ctrl+K palette, language selector, theme toggle, connect button; mobile bottom tab bar); full i18n architecture (10 locales registered, en complete); tool registry + home (goal tiles, all tools) + tools pages; legal page shells; security headers; env validation; docs.
**Done when:** runs locally, responsive, dark/light, RTL verified in dev, checks pass. → Met; see PROGRESS.md for details and what moved to M2 (connect button, search routing, checksum validation).

## Cross-cutting tracks (added 2026-11-19)

### SEO track (every milestone)

- **Done in M1:** static pages, language URLs (`/en/…`), canonical + hreflang, sitemap.xml, robots.txt, per-page titles/descriptions, fast Core Web Vitals, unreviewed languages `noindex`.
- **M2:** JSON-LD structured data (Organization, WebSite + SearchAction, BreadcrumbList, WebApplication per tool); static Open Graph images per page (generated at build time); `/address/*` and `/tx/*` result pages `noindex` (infinite, privacy-sensitive, cost API calls); bot rate limits so crawlers can't burn API quota.
- **M2.5 (free utilities):** first organic-traffic magnets (unit converter etc.), each with a how-to and FAQ section + FAQPage schema.
- **M5.5:** Market tab content shares the token page rules below (curated tokens indexable only).
- **M5:** token security pages indexable only for tokens in a curated/top-searched list (sitemap), cached; all others `noindex`.
- **M7–M9: Learn hub** — short, original guides that answer real searches ("how to revoke token approvals", "what is a honeypot token", "check if a BEP-20 token is a scam"), linked to the matching tool; published in English, then Urdu and Arabic (low-competition languages).
- **M9 launch:** Google Search Console + Bing Webmaster Tools (free), IndexNow, sitemap submission, Lighthouse ≥ 90 on mobile.
- **Ongoing:** monthly check of search queries, broken links and Core Web Vitals; never thin or auto-generated spam pages.

### Zero-API-cost track (owner rule, 2026-11-20)

- **Rule:** CRYPY never pays for APIs or data services. The only paid items are the domain and servers (hosting / VPS, and later dedicated servers for our own nodes).
- Every external source must be free and have a free fallback; the site keeps working in a reduced mode when a free limit is reached.
- **Blockchain reads:** several free node providers in order (Alchemy, dRPC, Ankr, Chainstack, Infura free plans…), then free public nodes; daily budgets per provider so no free plan runs out; caching.
- **Free node providers (owner signs up; endpoint URLs go in `.env.local`):**

  | Provider   | Sign-up                        | Put in                                       | Notes                                           |
  | ---------- | ------------------------------ | -------------------------------------------- | ----------------------------------------------- |
  | Alchemy    | alchemy.com                    | `ALCHEMY_API_KEY`                            | Done. Also gives the full token list.           |
  | dRPC       | drpc.org                       | `ETH_RPC_URLS`, `BSC_RPC_URLS`               | Free plan, many chains.                         |
  | Ankr       | ankr.com (Web3 API / RPC)      | `ETH_RPC_URLS`, `BSC_RPC_URLS`               | Freemium credits per month.                     |
  | Chainstack | chainstack.com                 | `ETH_RPC_URLS`, `BSC_RPC_URLS`               | One endpoint per chain ("node") in the console. |
  | NodeReal   | nodereal.io                    | `BSC_RPC_URLS` (and `ETH_RPC_URLS`)          | BNB Chain specialist.                           |
  | Infura     | infura.io (MetaMask Developer) | `ETH_RPC_URLS` (+ `BSC_RPC_URLS` if offered) | Daily credit allowance.                         |

  Free limits change: check each dashboard. After adding URLs, run `pnpm env:check` (tests each URL, shows host names only).

- **Prices:** our own on-chain price engine from DEX pools (PancakeSwap, Uniswap), not a price API.
- **Security data (M5):** our own on-chain checks first; free external sources only where their terms allow commercial use.
- **At launch (M9):** one VPS runs the site, PostgreSQL, Redis and the indexer (no paid cloud database or cache).
- **Later, by traffic:** our own BNB Chain and Ethereum nodes on a dedicated server, removing API limits entirely.
- Cost guards stay: caching, static pages, browser-side utilities, per-IP and bot rate limits, `noindex` on infinite result pages.
- Revenue Phase A (no smart contracts) launches first so earnings can fund contract audits and servers.

### Smart contract track (C0–C6, runs alongside M6–M9; mainnet only after audit)

- **C0 — Setup:** `contracts/` folder in the same repo; Foundry; OpenZeppelin Contracts v5; Slither + Aderyn static analysis; CI; Sepolia + BSC Testnet.
- **C1 — Shared fee module:** fee settings per tool and chain, fee added on top and sent to the multi-sig treasury in the same transaction, signed plan-holder discount passes (EIP-712, short expiry, single use), fee changes behind a timelock.
- **C2 — Multisender:** native coin and ERC-20/BEP-20 batch transfers; batch size limits; no custody between transactions.
- **C3 — Airdrop claim:** Merkle-proof claim contracts deployed as cheap clones (EIP-1167); unclaimed tokens returnable to the project after a deadline.
- **C4 — Token and liquidity lock + vesting:** time locks and linear vesting; no owner withdrawal before unlock; most security-critical, audited first and deepest.
- **C5 — Safe token factory:** standard ERC-20 template only (fixed supply or capped mint, optional burn, one-click ownership renounce; no tax, blacklist, pause or hidden mint); auto-verified source.
- **C6 — Audit and launch:** internal review → independent external audit → fixes → bug bounty → mainnet with usage caps → caps raised gradually.
- **No contract needed:** batch revoke and wallet migration (wallet batched calls), subscriptions (stablecoin transfer to treasury verified by the backend), treasury (existing Safe multi-sig).
- **Rules:** immutable (non-upgradeable) contracts, versioned; same addresses on every chain (CREATE2); 100% line and branch test coverage plus fuzz and invariant tests; source verified on explorers; Claude prepares contracts and deployment scripts, but **the owner deploys from their own hardware wallet or Safe; private keys are never shared**.

## M2 — Multi-chain core + search + wallet

CAIP helpers; chain registry; `ChainFamilyAdapter` interface and **EVM family adapter** (Ethereum, BNB Chain); adapter contract test-suite; provider layer (Alchemy, RPC fallback, DefiLlama); API infra; family-aware universal search resolver; wallet layer with EVM connectors (no signing). Owner adds Alchemy key + WalletConnect Project ID to `.env.local`.
**Done when:** search routes real EVM addresses/tokens/hashes correctly; EVM adapter passes the contract suite; a test-only second family proves adding a family needs no changes elsewhere; wallet survives language switch. → Met (2026-11-20); see PROGRESS.md.

## M2.5 — Free utilities (moved up from M7 for early SEO; zero running cost)

Unit converter (wei/gwei/ETH/BNB), hex/decimal converter, address checksum formatter, transaction data decoder (known ABIs); each runs in the browser, with how-to + FAQ content. Timestamp/block converter stays in M7 (needs RPC). → Done (2026-11-20); see PROGRESS.md.

## M3 — Address · Overview (Tool 1: Balance Scanner)

**Done when:** balances for real addresses on ETH and BSC match explorers. → Built 2026-11-20; final comparison with the owner's Alchemy key pending (see PROGRESS.md).

## M4 — Transaction page (Tool 5)

**Done when:** success / failed / pending / not-found / contract-creation cases match explorers on both chains. → Built and tested 2026-11-20 on real transactions of every case; side-by-side explorer check by the owner pending (see PROGRESS.md).

## M4.1 — Transaction Intelligence (owner request 2026-11-20; design approved; ✅ built 2026-11-20)

Turns the M4 transaction page from an explorer-style list into an explanation: story first, money second, technical
evidence on demand. Based on the owner's "Universal Transaction Intelligence" spec, adapted to CRYPY's rules.

- **Simple view (default) and Advanced view**, same data, choice remembered on the device.
- **Headline by action type** (send, receive, swap, approval, revoke, NFT transfer, mint, burn, wrap/unwrap,
  contract creation, multi-step contract call, unknown) from a deterministic, unit-tested interpretation engine with
  translatable templates. Decoded function names are treated as clues, not proof.
- **Visual flow** (sender → action → receiver with asset chips), **token changes per wallet** (labelled "seen in token
  events"), grouped movements with the original event list expandable.
- **Failed-transaction explainer:** known error messages and standard custom errors translated to plain English; the
  original message always shown; "out of gas" only as a likely cause; unknown reasons stated honestly.
- **Pending:** progress line, last-checked time, fee shown as a labelled maximum estimate, and "replaced or dropped"
  detected only from evidence (sender's nonce already used).
- **Names for well-known contracts** (routers, Permit2, wrapped coins, major tokens, null address) from a local list.
- **Plain cost** with "What is this?" tips; time in the visitor's time zone plus UTC.
- **Evidence levels** on interpretations (confirmed / decoded / likely / unknown).
- **USD:** today's on-chain price, labelled; transaction-time price when archive data is available (Alchemy), never mixed.
- **Advanced view:** chain ID, block hash, index, nonce, full fee breakdown (base/priority/burnt), function and
  parameters, all events in original order with raw topics, raw transaction/receipt JSON.
- **Export:** copy plain summary, copy link, download JSON and readable report.
- **Per-chain support table** (supported / partial / planned) for transaction features; nothing advertised untested.
- **Later (needs own node):** execution traces and internal native transfers; mempool "first seen" time.

**Done when:** the spec's test list (send, token transfer, approval, failed with known and unknown reason, pending,
contract creation, unknown contract, many events, no events, not found, provider down, no price, mobile, Simple /
Advanced consistency, RTL) passes on real transactions of both chains.

## M4.2 — Transaction Intelligence V2 (owner request 2026-11-20; design approved; Part 1 ✅ built 2026-11-20)

Part 1 (built): multi-action engine with six evidence levels, permission granted/used/removed with today's value,
verified pool swaps (factory check), KyberSwap router reports, coins inside contracts from balances, reusable route
template, "Who was involved", neutral sender wording, provider refusal memory. See PROGRESS.md.

Part 2 (next, alongside M5/M5.5): more protocol adapters (Uniswap Universal Router and v4, 1inch, 0x, PancakeSwap
Smart Router, Curve, Balancer), NFT marketplace sales, lending (Aave/Venus) and bridges as named actions, Safe/ERC-4337
inner calls, an "analysis coverage" panel (events recognised, never shown as "100% understood"), and more regression
transactions per category. Execution traces stay planned for when we run our own node.

## M4.5 — Batch Balance Scanner (owner request 2026-11-20; design approved 2026-11-20; ✅ built 2026-11-20)

Check one or more coins/tokens for a whole list of addresses, on the chains the visitor picks. Own tool page
`/tools/batch-balance` (Wallet category). Reads directly from the chain with multicall: about 2–3 requests per
1,000 addresses per asset per chain, so it fits the zero-API-cost rule.

**Input**

- Address list editor with line numbers; paste in any format (one per line, commas, spaces, or `address,label`).
  Drag-and-drop or upload `.csv` / `.txt` (Excel users save as CSV). "Load example" fills a sample list.
- Live check per line before scanning: valid, duplicate (merged), mistyped checksum and invalid format are flagged
  with the line number and never scanned. A count bar shows valid / duplicates / problems.
- Chains: pick one or more (Ethereum, BNB Chain now; more chains appear as they are added).
- Assets: the native coin plus up to 5 tokens per scan, chosen from a list of well-known tokens or by pasting a
  contract address. Name, symbol and decimals are read from the contract and shown before scanning; a warning
  appears if the address is not a token on a selected chain.

**Scan**

- Runs in safe batches with a progress bar and a Cancel button (no "fast/slow" choice for the visitor: the server
  picks the batch size and spreads load across the free providers).
- Partial failures are retried once, then marked per row; finished rows are never lost.

**Results**

- Summary: addresses scanned, with balance, empty, total per asset, total USD value (on-chain DEX prices; tokens
  without a reliable price show amounts only), block number and time of the reading.
- Table: label, address (copy, link to its address page), chain, wallet or contract, one column per asset, USD
  value, share of total. Sort by any column, search, filters (hide empty, minimum balance, chain).
- Export CSV (built in the browser, spreadsheet-formula injection blocked), copy results, copy "addresses with
  balance" or "empty addresses".
- Token safety summary for each scanned token once M5 ships.

**Privacy and security**

- Public addresses only; no wallet connection needed; never asks for keys or seed phrases.
- Lists are not stored, not logged and never put in the URL; input is validated and size-capped on the server;
  per-visitor rate limit.

**Free and paid**

- Free: up to 500 addresses × 2 chains × 6 assets per scan, fair-use rate limit.
- Later (revenue Phase A "bulk address scan"): very large lists, saved lists, scheduled re-scans with change
  alerts, balance at a past block (needs archive data), API access.

**Done when:** results for a 500-address list match explorer balances on both chains; invalid, duplicate and
mistyped lines are caught; CSV opens correctly in Excel and Google Sheets; page weight stays within budget.

## Deferred parts (owner rule 2026-11-20: nothing is missed or called complete until this list is done)

| Feature                       | Deferred part                                                                                                                                                                                                                                                    | Planned in                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| M5.1 Liquidity holders        | Complete LP holder list for every pool (needs each pool's full transfer history; free nodes allow only a few hours)                                                                                                                                              | M5.5 Stage 2 indexer            |
| M5.1 Liquidity holders        | v3 positions staked in farms (MasterChef v3, Uniswap v3 Staker) or locked in Team Finance / PinkLock                                                                                                                                                             | M5.5 Stage 2 indexer            |
| M5 Token Security             | Holder count and top holders from CRYPY's own data (today only from GoPlus)                                                                                                                                                                                      | M5.5 Stage 2 indexer            |
| M5 Token Security             | Contract age and creator                                                                                                                                                                                                                                         | M5.5 Stage 2 indexer            |
| M5 Token Security             | Source verification on block explorers (today Sourcify only). Etherscan's free plan forbids commercial use; options: (a) keep Sourcify only, (b) Etherscan's paid commercial plan once revenue allows, (c) another free source if its terms allow commercial use | Owner decision                  |
| M5 Token Security             | More lockers: GemPad, Mudra, DXLock personal lockers (official addresses and read methods to be confirmed)                                                                                                                                                       | When addresses are confirmed    |
| M6 Approvals                  | Complete approval history (every Approval event a wallet ever emitted; free nodes search only recent blocks, so approvals that GoPlus doesn't list and that aren't on a token the wallet holds may be missing)                                                   | M5.5 Stage 2 indexer            |
| M6 Approvals                  | "New contract" reason when GoPlus doesn't know the spender's creation time (needs CRYPY's own contract-age data)                                                                                                                                                 | M5.5 Stage 2 indexer            |
| M6 Approvals                  | Single-item NFT approvals (`approve(tokenId)`) and Permit2 signed permits not yet used on-chain                                                                                                                                                                  | M7                              |
| M6 Approvals                  | Revoke tested on a testnet (needs testnet support in the chain registry); mainnet revoke tested only with a rejected wallet request in browser tests                                                                                                             | M7 (testnets) / owner check     |
| M6 Approvals                  | One-signature batch revoke                                                                                                                                                                                                                                       | Revenue Phase A (paid tool)     |
| M7 Activity                   | Internal transfers (coins paid by contracts) on BNB Chain: not in Alchemy's data there                                                                                                                                                                           | M5.5 Stage 2 indexer / own node |
| M7 Activity                   | Total transfer count and value at the time of each transfer (needs full history / archive prices)                                                                                                                                                                | M5.5 Stage 2 indexer            |
| M4.2 Transaction Intelligence | Part 2: more routers and pool types, NFT marketplaces, lending, bridges, smart-wallet inner calls                                                                                                                                                                | Alongside M5.5 / M6             |

## M5.2 — Token Security: finishing parts — 🟡 built 2026-11-20

Done: trade test on v3 pools and stablecoin-paired pools (contract V3), owner powers from verified source (Sourcify),
DeepLock, upgradeable-locker flags, live timelock check. Remaining parts are in the table above.

## M5.1 — Who holds the liquidity — 🟡 built 2026-11-20 (design approved, boards 21–23)

Every pool and every holder CRYPY can find for free, what each holder can do read on-chain (locks with end dates,
multisigs, timelocks, farms, vaults), v3 positions by value, weighted totals, and "not found" shown as such. Deferred
parts are in the table above.

## M5 — Token · Security (Tool 4) — 🟡 built 2026-11-20, not complete (design approved, boards 19–20)

Built with CRYPY's own trade simulation, on-chain reads, Sourcify and GoPlus (second opinion). Next steps for this
tool: v3 trade simulator, stablecoin-path trades, contract age and creator from our own index (M5.5 Stage 2), more
exchanges and lock contracts as config entries.

**Done when:** known-safe and known-scam reference tokens on both chains produce correct, attributed signals.

## M5.5 — Token · Market & Charts (approved 2026-11-20)

A **Market** tab on the token page, built from CRYPY's own on-chain data (no paid data API).

- **Pool discovery:** ask DEX factory contracts for the token's pools (PancakeSwap and Uniswap v2/v3, plus their direct forks, on BNB Chain and Ethereum).
- **Trade history:** read `Swap` events through our RPC; buy/sell, amounts, USD value (via on-chain reference pools such as WBNB/USDT and WETH/USDC), time, wallet link (→ /address), tx link (→ /tx).
- **Candles:** built by CRYPY from those trades (1m, 5m, 15m, 1h, 4h, 1D) with volume; TradingView Lightweight Charts (Apache 2.0, TradingView attribution shown), loaded only on the Market tab.
- **Pools list:** every pool with DEX, pair, liquidity, 24h volume and age; switch the chart between pools.
- **Key numbers and safety beside the chart:** price, change, liquidity, volume, FDV; M5 security findings; warnings for low liquidity, very new pools and liquidity concentrated in one pool.
- **Stage 1 limits (stated on the page):** recent history only (about 24 hours to 7 days, shorter for very busy pools); refresh every ~15 s via a shared server cache that reads only new blocks; unsupported pool types are labelled, never estimated.
- **Cost:** $0. Runs in the existing app on the Alchemy free tier; no extra server, database or data API.
- **Not included:** buy/swap buttons, promoted or paid token listings.
  **Done when:** trades and candles for reference pools on both chains match the explorers' swap events; pool lists match the DEX factories; the Market tab stays within the page budget when not opened.

### Later stages (after V1, when traffic or revenue justifies them)

- **Stage 2 — long history:** an always-on indexer (one small server + free-tier Postgres) stores every trade so history grows daily; optional provider for older candles only if users need it before our index is deep enough (licensed and attributed).
- **Stage 3 — professional extras:** more DEX designs (Uniswap v4, Curve, Balancer, Aerodrome/Velodrome, Trader Joe…), whale-trade highlights, faster updates, pool alerts via Watchlist.
- **Other chains:** EVM chains are added by configuration (factory addresses) for Uniswap-style DEXes; each new DEX design needs its own decoder; Tron (SunSwap), TON and Solana DEXes arrive with their chain-family milestones; Bitcoin has no DEX pools, so the Market tab is not shown there.

## M6 — Address · Approvals + revoke (Tool 3) — 🟡 built 2026-11-21 (design approved, boards 24–27)

Built: Approvals tab on every address (`/address/{address}/approvals`), Approval Checker tool page live, API
`GET /api/v1/address/{address}/approvals`, risks per approval, value at risk, filters, single and sequential
"revoke flagged" in the user's wallet with the security review in ARCHITECTURE.md §10b. Deferred parts are in the
table above.

**Done when:** approvals match Revoke.cash for test wallets; revoke tested on testnet then mainnet; extra security review passed.
Owner checks still open: compare 2–3 of your own wallets with Revoke.cash; do one real revoke of a small approval.

## M7 — Activity (Tool 2), Gas (Tool 6), more EVM chains — Activity 🟡, Gas ✅, Timestamp converter ✅, chain picker ✅ (2026-11-21); next: Base, Arbitrum, Polygon

Explorer decision; activity tab (all coin/token transfers sent and received); gas page + widget; timestamp/block converter (other utilities shipped in M2.5); add Base, Arbitrum, Polygon (config only) after verification.

## M8 — Portfolio (Tool 7), accounts, Watchlist & Telegram alerts (Tool 8)

Portfolio stores CAIP-10 account IDs; Postgres + Drizzle; wallet sign-in (SIWE); Alchemy webhooks; Telegram bot.
**Done when:** an alert is delivered end-to-end in staging and production.

## M9 — Launch readiness

Urdu + Arabic translations & RTL QA; security review; accessibility & performance; legal pages; production deploy to crypy.org.

## After V1 — revenue phases (approved 2026-11-19)

Two ways to pay for every paid feature: pay as you go (on-chain fee per transaction / prepaid credits for off-chain tools) or a monthly/yearly plan. Basic safety stays free.

- **Phase A — low-risk earnings.** Gate: V1 live + legal and tax advice. CRYPY Pro, batch revoke, holder snapshot, bulk address scan (large lists, saved lists, scheduled re-scans on top of the free M4.5 tool), hardware-wallet affiliate links, crypto payments and credits.
- **Phase B — on-chain fee tools.** Gate: contracts independently audited + multi-sig treasury set up. Multisender (real distributions only, token scan + anti-dusting), airdrop claim pages, liquidity and token lock with vesting, wallet migration, **safe token creator** (safe template only: no hidden mint/blacklist/pause, capped fixed tax, auto-verified source, lock prompt); signed discount passes for plan holders.
- **Not recommended (owner informed 2026-11-19):** stealth/anonymous transfer services (laundering and legal risk, blocklisting) and wallet / batch-wallet creation (requires handling keys; phishing pattern; sybil and holder-inflation use).
- **Phase C — business revenue.** Gate: steady usage + reliable data. CRYPY API, embeddable widgets, project dashboard, contract monitoring, due-diligence reports.
  V1 prep: M8 accounts include plan, entitlement and credit models (switched off).

## After V1 — chain family expansion (each is its own milestone)

Proposed order by user demand: **Tron → Solana → Bitcoin → TON → others**. Each: adapter + providers + wallet connectors + contract tests + security review + translations of family-specific terms.

Remaining languages progressively; future modules only with owner approval.
