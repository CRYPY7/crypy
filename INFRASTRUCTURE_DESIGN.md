# CRYPY — Infrastructure Redesign (data layer, speed, all chains)

Status: **Draft for owner approval** — 2026-11-26
Owner decisions behind it (2026-11-26): stop new features until the infrastructure is fixed; zero paid APIs; EVM
chains first, then every other chain family; automatic chain detection stays free, manual chain choice as an option;
stored results with automatic deletion; pages open at once and fill in; speed is part of "done".

---

## 1. Why

Measured on the live server (2026-11-26): a wallet's first scan took 3–8 s and token lists were cut off on 4 of 5
chains; Portfolio waited up to 20 s for safety checks. Patching each tool did not fix it, because the cause is shared:

1. **Every lookup asks every chain, live.** Search, balances, approvals and activity each probe all chains with
   several requests, often through free public nodes, and wait for the slowest. Work grows with the number of chains:
   at 30 chains every scan would be 6× slower and cost 6× more.
2. **Data that never changes is rebuilt per visitor.** Token names, decimals, spam verdicts and prices are worked out
   again on every visit. Wallets holding 2,000+ airdropped spam tokens make this the dominant cost.
3. **Pages wait for everything.** Search resolves every chain before navigating; the page then waits for its data.
4. **Each tool fetches its own way.** Four tools, four fetching paths, four sets of bugs.

The Batch Balance Scanner is the exception: one engine, many free providers, limits, retries and cross-checks. It is
the model for everything below.

## 2. Speed targets (hard rules)

A tool is **not done** until these hold, measured on the production server (1 vCPU, 2 GB) with the scripts in §10:

| Moment                                                                | Target                                          |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| Enter pressed → page visible (frame, address, tabs, placeholders)     | ≤ 0.2 s                                         |
| Wallet seen in the last 7 days → its stored result visible            | ≤ 0.3 s                                         |
| New wallet → active chains and total visible                          | ≤ 2 s (p95 ≤ 3 s)                               |
| New normal wallet (< 500 tokens) → complete balances                  | ≤ 3 s                                           |
| Spam-heavy wallet (thousands of tokens) → well-known tokens and total | ≤ 3 s; rest fills in, labelled                  |
| One chain slow or down                                                | never delays other sections; labelled per chain |
| Layout shift while sections fill in                                   | 0 (existing CLS tests)                          |

Adding chains must not change these numbers: scan time depends on the chains a wallet **uses**, not on how many
CRYPY supports.

## 3. Rules every tool follows

1. **Discover first, then read only where the wallet is active.** One discovery request per wallet; never a probe
   per chain for chains the indexer covers.
2. **Shared data is stored once.** Token details, spam verdicts and prices live in the database and are reused by
   every visitor and every tool.
3. **Stored first, then fresh.** A recent stored result is shown at once with its age; the fresh reading replaces it.
   Safety data is never shown older than its limit (approvals 6 h, token security 6 h).
4. **Pages stream.** The frame renders immediately; each section loads on its own (React Suspense); a section
   failing shows its own error.
5. **One data layer.** Tools call shared services (§5); no tool talks to providers directly.
6. **Every external call is budgeted.** Daily and per-second budgets per provider, measured costs, automatic
   fallback, never a paid plan.
7. **Honest output.** Cut-off, stored, partial and unsupported results are labelled; never a "safe" verdict.

## 4. Chains

**Chain registry** (`config/chains.ts`, CAIP-2 ids, unchanged idea) gains a **tier** per chain:

| Tier         | Data source                                                           | Tools available                                                                                     |
| ------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A — indexed  | Alchemy Portfolio API (discovery, balances) + Alchemy RPC + free RPCs | all wallet tools                                                                                    |
| B — RPC only | free RPC providers                                                    | native balance, well-known tokens, transactions, gas, token security where its DEXes are configured |

Alchemy's wallet endpoints cover Ethereum, Solana, and 30+ EVM chains; their exact list is read from Alchemy's chain list
and checked per chain before it is switched on. Every chain still goes live only after its live tests pass (project
rule). Order: (1) the EVM chains Alchemy indexes, (2) other EVM chains as tier B, (3) other families, each through its
own adapter (Solana first — Alchemy indexes it — then Tron, Bitcoin, TON).

Adding a tier-A EVM chain = one config entry (ids, explorer, Alchemy network name, public RPCs, well-known tokens) +
the live test. Price pools, lockers and approval spenders per chain are optional extras; tools say what isn't covered.

## 5. Architecture

```
Pages (stream per section)            app/[locale]/address|token|tx …
        │
Services (one per tool, thin)         balances · approvals · activity · portfolio · token security · tx · gas
        │
Wallet data layer                     discovery · holdings · snapshots        (server/wallet/)
Token registry                        details · spam · prices                 (server/tokens/)
        │
Provider pool                         readers, health, budgets, hedging       (generalised batch-scan engine)
        │
Alchemy (Portfolio API, RPC) · dRPC · Ankr · Infura · Chainstack · NodeReal · public nodes · GoPlus · Sourcify
```

### 5.1 Provider pool

The batch scanner's engine (`lib/batch-scan/engine.ts`, readers in `server/batch-scan/readers.ts`) becomes the shared
way to talk to nodes: per-provider health, rest on failure, splitting, retry elsewhere, cross-check samples where a
wrong answer matters. Alchemy is reserved for what only it does (discovery, token lists, transfer history, old
blocks); ordinary reads go to the free RPC keys first. One account per provider (several free accounts to dodge
limits break provider terms and risk a ban of all of them).

**Measured costs.** Alchemy documents that Portfolio API costs scale with the number of networks in the request. The budget meter
will use costs measured on CRYPY's own account (step R0), not guesses.

### 5.2 Wallet discovery

`discoverWallet(address)` → active chains + balances per chain, in one round:

- **Tier A:** Alchemy "Token Balances By Wallet" — limit 3 pairs, max 20 networks per request, balances only
  (details come from the token registry), so ~30 chains = 2 parallel requests. Pages of results are read in parallel
  per network group; a spam-heavy wallet stops at the first-view budget and continues in the background (as today).
- **Tier B:** one batched native-balance + nonce read per chain (cheap, 1.5 s cap).
- **Fallback** (Alchemy failing or out of budget): today's per-chain method for the chains the wallet was last seen
  on, then well-known tokens.
- Result stored as the wallet's **activity map** (§7) so the next visit, Approvals and Activity know where to look
  without asking again.

### 5.3 Token registry

Table `tokens` (chain, address, name, symbol, decimals, spam verdict + reason, price, price time, last used):

- **Details:** filled from Alchemy's metadata when available, else one multicall for the missing ones only; never
  read twice.
- **Spam:** rules already in `lib/portfolio/holdings.ts`, run once per token, stored; re-checked after 30 days.
- **Prices:** CRYPY's own DEX price engine, run by a **background job** for tokens people looked at in the last 7
  days (every 2–5 minutes, batched); pages read the stored price. Tokens without a stored price show "no price"
  immediately and are queued for the job (so spam never blocks a page).

### 5.4 Snapshots

Per wallet and chain, the last holdings (and per tool, its last result) — the existing `saved_results` idea, now the
default path: stored → shown → refreshed in the background → page updates itself.

### 5.5 Pages

- **Search:** the format of the input (EVM address, tx hash, later other families) is recognised in the browser;
  Enter opens the page at once. Whether it is a wallet, token or contract is decided on the page.
- **Streaming:** `address` page = header + tabs immediately; then "active chains + total" (from discovery) and one
  section per chain, each in its own Suspense boundary with a fixed-size placeholder.
- **Updates:** a section showing stored or partial data refreshes itself (existing `CheckingNotice` mechanism).

### 5.6 Chain choice (owner decision 2026-11-26: keep both)

- **One chain selector, the same on the search bar and every tool** (balances, approvals, activity, Portfolio):
  "All chains (auto)" by default; "Choose chains" opens a checklist with quick buttons for common chains.
- **Auto:** discovery (§5.2) finds the active chains; nothing to choose, nothing missed.
- **Manual:** discovery is skipped; only the chosen chains are read (faster and cheaper).
- The choice is remembered on the device (existing `crypy_chains` cookie) and carried in the link (`?chains=`), so a
  shared link opens with the same chains.
- **Safety rules:** a manual scan is labelled ("Scanned: Ethereum, BNB Chain — your choice"), never shown as
  complete; on safety pages, when the stored activity map already knows the wallet is active on a chain that wasn't
  chosen, a note offers "Also active on Base — check it too".
- Both modes are free. Premium later = depth and scale (complete reads of spam-heavy wallets, full history, tier-B
  deep scans, more Portfolio wallets, faster alerts, exports), never basic detection, chain choice or safety.

## 6. Tools on the new layer

| Tool                               | Change                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Search                             | browser-side format check, instant navigation; per-chain lookups removed from search                           |
| Address overview / Balance Scanner | discovery + token registry + snapshots; per-chain streaming                                                    |
| Portfolio                          | same balances service; safety part unchanged (B-034 design); safety reads only active chains                   |
| Approvals                          | only on active chains from the activity map; GoPlus + on-chain checks as now; streamed per chain               |
| Activity                           | Alchemy transfers per **active** chain only (the multi-chain transfers endpoint is beta and limited); streamed |
| Token security                     | unchanged engine; token details and prices from the registry; streamed sections                                |
| Transaction page                   | chain from the hash lookup on tier-A chains in one batched round; token details from the registry              |
| Gas                                | unchanged (already one request per chain, shared cache); extends to new chains by config                       |
| Batch Balance Scanner              | already on the engine; uses the token registry for details and prices                                          |
| Watchlist / alerts                 | unchanged checker; uses the registry; activity map limits per-chain work                                       |

Removed after migration: the per-chain "used chains" probe (`chain-scope.ts` lookups), per-tool metadata reads,
per-request pricing, the B-035 directory as a separate path (folded into discovery).

## 7. Storage and automatic deletion

| Data                                      | Kept                                                  | Size (rough)                 |
| ----------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Token details + spam verdict              | deleted after 90 days unused                          | ~200 B per token             |
| Token prices                              | refreshed while viewed; dropped after 7 days unviewed | small                        |
| Wallet activity map                       | 30 days after last lookup                             | ~100 B per wallet            |
| Wallet snapshots (holdings, tool results) | 7 days after last lookup (as now)                     | 2–50 KB per wallet and chain |
| Visitor numbers, health checks            | 90 days (as now)                                      | small                        |

Hourly cleanup job for every table; /admin shows database size and each table's size. Estimate: 100,000 wallets
looked up in a week stay under ~2 GB; limits are settings and can be tightened. Backups exclude snapshots and caches
(as today).

## 8. Free-provider budget

- Alchemy free plan: monthly units spread per day (existing `alchemy-budget.ts`), tiers for background vs visitors,
  measured per-method costs (R0). Discovery is the main Alchemy cost; it is stored per wallet, so a wallet costs it
  at most once per refresh window, not per visit.
- Ordinary reads (multicall, balances, receipts) on dRPC, Ankr, Infura, Chainstack, NodeReal and public nodes through
  the provider pool, each with its daily budget.
- When budgets run low: stored results first, then the RPC fallback, always labelled. Never paid usage.
- If traffic ever outgrows the free plans, the provider pool takes CRYPY's own indexer or node as another reader —
  server rent, not API fees — without changing tools.

## 9. Background jobs (existing worker)

Price refresh (2–5 min), spam/detail fill-in for new tokens, snapshot refresh for watched wallets, cleanup (hourly),
budget and size report to /admin. All at background priority; visitors always first.

## 10. Testing speed

- **`pnpm perf:server`** (new script, read-only): runs a fixed set of wallets (small, normal, spam-heavy, contract,
  token) through each tool's API and page on the server, cold and warm, and prints p50/p95 against §2. Run by the
  owner after each deploy of the redesign; results recorded in PROGRESS.md.
- **CI:** recorded provider answers replayed with fixed delays, so a change that adds a wait or a chain-wide probe
  fails a test.
- Existing unit, browser, accessibility and layout-shift tests stay.

## 11. Plan

Features stay frozen until R5. Each step ships separately, measured, with the old path as fallback until its
replacement meets §2.

| Step | Work                                                                                                                     | Done when                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| R0   | Measure: Alchemy units per Portfolio request (owner's dashboard + a counted test), `perf:server` script, today's numbers | real costs known; baseline recorded               |
| R1   | Provider pool generalised from the batch engine; token registry table + filling + cleanup                                | all tools read token details from the registry    |
| R2   | Wallet discovery + activity map + snapshots; instant search navigation                                                   | §2 targets for discovery and search on the server |
| R3   | Address overview, Balance Scanner, Portfolio on the new layer, streamed per chain                                        | §2 targets for balances                           |
| R4   | Approvals and Activity on active chains only, streamed                                                                   | §2 targets for both                               |
| R5   | Token, transaction pages and batch scanner on the registry; old paths removed                                            | all tools on one layer; old code deleted          |
| R6   | Add the remaining Alchemy-indexed EVM chains, each live-tested                                                           | each chain passes its live test; §2 unchanged     |
| R7   | Tier-B EVM chains; then Solana, Tron, Bitcoin adapters (each its own milestone)                                          | per family: adapter tests + security review       |

**Status (2026-11-27):** R0 built; R1 parts 1–2 built and measured (25 of 31 targets); **R2 part 1 built**: activity
map from one discovery request (stored 30 days, fresh 6 h), stored results shown after 0.25 s while the fresh read
finishes, search opens transaction pages at once and looks addresses up before Enter. Measured 2026-11-28 after the
second-visit fix: **31 of 31 targets**. **R2 part 2 built:** token lists show a first view after 2 s and finish in
the background. **R3 built:** a page waits at most 3 s for a chain with no stored reading, then shows the rest and
marks that chain "still reading" (self-updating); Portfolio badges reuse GoPlus answers up to 6 h. **R4 closed
2026-11-28** (31 of 31 targets; fresh scans limited by GoPlus's answer time and Alchemy's free per-second limit,
hidden by stored readings). **R5 done 2026-11-28** (old paths and unused code removed). The feature freeze is lifted
(owner decision 2026-11-28); next: **R6**, the remaining Alchemy-indexed EVM chains, each live-tested.

## 12. Risks and open points

- **Alchemy unit costs** may be higher than documented per request (they scale with networks). R0 measures them; the
  B-035 change (live since 2026-11-26) counts 200 units per page and may undercount — the owner checks the Alchemy
  dashboard's daily usage; `CRYPY_WALLET_TOKENS=off` returns to the old method at once if usage is too high.
- **Coverage per chain** of Alchemy's wallet endpoints differs; each chain is verified before it is switched on.
- **Multi-chain transfer history** from Alchemy is beta and limited, so Activity stays per active chain.
- **One 1-vCPU server:** background jobs are rate-limited; heavy growth would move the worker to its own droplet
  (server rent only).
