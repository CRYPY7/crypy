# CRYPY — V1 Technical Architecture

Status: **Approved; M1–M3 implemented** — Nov 2026 (rev. 6: performance rule, M1 implementation notes)
Scope: V1 = 8 tools delivered through a search-first, entity-centric product on BNB Smart Chain and Ethereum. The core is designed so **any blockchain family** (EVM, Tron, Solana, Bitcoin, TON, Cosmos, Sui, Aptos …) can be added through an adapter without changing tools, pages or the database schema.

---

## 0. Product decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Positioning:** "The wallet safety & research toolkit for BNB Chain and Ethereum users — in your language."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D2  | **Structure:** universal search + shared entity pages (`/address`, `/token`, `/tx`) with tool tabs. Tools remain registry entries with landing pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D3  | **Order:** Token Security and Approvals before Activity, Gas, Portfolio, Watchlist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D4  | **Design first:** visual mockup approved before M1 code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D5  | **All-chains-ready core (2026-11-19):** chain-family adapter architecture with CAIP identifiers from day one. V1 implements only the EVM family (ETH, BSC). Additional EVM chains = config; non-EVM chains = one family adapter each, added post-V1 in order of user demand (proposed: Tron → Solana → Bitcoin → TON).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D6  | **Brand (2026-11-19):** product name **CRYPY**, production domain **crypy.org**. Package/repo identifier `crypy`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D7  | **Usability:** every tool reachable in one click from any page ("All tools" menu in header, Ctrl+K tool search, mobile bottom tab bar); goal-based entry points phrased as user questions; every tool states what input it needs; example links for first-time users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D8  | **Revenue (2026-11-19, approved):** after V1, three sources — pay-per-use tools (Phase A: batch revoke, holder snapshot, bulk scan; Phase B: multisender, airdrop claim pages, liquidity/token lock and vesting, wallet migration, safe-template token creator — audited contracts), CRYPY Pro subscription, business products (Phase C: API, widgets, project dashboard, contract monitoring, due-diligence reports), plus hardware-wallet affiliate links. Basic safety stays free. Two ways to pay: **pay as you go** (on-chain fee in native coin/stablecoin added on top, shown before signing, sent to a multi-sig treasury in the same tx; prepaid credits for off-chain tools) or **monthly/yearly plan** (short-lived server-signed discount pass verified by contracts, fair-use allowances). Multisender is marketed for real distributions only, with token scanning and anti-dusting rules. Never: paid badges or paid changes to risk results, token promotions, holder-inflation or volume tools, unrestricted token creators, key / wallet / batch-wallet generation, stealth or anonymous transfer (mixing) services, selling data, hidden fees. Full proposal: "CRYPY — Revenue Features Proposal" doc. |
| D10 | **Lightweight always (2026-11-19):** pages must load fast on slow mobile connections. Static rendering by default; translations applied on the server (no i18n runtime in the browser); no UI library loaded on every page; heavy UI (dialogs, wallet SDKs, charts) loaded only when used; fonts self-hosted and subset; automated performance budget tests (see §13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D11 | **SEO from day one (2026-11-19):** static, fast, multilingual pages; structured data; indexable tool pages, guides and curated token pages; infinite result pages (`/address`, `/tx`, uncurated tokens) are `noindex` and rate-limited for bots. See roadmap SEO track.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D12 | **Low cost first (2026-11-19):** free-tier providers during V1; paid APIs only when free sources can't do the job or revenue covers them; caching and bot limits protect quotas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D13 | **Own smart contracts (2026-11-19):** Foundry + OpenZeppelin v5 in `contracts/`; shared fee module, multisender, Merkle airdrop claims, token/liquidity lock + vesting, safe token factory; immutable, CREATE2-deployed, fully tested and externally audited before mainnet; owner deploys with own hardware wallet/Safe. See roadmap contract track.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D15 | **Zero API cost (owner rule, 2026-11-20):** no paid APIs or data services, ever; only domain and servers are paid. Free node providers rotate with daily budgets, then public nodes; prices come from our own DEX-pool engine; database, cache and indexer run on our own VPS; own nodes later. Every external source needs a free fallback. Supersedes D12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D14 | **Own DEX market data (2026-11-20):** token charts and trade history are built by CRYPY from on-chain `Swap` events, not bought from data APIs. Stage 1 (M5.5) reads recent history on demand with a shared cache ($0); Stage 2 adds a persistent indexer; DEX support grows through decoders. See §12b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D9  | **Free utilities (M2.5, moved up from M7):** client-side Utilities category — unit converter (wei/gwei/ETH), hex/decimal, address checksum, timestamp/block converter, transaction data decoder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| —   | **Payment-ready V1:** accounts, plans/entitlements, credit balance and per-chain fee settings are modelled in the V1 data design (switched off), so revenue phases need no rebuild.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| —   | Security data from specialist providers, aggregated and attributed; never a "safe" verdict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| —   | Portfolio without account; alerts via user-initiated wallet sign-in; Telegram first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| —   | No "workspace modes" in V1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 1. Architecture principles

1. **Non-custodial, read-first.** Research works on public identifiers; connection optional; never auto-signs.
2. **Backend-for-Frontend.** Provider keys server-only.
3. **Entity-centric.** Address, Token, Transaction are the core entities; tools are views on them.
4. **Chain-family adapters.** Nothing outside `src/server/chains/<family>/` may assume a chain's address format, hash format, account model, token standard or fee model. Shared code talks only to the adapter interface and capability flags.
5. **Universal identifiers.** Chains, accounts and assets are identified with CAIP standards (CAIP-2 chain IDs, CAIP-10 account IDs, CAIP-19 asset IDs) in all internal types, APIs and storage.
6. **Capability-driven UI.** Tabs, filters and features appear only where the chain's adapter declares the capability (e.g. no "Approvals" tab on Bitcoin).
7. **Provider abstraction** with fallbacks.
8. **Untrusted in, validated out** (zod).
9. **Honest, attributed results** (`verified | heuristic | unsupported`).
10. **Language-neutral APIs; no hardcoded UI text.**
11. **Lightweight pages.** Server Components and static HTML first; client JavaScript only for interaction; anything heavy is lazy-loaded on first use.

---

## 2. Technology stack

| Layer              | Choice                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Next.js 16 (App Router, `cacheComponents`, `proxy.ts` instead of middleware, `next/root-params` for the locale), React 19, TypeScript strict                                                              |
| UI                 | Tailwind CSS v4, shadcn/ui (Base UI primitives, `cn`), next-themes, lucide icons. Header controls use plain elements with shared `buttonVariants`; the language menu uses the native `popover` attribute. |
| i18n               | next-intl                                                                                                                                                                                                 |
| Chain identifiers  | CAIP-2 / CAIP-10 / CAIP-19 (small internal helper, no heavy dependency)                                                                                                                                   |
| EVM family         | viem v2 (server + client), wagmi 3 for EVM wallet connection (lazy-loaded)                                                                                                                                |
| Future families    | Added with their adapter only: e.g. TronWeb (Tron), @solana/kit + Wallet Standard (Solana), bitcoinjs-lib / indexer APIs (Bitcoin), @ton/ton (TON) — evaluated at that time                               |
| Validation         | zod                                                                                                                                                                                                       |
| Cache / rate limit | Upstash Redis + @upstash/ratelimit                                                                                                                                                                        |
| Database           | PostgreSQL + Drizzle (M8)                                                                                                                                                                                 |
| Auth (M8)          | Wallet sign-in, user-initiated only: SIWE (EIP-4361) for EVM; per-family equivalents (e.g. Sign-In With Solana) when those families ship                                                                  |
| Notifications (M8) | Telegram Bot API                                                                                                                                                                                          |
| Testing            | Vitest, Testing Library, Playwright, MSW (tests only)                                                                                                                                                     |
| Package manager    | pnpm 12 (pinned via `packageManager`). Supply-chain protection kept on: packages newer than ~1 day are refused, install scripts are off unless listed in `pnpm-workspace.yaml`.                           |
| Hosting            | Vercel (Pro once commercial), domain crypy.org                                                                                                                                                            |

---

## 3. Multi-chain architecture

### 3.1 Identifiers

```ts
type ChainId = `${string}:${string}`; // CAIP-2: 'eip155:1', 'eip155:56', 'solana:5eykt4Us…', 'bip122:000000000019d6689c085ae165831e93', 'tron:0x2b6653dc'
type AccountId = `${ChainId}:${string}`; // CAIP-10: 'eip155:56:0xabc…'
type AssetId = `${ChainId}/${string}:${string}`; // CAIP-19: 'eip155:1/erc20:0xa0b8…', 'eip155:1/slip44:60' (native)
type ChainKey = "ethereum" | "bsc" | string; // human slug used in URLs
```

- URLs use slugs (`/token/bsc/0x…`); APIs, cache keys, DB rows and logs use CAIP IDs.
- Amounts are always `{ raw: string /* bigint as string */, decimals: number }` — works for 6, 8, 9, 18 or any decimals.

### 3.2 Family adapter interface

```ts
interface ChainFamilyAdapter {
  family: "evm" | "tron" | "solana" | "bitcoin" | "ton" | "cosmos" | string;

  // identity & parsing
  parseAddress(input: string): { normalized: string } | null; // checksum/format validation
  parseTxId(input: string): { normalized: string } | null;
  explorerUrl(chain: ChainConfig, kind: "address" | "tx" | "token", id: string): string;

  // capabilities (per chain, see ChainConfig.capabilities)
  getNativeBalance?(chain, address): Promise<Amount>;
  getTokenBalances?(chain, address, opts): Promise<TokenBalance[]>; // ERC-20 / BEP-20 / TRC-20 / SPL / Jettons…
  getTransaction?(chain, txId): Promise<NormalizedTx | null>;
  classifyAddress?(chain, address): Promise<"account" | "token" | "contract" | "unknown">;
  getApprovals?(chain, address): Promise<Approval[]>; // EVM/Tron allowances, Solana delegates
  buildRevoke?(chain, approval): UnsignedAction; // signed by user's wallet, never server
  getActivity?(chain, address, cursor): Promise<Page<NormalizedTx>>;
  getFeeEstimates?(chain): Promise<FeeEstimate>; // EIP-1559, legacy, sat/vB, lamports…
}
```

Normalized models (`NormalizedTx`, `TokenBalance`, `Approval`, `FeeEstimate`) are family-neutral; family-specific details go in an optional typed `extra` field rendered by family-specific UI sections when needed (e.g. Bitcoin inputs/outputs, Solana instructions).

### 3.3 Chain configuration

```ts
interface ChainConfig {
  key: ChainKey; // 'bsc'
  caip2: ChainId; // 'eip155:56'
  family: ChainFamilyAdapter["family"];
  name: string;
  nativeAsset: { symbol: string; decimals: number; assetId: AssetId; priceId: string };
  explorer: { name: string; url: string };
  providers: { rpc: string[]; tokens?: string; prices?: string; security?: string; activity?: string };
  familyConfig?: unknown; // e.g. viem Chain for EVM
  capabilities: {
    nativeBalance: boolean;
    tokenBalances: boolean;
    tokenSecurity: boolean;
    approvals: boolean;
    revoke: boolean;
    activity: boolean;
    fees: boolean;
    webhooks: boolean;
  };
  status: "live" | "beta" | "planned";
}
```

Adding an EVM chain = one config file. Adding a non-EVM chain = adapter (once per family) + config.

### 3.4 Universal search resolver (family-aware)

1. Every registered family adapter's `parseAddress` / `parseTxId` runs on the input (format + checksum/decoded-length checks, e.g. `0x`+40 hex → EVM; `T…` base58check 25 bytes → Tron; base58 32-byte key → Solana; `bc1…`/base58check → Bitcoin).
2. Matches are narrowed with live lookups (`classifyAddress`, tx existence) on the relevant chains in parallel.
3. One match → redirect; several → chooser ("Found on BNB Chain and Ethereum"); none → "not found on supported chains" plus tool search.
   EVM addresses are valid on every EVM chain, so `/address/0x…` shows an aggregated multi-chain view by default.

### 3.4a Resolver rules (implemented 2026-11-20)

- Lookups include code, nonce and native balance per chain; `isActiveLookup` = code, nonce > 0 or balance > 0.
- One active chain → target (token page for tokens, else `/address/<a>`); several → `target: null` + `choices` (each with its lookup) + `overview`; none → overview. `inactive` lists chains with no activity.
- Address page: `?chain=<key>` focuses one chain; identity cards, filter, token note, totals and holdings are derived from the resolver lookups plus the balance overview.

### 3.5 Wallet connection layer

```
src/wallets/
├─ types.ts               # WalletState, strings, WALLET_FLAG_KEY
├─ wallet-root.tsx        # tiny always-loaded context; lazy-loads the family runtime
├─ connect-button.tsx     # header button + "Use my wallet" link
├─ evm/{config.ts, runtime.tsx, wallet-dialog.tsx}   # wagmi 3 (ssr: true), EIP-6963 + WalletConnect (QR)
└─ (tron/ solana/ …)      # added with their family
```

Wallet connection remains optional and never auto-signs, in every family. The runtime loads only on the first click on Connect, or at idle time for returning wallet users (`crypy.wallet.used` in localStorage). ESLint blocks wagmi's signing and sending hooks; `tests/e2e/wallet.spec.ts` fails if any signing method is requested.

### 3.6 Data providers by family (planning reference, verified before use)

| Family                                                                                                                                                                | Candidate providers                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| EVM                                                                                                                                                                   | Alchemy (RPC, tokens), DefiLlama (prices), GoPlus, Honeypot.is, Etherscan V2 / BSCTrace / Blockscout |
| Tron                                                                                                                                                                  | TronGrid, Tronscan API, GoPlus (Tron token security)                                                 |
| Solana                                                                                                                                                                | Alchemy/Helius RPC & DAS API, GoPlus (Solana), Jupiter price API                                     |
| Bitcoin                                                                                                                                                               | mempool.space API, Blockstream Esplora                                                               |
| TON                                                                                                                                                                   | TON Center / tonapi.io                                                                               |
| Multi-chain aggregators (e.g. Moralis, GoldRush, Zerion API) are an option to cover many chains with one integration — evaluated per milestone for cost and accuracy. |

---

## 4. External providers (V1, EVM)

| Capability                 | Primary                 | Fallback / notes              |
| -------------------------- | ----------------------- | ----------------------------- |
| RPC (eip155:1, eip155:56)  | Alchemy                 | Public RPCs via viem fallback |
| Token discovery & metadata | Alchemy Token API       | Multicall over curated list   |
| Prices                     | DefiLlama Coins API     | CoinGecko Demo                |
| Token security             | GoPlus Security API     | On-chain reads as heuristics  |
| Honeypot                   | Honeypot.is             | GoPlus flag                   |
| Approvals                  | Decision in M6          |                               |
| Activity & ABIs            | Explorer decision in M7 |                               |
| Notifications              | Alchemy webhooks (M8)   | Polling worker                |

---

## 5. Product surfaces & routes

```
/[locale]                          Home: universal search + goal shortcuts + all tools + gas widget
/[locale]/address/[address]        family detected from format; ?chains=bsc,ethereum
                                   tabs (capability-driven): overview | activity | approvals
/[locale]/token/[chain]/[address]  security | contract | holders | liquidity
/[locale]/tx/[hash]                ?chain=<slug>  (auto-detect when omitted)
/[locale]/portfolio · watchlist · gas · tools · tools/[toolId] · settings · docs · legal/*
```

Global navigation: header "All tools" menu (grouped, searchable, recent tools), Ctrl+K tool palette, mobile bottom tab bar (Home, Tools, Portfolio, Alerts, Settings).

Desktop (lg, 1024 px and wider) adds a left tools sidebar (`src/components/layout/sidebar.tsx`): server-rendered
links grouped by category, plus two tiny client pieces (current-page marker, collapse button). The collapsed state
is stored in localStorage (`crypy.sidebar`) and applied to `<html data-sidebar>` by an inline head script before
first paint. At lg the header drops its nav links (the sidebar replaces them) and shows the search. Entity pages
carry breadcrumbs. The home page lists "Recently viewed on this device" (`crypy.recent`, max 8, validated on read,
never sent to the server). Chain logos live in `public/chains/<chainKey>.svg` (cryptocurrency-icons, CC0-1.0) and
are rendered by `ChainIcon`; a new chain adds its SVG there.

### 5.1 Tool registry

```ts
interface ToolDef {
  id: string;
  entity: "address" | "token" | "tx" | "standalone";
  surface: { route: string; tab?: string };
  icon: string;
  category: "security" | "wallet" | "network" | "monitoring";
  question: string; // i18n key, e.g. "Is this token safe to buy?"
  input: string; // i18n key, e.g. "Token contract address"
  requires: (keyof ChainConfig["capabilities"])[]; // tool shows on chains that have these
  status: "live" | "beta" | "soon";
  requiresAccount?: boolean;
}
```

Supported chains per tool are **derived** from capabilities. The header menu, tool palette, home grid, goal tiles and landing pages are all rendered from the registry.

---

## 6. Layered design

```
UI (entity page → tab) ─ hook ─► /api/v1/...  (zod · rate limit · cache)
                                    ▼
                         server/services/<domain>.service.ts   (family-neutral)
                                    ▼
                         lib/chains/registry → ChainFamilyAdapter (evm | tron | …)
                                    ▼
                         providers (Alchemy, GoPlus, …)  → zod-parsed
```

```ts
type ApiResult<T> =
  | {
      ok: true;
      data: T;
      meta: {
        chain?: ChainId;
        sources: string[];
        fetchedAt: string;
        cached: boolean;
        warnings: { code: WarningCode; params?: Record<string, string> }[];
      };
    }
  | { ok: false; error: { code: ErrorCode; retryable: boolean } };

interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  class: "verified" | "heuristic" | "unsupported";
  source: string;
  evidence?: Record<string, string>;
  fetchedAt: string;
}
```

---

## 7. Folder structure

```
crypy/
├─ src/
│  ├─ app/[locale]/{page.tsx, address/[address]/…, token/[chain]/[address]/…, tx/[hash]/, portfolio/, watchlist/, gas/, tools/, settings/, docs/, legal/}
│  ├─ app/api/v1/{health, search/resolve, address/[address]/{balances,activity,approvals}, token/[chain]/[address]/{security,info}, tx/[hash], gas}
│  ├─ components/{ui, layout, shared}
│  ├─ config/{chains/{ethereum.ts, bsc.ts, index.ts}, tools.ts, site.ts}
│  ├─ entities/{address, token, tx}
│  ├─ modules/tools/<toolId>/
│  ├─ lib/
│  │  ├─ chains/{caip.ts, types.ts, sanitize.ts}   # browser-safe: identifiers, adapter interface, models
│  │  └─ format/amount.ts                          # BigInt amount formatting
│  ├─ server/                                      # server-only
│  │  ├─ env.ts · page-guard.ts · rate-limit.ts · http/response.ts
│  │  ├─ chains/{registry.ts, evm/adapter.ts}      # later: tron/, solana/, bitcoin/, ton/ …
│  │  ├─ prices/defillama.ts
│  │  └─ services/{resolve.ts, lookups.ts}         # resolver is pure (registry injected) → unit-testable
│  ├─ components/{entity, seo, search, layout, tools, ui}   # tools/tool-page.tsx: shared tool page
│  ├─ modules/tools/<toolId>/{logic.ts, widget.tsx, workspace.tsx}   # browser tools: pure logic + client widget + server wrapper
│  ├─ wallets/{types.ts, wallet-root.tsx, connect-button.tsx, evm/}
│  ├─ i18n/
│  └─ proxy.ts
├─ messages/<locale>.json
├─ tests/{unit, e2e}   # unit/resolve.test.ts includes a fake second family; unit/live.test.ts runs with LIVE=1
└─ docs + .env.example
```

**Adapter contract tests:** one shared test suite (address parsing, balances shape, tx normalization, capability honesty) that every family adapter must pass before its chains can be marked `live`.

---

## 8. Internationalization

- 10 locales registered (en default; ur, ar RTL; hi, es, fr, de, zh-CN, ru, tr); status drives the selector.
- Localized routes, `hreflang`, cookie → Accept-Language → en.
- One dictionary per locale (`messages/<locale>.json`), deep-merged over English so missing keys fall back; `pnpm i18n:check` validates keys and types; ESLint `i18next/no-literal-string` blocks hard-coded UI text.
- Translations are resolved on the server (`next-intl/server` with `next/root-params`); client components receive ready-made strings as props, so no i18n code ships to the browser.
- `src/proxy.ts` redirects un-prefixed URLs using the saved `NEXT_LOCALE` cookie, then `Accept-Language`, choosing only `complete` locales. Unreviewed locales are reachable by URL for testing, show a notice and are `noindex`.
- RTL via logical utilities; `TechnicalText` for addresses/hashes of every family.
- bigint-safe amounts with per-asset decimals; `Intl` formatting.
- Fonts per script; Urdu Nastaliq for text, Naskh for tables.
- Finding explanations and per-family terms (gas, energy/bandwidth on Tron, rent on Solana, sat/vB on Bitcoin) in dictionaries + glossary.
- Locale switch preserves URL and wallet session.

---

## 9. Feature designs (V1 on EVM; other families via capabilities)

- **Address · Overview (Tool 1):** native + token balances per chain in parallel; spam hidden; per-chain and combined totals; links to `/token`.
- **Transaction (Tool 5):** auto chain detect across families that match the hash format; status, fees, confirmations, decoded transfers.
- **Token · Security (Tool 4):** GoPlus + Honeypot.is + on-chain reads; findings by severity; checks run / not available.
- **Address · Approvals (Tool 3):** allowances, NFT operator approvals, Permit2 where discoverable; explicit wallet-confirmed revoke built by the adapter, signed only in the user's wallet. Only on chains with `approvals` capability.
- **Activity (Tool 2), Gas (Tool 6):** explorer/indexer per family; fee models normalized (`FeeEstimate`).
- **Portfolio (Tool 7) & Watchlist (Tool 8):** addresses stored as CAIP-10 account IDs, so one portfolio can mix EVM, Tron, Solana, Bitcoin addresses later without schema changes.

---

## 10. Security design

- No seed phrase / private key fields; no auto signing; revoke actions built server-side as _unsigned_ data and signed only in the user's wallet.
- Secrets server-only (`src/server/*` imports `server-only`); only `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` public (domain-restricted to crypy.org + localhost in Reown).
- CSP `connect-src` lists only the RPC hosts and WalletConnect/Reown services in use; add a host there when adding a provider the browser talks to.
- Result pages that call providers are rate-limited per visitor (`page-guard.ts`), `noindex` and disallowed in robots.txt.
- zod validation; family-specific format/checksum validation in adapters.
- Rate limiting, security headers, plain-text rendering of third-party strings, allow-listed explorer links.
- Each new family gets a security review before going live.
- Brand protection: publish the official domain prominently; consider registering common look-alike domains to reduce phishing impersonation.

---

## 11. Environment variables

```
ALCHEMY_API_KEY=
ETH_RPC_URL_FALLBACK=
BSC_RPC_URL_FALLBACK=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
COINGECKO_API_KEY=            # optional
GOPLUS_APP_KEY=               # M5 (if required)
GOPLUS_APP_SECRET=
ETHERSCAN_API_KEY=            # M7
BSCTRACE_API_KEY=             # M7
DATABASE_URL=                 # M8
SESSION_SECRET=               # M8
TELEGRAM_BOT_TOKEN=           # M8
ALCHEMY_WEBHOOK_SIGNING_KEY=  # M8
# Future families add their keys here (e.g. TRONGRID_API_KEY)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # production: https://crypy.org
```

---

## 12. Known limitations

- V1 implements only the EVM family (Ethereum, BNB Chain); other chains are shown only after their adapter passes contract tests and verification.
- Feature parity across families is not possible (e.g. Bitcoin has no token approvals); unsupported features are hidden or labelled per chain.
- Provider coverage limits token discovery, prices and security findings; gaps are shown, never estimated.
- With `cacheComponents`, unknown dynamic params (e.g. `/en/tools/unknown`) render the not-found page with `noindex` but HTTP status 200 (streamed response). Acceptable for SEO; revisit if Next.js adds `dynamicParams=false` support.
- The browser's native popover with CSS anchor positioning is used for the language menu; browsers without anchor positioning show it centred.

---

## 10a. Blockchain providers and prices (zero API cost)

- `server/chains/evm/providers.ts`: provider list per chain (Alchemy → `ETH_RPC_URLS`/`BSC_RPC_URLS` → public nodes) behind viem `fallback`; every transport is metered (Alchemy compute units per method; requests for others) against a daily budget and refuses once it is used, so the fallback moves on. Usage lives on `globalThis` (one meter per process); a Redis store replaces it at launch.
- `server/chains/evm/prices.ts` + `dex.ts`: on-chain USD prices. Round 1 finds pools (v2 `getPair`, v3 `getPool` per fee tier) against stablecoins and the wrapped native coin; round 2 reads quote-side balances and v2 balances / v3 `slot0`. Stablecoins = $1; wrapped native priced from stablecoin pools first; deepest pool ≥ $5,000 quote side wins.
- Adapter methods: `getUsdPrices` (keys `native` and lower-case token addresses), `checkProviders`.

## 11a. Balances (M3)

- `ChainFamilyAdapter.getBalances(chain, address)` → `ChainBalances { native, tokens[], coverage }`. EVM: `server/chains/evm/balances.ts` lists tokens with Alchemy `alchemy_getTokenBalances` (100 per page, max 3 pages) and reads metadata by multicall; without Alchemy it checks `ChainConfig.commonTokens` and reports `coverage: "common-only"`.
- `lib/portfolio/holdings.ts` (pure): values holdings, sorts them, hides likely spam (`link-in-name`, `bait-words` without price, `unreadable`) and excludes unpriced and spam tokens from totals.
- `server/services/overview.ts`: all chains in parallel (`allSettled`), on-chain prices per chain (up to 300 tokens), cached 60 s per address.
- Address page renders it on the server; no client JavaScript.

## 12a. Tool pages

- Not-yet-live tools: `app/[locale]/tools/[toolId]/` (landing page only).
- Working tools: their own folder `app/[locale]/tools/<id>/` (listed in `modules/tools/own-route.ts`), rendering the shared `ToolPage` with the tool's server `workspace.tsx` as children. Separate routes give each tool its own JavaScript chunk; a shared dynamic route would bundle all tools together.
- Browser-only tools keep their logic in pure, unit-tested modules; widgets receive translated strings as props.
- `GET /api/v1/health` reports, per chain, the provider live requests use and a separate test of each configured provider (names only).

## 12c. Transaction page (M4)

- `ChainFamilyAdapter.getTransactionDetails(chain, hash)` → `TxDetails` (serializable, cached 15 s via `cachedTxDetails`).
- EVM: `server/chains/evm/tx.ts` reads transaction, receipt, block, head and the called contract's code in parallel; then token info (multicall), revert reason (replay at block − 1, best effort) and current on-chain prices.
- `server/chains/evm/tx-logs.ts` (pure, unit-tested) interprets only standard events: ERC-20/721 `Transfer`, ERC-1155 `TransferSingle/Batch`, `Approval`, `ApprovalForAll`, and `Deposit/Withdrawal` from the chain's own wrapped coin. Caps: 400 logs, 200 rows.
- Call data is decoded with the browser-safe Transaction Data Decoder module (`modules/tools/tx-decoder/decode.ts`), shared by the tool and the page.
- Page sections are server components (`components/entity/tx-sections.tsx`); the only browser code is `AutoRefresh` for pending transactions.

## 12b. DEX market data (M5.5)

Three layers; only the bottom one depends on the chain or DEX:

```
UI: chart · pools · trades · safety panel            (shared)
Candle builder: trades → OHLCV per timeframe         (shared, pure, unit-tested)
DEX decoders, per chain family:                      (one per DEX design)
  evm/uniswap-v2-style   PancakeSwap v2, Uniswap v2, SushiSwap, QuickSwap…  (factory addresses per chain in config)
  evm/uniswap-v3-style   PancakeSwap v3, Uniswap v3 and forks
  later: evm/uniswap-v4, evm/curve, evm/balancer, evm/solidly, tron/sunswap, solana/*, ton/*
```

- New capability flag `dexMarket` in `ChainConfig.capabilities`; the Market tab shows only where a chain has it.
- Normalized models: `DexPool { chain, address, dex, protocol, token0, token1, createdBlock }`, `DexTrade { pool, txHash, logIndex, blockTime, side, amountBase, amountQuote, priceQuote, priceUsd?, trader }`, `Candle { time, open, high, low, close, volume }`.
- USD prices come from on-chain reference pools (e.g. WBNB/USDT, WETH/USDC); when no reference path exists, prices are shown in the quote token only.
- Stage 1: server reads logs on demand for a bounded block window, caches per pool (~15 s) and serves everyone from the same cache; only new blocks are read on refresh. Hard caps on blocks and log count per request protect the RPC quota.
- Stage 2: a background indexer writes trades and candles to Postgres (raw trades kept for a limited period, candles long-term); the API and UI do not change.
- Chart: TradingView Lightweight Charts, dynamically imported on the Market tab only, attribution logo kept on.
- Never shown: guessed prices, unsupported pool types as if complete, buy/swap buttons, promoted tokens.

## 13. Performance budget

Checked automatically in `tests/e2e/foundation.spec.ts` on `/en`, `/en/tools`, a tool page and settings:

- JavaScript ≤ 650 KB uncompressed per page (M2.5: home ≈ 510 KB uncompressed / 157 KB gzipped, heaviest tool page ≈ 580 KB / 178 KB; most of it is the React/Next.js runtime. An earlier "≈ 120 KB gzipped" M1 figure was a measuring error).
- CSS ≤ 72 KB uncompressed, one shared cached file (M1: ≈ 9 KB gzipped; M4: 62 KB raw ≈ 11 KB gzipped; raised from 60 KB at M4).
  Rules: no new always-loaded client library without a measured reason; wallet SDKs load only when the user opens the connect dialog (verified by `tests/e2e/wallet.spec.ts`); charts and heavy widgets are lazy-loaded.
