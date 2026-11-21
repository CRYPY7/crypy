# CRYPY — Progress

Last updated: 2026-11-21

## Milestones

| Milestone                                               | Status                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| M0 Setup and design approval                            | ✅ Done                                                                                       |
| M1 Foundation                                           | ✅ Done (2026-11-19)                                                                          |
| M2 Multi-chain core, search routing, wallet connection  | ✅ Done (2026-11-20)                                                                          |
| M2.5 Free utilities                                     | ✅ Done (2026-11-20)                                                                          |
| M3 Address overview (Balance Scanner)                   | ✅ Built (2026-11-20); owner check with Alchemy pending                                       |
| Desktop sidebar layout, chain icons, recently viewed    | ✅ Done (2026-11-20, design approved)                                                         |
| M4 Transaction page                                     | ✅ Done (2026-11-20)                                                                          |
| M4.1 Transaction Intelligence                           | ✅ Done (2026-11-20, design approved)                                                         |
| M4.2 Transaction Intelligence V2, Part 1                | ✅ Built (2026-11-20, design approved with owner's conditions)                                |
| M4.5 Batch Balance Scanner                              | ✅ Built (2026-11-20, design approved)                                                        |
| M5 Token Security                                       | 🟡 Built, not complete: parts deferred (see roadmap "Deferred parts")                         |
| M5.2 Token Security: finishing parts                    | 🟡 Built 2026-11-20; explorer source check needs owner decision; 3 lockers pending addresses  |
| M5.1 Liquidity holders ("Who holds the liquidity")      | 🟡 Built 2026-11-20 (design approved, boards 21–23); parts deferred (see roadmap)             |
| M5.5 Token Market & Charts (own on-chain data)          | Planned (approved 2026-11-20)                                                                 |
| M6 Approvals and safe revoke                            | 🟡 Built 2026-11-21 (design approved, boards 24–27); parts deferred (see roadmap)             |
| M7 Activity tab (Address Analyzer)                      | 🟡 Built 2026-11-21 (design approved, boards 28–30); Alchemy path needs the owner's live test |
| M7 Gas Tracker, Timestamp & Block Converter, new chains | Next (designs approved, boards 31–33)                                                         |
| M3–M9                                                   | Planned (see DEVELOPMENT_ROADMAP.md)                                                          |

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
