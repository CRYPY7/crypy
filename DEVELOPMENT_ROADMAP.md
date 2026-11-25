# CRYPY — Development Roadmap (V1)

Status: **Approved** — Nov 2026 (rev. 6). **M0–M2.5 done; M3–M6 built (M6 on 2026-11-21).** Every milestone ends with typecheck, lint, tests and build actually run, PROGRESS.md updated, owner review.

> **Current priority (owner decision 2026-11-24): Stabilization (S0–S6, below).** New features (Token Market &
> Charts, new chains, new tools) wait until S6 passes. No redesign: the current design stays.

## Stabilization — make every live feature work for everyone, always (owner decision 2026-11-24)

Why: features sometimes stopped and came back by themselves. Almost every case had one shape: a free outside
service said no for a few minutes and CRYPY had nothing saved to show instead. Full plan: the "CRYPY —
Stabilization roadmap" doc. Owner answers (2026-11-24): pause new features; add 2–3 more free providers per chain;
add a staging droplet (about $6 a month), grow production to 4 GB only if measured; keep the bug list in a Sheet.

**Targets (14 days in a row, measured from real visitors):** site up 99.9%; 99.5% of visitor requests per tool end in
a full or clearly labelled partial result; errors or blank cards under 0.5% and never 5 minutes in a row for a tool;
a failed source recovers by itself within 2 minutes; first visit to a popular token or address under 3 s for 95%;
repeat visit under 1 s; updates without downtime beyond a 10 s restart, bad updates rolled back; free plans never
used up before 00:00 UTC on a normal day.

- **S0 — See every failure.** Outcome of every visitor request per tool (full / partial / error, reason, time; no
  addresses or IPs); server errors saved (keys removed); /admin "What visitors got" per tool and hour; Telegram to the
  owner when a tool's errors pass 2% over 10 minutes, and on recovery. **Done when:** a week of real numbers per tool
  and the top failure reasons named.
- **S1 — Audit every feature** (with S0). The checklist in the doc on all 5 chains: data checked against explorers
  and Revoke.cash, unusual inputs, behaviour when a source fails. Findings in the bug list Sheet with severity.
  **Done when:** every feature checked and every finding listed.
- **S2 — Never show an error when a good answer exists.** Last good result saved in the database for token checks,
  address summaries, approvals, activity and gas; shown with its age while a fresh check runs; one shared
  partial-result design. **Done when:** stopping any one provider on staging leaves every tool showing a result.
  - **Built 2026-11-24 (boards 60–61, see PROGRESS.md):** saved results for balances, activity (first page),
    approvals, token security and gas; one shared notice (fresh / saved with its age / not checked); wallet results
    deleted 7 days after the last lookup. The outage drill (`CRYPY_FAULT_CHAINS`) is ready for the staging check.
  - **Built 2026-11-25:** saved readings shown at once when a fresh read takes over 2.5 s (state 2, page updates
    itself); confirmed transactions saved; an address opens its page from saved readings when no chain answers.
  - **Still to do in S2:** the staging check itself (S4 creates staging); measure first visits on the live server
    (B-006, B-013, B-018, B-025): a wallet or token nobody looked up yet is still as slow as before.
- **S3 — Sources that don't fall over.** Health score per provider and method (bench failing providers until they
  recover); more free providers per chain and a map of what each supports; GoPlus queue with priorities and saved
  results; a queue for heavy checks. **Done when:** a day with one provider down and GoPlus at its limit stays on target.
  - **Built 2026-11-25:** GoPlus answers saved (reuse 1 h for tokens, 5 min for approvals; 24 h fallback); per-method
    provider rest; crawlers get no lookups on result pages; `pnpm providers:map` (what each provider supports; first map
    of the public nodes in PROGRESS.md).
  - **Still to do in S3:** more free providers per chain and a map of what each supports; a GoPlus queue with
    priorities; a queue for heavy checks; a measured health score shown on the admin page; the "done when" day.
- **Utilities track U1–U3 (owner decision 2026-11-24), alongside S3–S5:** browser-only tools only, one batch at a
  time; backlog and statuses in FEATURE_REGISTRY.md and the "CRYPY — Feature registry" Sheet (291 catalog tools).
  U1: token decimals, manual gas fee, supply & valuation, APR/APY, address QR. U2: loan-to-value, impermanent loss,
  slippage, Bitcoin and Solana address formats, EIP-712 / Permit signature decoder. U3: Keccak, selectors and topics,
  ABI validator and encoder/decoder, Base58/Base64, JSON/CSV. Designs first; English first, translated per batch
  before deploy; Learn guides only where useful. RPC or server tools from the catalog wait for S6.
  - **U1 built 2026-11-24** (see PROGRESS.md). Owner decision 2026-11-24: new screens are built without design
    approval first; the owner reviews them on the site.
  - **U2 built 2026-11-24** (see PROGRESS.md).
  - **U3 built 2026-11-25** (see PROGRESS.md). U1–U3 done; the next utilities batch needs the owner's choice from
    the registry, and room in the CSS budget.
- **S4 — A server that doesn't fall over.** Background worker as its own service; Redis for limits, pacers and the
  cache; staging droplet; builds on GitHub Actions; smoke test after every update with automatic rollback (started
  2026-11-24: two build folders, rollback); a tested backup restore. **Done when:** an update, a worker crash and a
  restart each leave the site serving.
- **S5 — Fix everything found**, most harmful first, each with a test that fails without the fix; slow first visits.
- **S6 — Prove it:** 14 days in a row on target. Then new features resume.

**Batch Balance Scanner (owner request 2026-11-24): the most reliable and capable bulk scanner.**
Compared with tokentools.app and chaintx.tools: both run in the visitor's browser against one public node, one chain
and one token per scan; chaintx.tools lets the visitor set chunk size and delay. CRYPY keeps reads on its server
(privacy: visitors' IPs never reach node providers) and does several chains and tokens in one scan.

- **Part A (S2, bug B-028): never fails.** Built 2026-11-24 (see PROGRESS.md). Load tests passed in the workspace; limits are set after the same tests run on the server.
  - A scan is a server job that paces itself.
  - Small multicalls whose size adapts per provider.
  - It retries on other providers and waits when asked to slow down, until every address is read.
  - It survives a page refresh, with progress and time left.
  - A sample is cross-checked on a second provider.
  - A row is marked failed only after repeated tries, with the reason.
  - Limits count a scan as one job, so the per-visitor limits and the Cloudflare /api/ rule don't cut it off.
  - Load tests must finish fully every time: 500 wallets × 5 chains × 6 tokens repeated, and 10,000 wallets on BNB
    Chain.
  - Then the 500-wallet limit is raised to what the tests prove safe.
- **Strategy (owner decision 2026-11-24): server queue.**
  - Scans run in the background worker, never in the website process; they move to the separate worker service when
    S4 is done.
  - Hard caps: how many scans run at once, the share of each provider's capacity scans may use (pages keep theirs)
    and the queue length (when full: "very busy, try again in a few minutes").
  - Fair use: one active scan per visitor; a daily wallet allowance per IP (anonymous) or per signed-in wallet.
  - The same address, chain and block is read once, even when several scans ask for it.
  - Lists are held in memory only while the scan runs, deleted at the end or after 1 hour at most, and never logged.
    The privacy page wording changes with it.
  - Limits are settings, so free and premium plans differ only in numbers and priority.
  - Load test on staging: about 100 scans at once with the website staying fast.
- **Part A.2 (owner decision 2026-11-24, right after Part A): optional "Scan in my browser" mode.** Built 2026-11-24 (see PROGRESS.md).
  - Off by default. It explains that the visitor's IP and list go to public nodes.
  - It uses the same pacing and retry engine, only keyless public nodes (and later the visitor's own node), and the
    same results format, labelled "scanned in your browser".
  - Free permanently (owner decision 2026-11-24): it costs CRYPY nothing, limits in a browser can't be enforced, and
    competitors offer it free. Its size limit exists only to keep browser tabs responsive.
  - Premium sells what browser mode can't do: private, priority server scans, saved lists, scheduled re-scans with
    alerts, history and snapshots. Design approved before building.
- **Part B (owner decision 2026-11-24: after S6, the first feature work):**
  - balances at a past block or date (snapshots; needs Alchemy archive reads)
  - "what changed since your last scan"
  - which wallets can't pay gas
  - automatic discovery of the tokens each wallet holds
  - ENS names
  - Excel and JSON export
  - watching the list for alerts

  Designs approved before building.

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
- **M7–M9: Learn hub** — short, original guides that answer real searches ("how to revoke token approvals", "what is a honeypot token", "check if a BEP-20 token is a scam"), linked to the matching tool; published in English, then (2026-11-23) translated into the six wave-1 languages as Beta; Urdu and Arabic later.
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

| Feature                       | Deferred part                                                                                                                                                                                                                                                    | Planned in                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| M5.1 Liquidity holders        | Complete LP holder list for every pool (needs each pool's full transfer history; free nodes allow only a few hours)                                                                                                                                              | M5.5 Stage 2 indexer                    |
| M5.1 Liquidity holders        | v3 positions staked in farms (MasterChef v3, Uniswap v3 Staker) or locked in Team Finance / PinkLock                                                                                                                                                             | M5.5 Stage 2 indexer                    |
| M5 Token Security             | Holder count and top holders from CRYPY's own data (today only from GoPlus)                                                                                                                                                                                      | M5.5 Stage 2 indexer                    |
| M5 Token Security             | Contract age and creator                                                                                                                                                                                                                                         | M5.5 Stage 2 indexer                    |
| M5 Token Security             | Source verification on block explorers (today Sourcify only). Etherscan's free plan forbids commercial use; options: (a) keep Sourcify only, (b) Etherscan's paid commercial plan once revenue allows, (c) another free source if its terms allow commercial use | Owner decision                          |
| M5 Token Security             | More lockers: GemPad, Mudra, DXLock personal lockers (official addresses and read methods to be confirmed)                                                                                                                                                       | When addresses are confirmed            |
| M6 Approvals                  | Complete approval history (every Approval event a wallet ever emitted; free nodes search only recent blocks, so approvals that GoPlus doesn't list and that aren't on a token the wallet holds may be missing)                                                   | M5.5 Stage 2 indexer                    |
| M6 Approvals                  | "New contract" reason when GoPlus doesn't know the spender's creation time (needs CRYPY's own contract-age data)                                                                                                                                                 | M5.5 Stage 2 indexer                    |
| M6 Approvals                  | Single-item NFT approvals (`approve(tokenId)`) and Permit2 signed permits not yet used on-chain                                                                                                                                                                  | M7                                      |
| M6 Approvals                  | Revoke tested on a testnet (needs testnet support in the chain registry); mainnet revoke tested only with a rejected wallet request in browser tests                                                                                                             | M7 (testnets) / owner check             |
| M6 Approvals                  | One-signature batch revoke                                                                                                                                                                                                                                       | Revenue Phase A (paid tool)             |
| M7 Activity                   | Internal transfers (coins paid by contracts) on BNB Chain: not in Alchemy's data there                                                                                                                                                                           | M5.5 Stage 2 indexer / own node         |
| M7 Activity                   | Total transfer count and value at the time of each transfer (needs full history / archive prices)                                                                                                                                                                | M5.5 Stage 2 indexer                    |
| M7 New chains                 | Token Security on Base, Arbitrum, Polygon: PinkLock and Team Finance lockers (no confirmed official addresses there), staking farms, Aerodrome and Camelot pools (different pool designs)                                                                        | When addresses / decoders are confirmed |
| M7 New chains                 | Aerodrome (Solidly-style) pools on Base for prices: tokens that trade only there show no price yet                                                                                                                                                               | M5.5 decoders                           |
| M7 New chains                 | Internal transfers on Base and Arbitrum in Activity (not in Alchemy's free data)                                                                                                                                                                                 | M5.5 Stage 2 indexer / own node         |
| M4.2 Transaction Intelligence | Part 2: more routers and pool types, NFT marketplaces, lending, bridges, smart-wallet inner calls                                                                                                                                                                | Alongside M5.5 / M6                     |
| M8 Alerts                     | Email alerts (board 39: "Email alerts later")                                                                                                                                                                                                                    | After V1                                |
| M8 Alerts                     | Telegram messages and bot replies in other languages (English only now)                                                                                                                                                                                          | After the native reviews (M9 Part 6)    |
| M8 Alerts                     | ERC-1155 transfers and single-NFT approvals (`approve(tokenId)`)                                                                                                                                                                                                 | With M6's single-NFT approvals          |
| M8 Alerts                     | Coin transfers with transaction details where Alchemy has none (internal transfers on BNB Chain, Base, Arbitrum; any chain without Alchemy): reported as balance changes                                                                                         | M5.5 Stage 2 indexer / own node         |
| M8 Alerts                     | Running the checker and bot on several servers at once (needs a shared lock; one server per database and bot token for now)                                                                                                                                      | When scaling past one VPS               |
| Server stability              | Outbound HTTP/2 (Node 26 default) turned off after it crashed the server on Windows; re-test HTTP/2 on a later Node/undici and on the Linux VPS before turning it back on                                                                                        | Before launch (M9)                      |
| Server stability              | Trace the harmless "unhandledRejection … getEthBalance … zero data" log line from free nodes                                                                                                                                                                     | M9 security review                      |
| M9 Speed                      | Lighthouse mobile ≥ 90 on every page: address and transaction pages score 76–81 in simulation (live content streams in; measured LCP 1.2–1.5 s), Token Security tool page 87. Re-measure with PageSpeed Insights on the production server, then decide           | M9 deploy                               |

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

## M7 — Activity (Tool 2), Gas (Tool 6), more EVM chains — Activity 🟡, Gas ✅, Timestamp converter ✅, chain picker ✅, Base / Arbitrum / Polygon 🟡 with Token Security (2026-11-21)

Explorer decision; activity tab (all coin/token transfers sent and received); gas page + widget; timestamp/block converter (other utilities shipped in M2.5); add Base, Arbitrum, Polygon (config only) after verification.

## M8 — Portfolio (Tool 7), accounts, Watchlist & Telegram alerts (Tool 8) — Parts 1–3 built 🟡 (2026-11-22)

Designs approved 2026-11-21 (boards 36–41) with the owner's decisions: PostgreSQL (PGlite in development, real
Postgres on a VPS at launch); a background checker polling about every minute (needs an always-on server); a Telegram
bot the owner creates with @BotFather (token only in `.env.local`); limits of 20 Portfolio wallets and 10 watched
items per account.

- **Part 1 — Portfolio 🟡 built:** browser-saved, no account; combined totals, by chain / wallet / token, safety
  badges, CSV. Deferred: account sync and "Watch for changes" (parts 2–3).
- **Part 2 — accounts 🟡 built (2026-11-22, Beta):** Sign-In with Ethereum (a message to sign, no transaction),
  Postgres + Drizzle (PGlite in development), Watchlist (10 items) with alert choices, download and delete account.
  Deferred to Part 3: optional portfolio sync.
- **Part 3 — alerts 🟡 built (2026-11-22):** background checker, Telegram bot, quiet hours, alert history, Portfolio
  sync and "Watch for changes". Beta label removed. Owner's real-Telegram test passed on his PC (2026-11-22).
  **Done when:** an alert is delivered end-to-end in staging and production.

## M9 — Launch readiness — in progress (owner decisions 2026-11-22)

Translations (wave 1, owner decision 2026-11-23: Spanish, Portuguese (Brazil), Chinese, Russian, Turkish, Vietnamese); security review; accessibility & performance; legal pages; production deploy to crypy.org. Urdu and Arabic moved to later.

- **Part 1 — Security review ✅ (2026-11-22):** 6 findings fixed; accepted items and nginx launch requirements in
  ARCHITECTURE.md §10d.
- **Part 2 — Accessibility and speed 🟡 (2026-11-22):** 0 axe violations (WCAG 2.2 AA) with automated tests; layout
  shifts removed; home, tools and the Gas Tracker at 90–92 on simulated mobile. Open part in the table below.
- **Part 3 — Friends preview online 🟡 (2026-11-22):** server scripts for one DigitalOcean droplet (nginx, systemd,
  PostgreSQL, HTTPS, backups, updates). Live on crypy.org behind Cloudflare (free), server reachable only through
  Cloudflare, Bot Fight Mode and an `/api/` rate-limiting rule on.
- **Part 4 — Public beta 🟡 (owner request 2026-11-22):** search engines allowed (preview switch removed), "Beta"
  label next to the logo, English texts updated for all five chains, legal pages rewritten to describe what CRYPY
  actually does and labelled "not reviewed by a lawyer yet". Still open: lawyer review of the legal pages and a
  contact address on them; Google Search Console and Bing Webmaster set up by the owner.
- **SEO (owner priority 2026-11-22):** own plan in SEO_ROADMAP.md. Phase 1 (technical and on-page) ✅ built;
  Phase 2 (Learn hub, 12 guides) ✅ and Phase 3 (gas by chain, daily checks of 50 curated tokens) ✅ built.
- **Part 5 — Monitoring, status page and admin dashboard (owner request 2026-11-23; designs first):** built 2026-11-23:
  health checks, `/status`, `/admin` and Telegram messages to the owner (designs approved, boards 51–54).
  - **Health checks (core):** every 5 minutes the server runs a small real check of each tool and chain (a known
    wallet's balance, a known transaction, a token check, gas, search) and of the alerts worker, Telegram bot, daily
    token checks and database; each result (pass / slow / fail, time taken) is kept 90 days. Both pages read these
    results, so neither starts provider calls when someone opens it.
  - **Public status page** (`/status`): every tool and chain as Working, Slow or Down, 90-day uptime bars, incident
    notes written by the owner, and Live / Beta / Coming soon for features (from the tool registry and a short public
    list, never the private roadmap). No provider names, keys, addresses or server details. Indexable.
  - **Admin dashboard** (`/admin`, private, `noindex`): sign-in with the owner's wallet (SIWE, already built) plus an
    allowlist of admin addresses in the server's `.env.local`; optional second lock with Cloudflare Access (free).
    Shows providers and free-plan usage (Alchemy, GoPlus), rate-limit hits, the alerts worker per chain, Telegram
    bot, token-check freshness and failures, database size and last backup, disk and memory, certificate expiry and
    recent errors (redacted). Lets the owner write incident notes for the status page. Sends the owner a Telegram
    message when a check keeps failing, and when it recovers. Read-only otherwise: no buttons that change user data.
  - **External uptime monitor** (owner, free): a service outside the server (for example UptimeRobot's free plan)
    checks crypy.org every 5 minutes and emails the owner if the whole server is down, which the server can't report
    about itself.
  - **Done when:** a provider or the bot stopped on purpose on staging shows as Down on both pages within 10
    minutes, the owner gets the Telegram message, and recovery shows too; the status page has no private detail.
- **Part 6 — Languages wave 1 🟡 (owner decision 2026-11-23: the biggest crypto markets first):** Spanish,
  Portuguese (Brazil), Chinese (Simplified), Russian, Turkish and Vietnamese, every website text and all 12 guides,
  built 2026-11-23 and released as **Beta**: in the language menu and footer with a "Beta translation" notice,
  `noindex`, not in the sitemap or hreflang, not auto-detected. The admin dashboard stays English.
  **Done when (per language):** a native speaker has reviewed it and the owner approves; then its status becomes
  `complete`, which adds it to search engines (hreflang, sitemap) and to automatic language detection.
  **Later:** Urdu and Arabic (hidden; right-to-left support kept), then Hindi, French, German.
- **Next parts:** Stabilization S0–S6 (above) first; native reviews of the six Beta languages and the lawyer review
  of the legal pages continue on the owner's side; the staging copy and the alerts "Done when" are part of S4.

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
