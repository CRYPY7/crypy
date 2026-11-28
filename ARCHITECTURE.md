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

Global navigation: header "All tools" menu (grouped, searchable, recent tools), Ctrl+K tool palette, mobile bottom tab bar (Home, Tools, Learn, Portfolio, Alerts; Settings is in the footer).

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

- 12 locales registered: en (default), wave 1 `es`, `pt-BR`, `zh-CN`, `ru`, `tr`, `vi` (owner decision 2026-11-23), and
  later `ur`, `ar` (RTL), `hi`, `fr`, `de`. Each has a status in `src/i18n/locales.ts`:
  - `complete`: indexed (sitemap, hreflang) and offered by language detection;
  - `beta`: fully translated, in the language menu and footer, shows the "Beta translation" notice, `noindex`, not
    in the sitemap or hreflang, never auto-detected; becomes `complete` after a native speaker's review;
  - `planned`: hidden (reachable by URL for testing only).
- Localized routes, `hreflang`, cookie → Accept-Language → en.
- One dictionary per locale (`messages/<locale>.json`), deep-merged over English so missing keys fall back; ESLint `i18next/no-literal-string` blocks hard-coded UI text.
- `pnpm i18n:check` (`scripts/check-translations.ts`, `messageShape()`): no unknown or wrongly typed keys anywhere; a
  `beta` or `complete` locale must have every key except `admin.*` (the admin dashboard stays English); each
  translation must keep English's placeholders, plural/select arguments, rich-text tags and list lengths (a locale may
  add plural categories its grammar needs, such as Russian few/many, inside plural arguments).
- Learn guides: one JSON file per guide and locale in `src/content/learn/<locale>/`, bundled by that folder's
  `index.ts` and registered in `src/content/learn/index.ts` (`texts`). A translation must keep English's section ids,
  block types, list lengths, link targets and bold marks; search title ≤ 60 characters ending "| CRYPY", description
  ≤ 160 (unit-tested). A missing translation shows the English guide with a notice. Reading time counts each Chinese
  character as half a word.
- Translations are resolved on the server (`next-intl/server` with `next/root-params`); client components receive ready-made strings as props, so no i18n code ships to the browser.
- Pages are built in advance only for `builtLocales` (complete + Beta); hidden (planned) locales render on request.
- `src/proxy.ts` redirects un-prefixed URLs using the saved `NEXT_LOCALE` cookie, then `Accept-Language`, choosing only `complete` locales. Unreviewed locales are reachable by URL for testing, show a notice and are `noindex`.
- RTL via logical utilities; `TechnicalText` for addresses/hashes of every family.
- bigint-safe amounts with per-asset decimals; `Intl` formatting.
- Fonts: Inter (all subsets self-hosted, incl. Cyrillic and Vietnamese) for text; Space Grotesk headings, switched to Inter for Russian (`:root:lang(ru)`, no Cyrillic in Space Grotesk); Chinese uses system fonts. Later: Urdu Nastaliq for text, Naskh for tables.
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

- No seed phrase / private key fields; no auto signing. The only transaction CRYPY ever prepares is a revoke (M6),
  built in the browser by `src/wallets/evm/revoke.ts` and signed only in the user's wallet (see §10b). The only
  message CRYPY ever asks to sign is the sign-in message (M8, see §10c).
- Secrets server-only (`src/server/*` imports `server-only`); only `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` public (domain-restricted to crypy.org + localhost in Reown).
- CSP `connect-src` lists only the RPC hosts and WalletConnect/Reown services in use; add a host there when adding a provider the browser talks to.
- Result pages that call providers are rate-limited per visitor (`page-guard.ts`), `noindex` and disallowed in robots.txt.
  `pageAccess()` returns `ok | limited | crawler`: known crawlers and scripted clients (`lib/crawler.ts`, by user
  agent; empty counts as scripted) get a notice and no lookups at all, so a bot that ignores robots.txt costs nothing.
- zod validation; family-specific format/checksum validation in adapters.
- Rate limiting, security headers, plain-text rendering of third-party strings, allow-listed explorer links.
- Each new family gets a security review before going live.
- Brand protection: publish the official domain prominently; consider registering common look-alike domains to reduce phishing impersonation.

### 10b. Revoke security review (M6, 2026-11-21)

| Check                                                                                                                                        | How it is enforced                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only three transaction shapes: `approve(spender, 0)`, `setApprovalForAll(operator, false)`, Permit2 `approve(token, spender, 0, 0)`; value 0 | `buildRevoke` + `assertRevoke` decode the final calldata again and re-encode it; anything else throws (unit-tested, incl. `transfer` with the same shape, non-zero amounts, other spender, extra bytes, value)    |
| Only one module may ask the wallet to send or sign                                                                                           | ESLint `no-restricted-imports` on wagmi hooks and on `wagmi/actions` / `@wagmi/core` signing actions, allowed only in `revoke-runner.ts`; a unit test scans `src/` for any signing call or method name outside it |
| Connected account must be the wallet that gave the approval                                                                                  | `runRevoke` stops with "Switch to the right account" otherwise; the page is read-only for other wallets                                                                                                           |
| Right network                                                                                                                                | wallet asked to switch (no signature); refused → nothing sent                                                                                                                                                     |
| The exact transaction is tested before the wallet opens                                                                                      | `eth_call` from the owner; failure → the wallet is not opened                                                                                                                                                     |
| The user sees what the wallet will show                                                                                                      | contract, function with arguments, value 0, estimated fee                                                                                                                                                         |
| Result verified                                                                                                                              | after the receipt, the allowance is read again at the receipt's block                                                                                                                                             |
| Several revokes                                                                                                                              | one at a time, one wallet confirmation each, stoppable; one-signature batch revoke is a paid tool later                                                                                                           |
| Checking never needs a wallet; nothing is signed on page load                                                                                | browser tests with a recording fake wallet: no signing method on load, `eth_sendTransaction` only after the click, with the zeroing call                                                                          |

Approval data: GoPlus approval lists are leads only; CRYPY also checks every held token against known spenders
(routers, aggregators, Permit2), apps' allowances inside Permit2, and recent Approval events of held tokens. Every
allowance shown is read on-chain at one block. Spender type (wallet / delegated wallet / contract) is read on-chain;
names come only from CRYPY's own list; source status from Sourcify.

### 10c. Sign-in security review (M8 Part 2, 2026-11-22)

| Check                                                                | How it is enforced                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Only a plain-text message, never a transaction, typed data or permit | `sign-in-runner.ts` is the only module besides `revoke-runner.ts` allowed wallet actions, and ESLint allows it only `signMessage`; a unit test scans `src/` and checks it has exactly one `signMessage(` call            |
| Nothing is signed without a click                                    | browser test with a recording fake wallet: no `personal_sign` on load or connect; one after the click                                                                                                                    |
| The text names this site and says it isn't a transaction             | `buildSignInMessage` / `checkSignInMessage` (shared): domain and origin must match the page (browser) and the request host (server); fixed statement; no extra resources, request id or not-before; rebuilt and compared |
| Replay                                                               | one-time code stored on the server, deleted before the signature is checked; message valid 10 minutes                                                                                                                    |
| Smart-contract wallets                                               | `verifyMessage` locally, then ERC-1271/6492 through the chain's client                                                                                                                                                   |
| Session                                                              | 32 random bytes in an httpOnly, SameSite=Lax cookie (Secure on https), 30 days; the database holds only its SHA-256; sign-out and account deletion remove it                                                             |
| Cross-site requests                                                  | every changing request needs `Origin` host = `Host`; tested (403)                                                                                                                                                        |
| Abuse                                                                | `authLimiter` 20/min, `accountLimiter` 60/min per visitor; 10-item limit checked with a row lock                                                                                                                         |
| Data kept                                                            | wallet address (CAIP-10), watchlist, session dates; no email, no IP; download and delete at any time                                                                                                                     |

### 10d. Security review before launch (M9, 2026-11-22)

Reviewed: every API route (24), sign-in and sessions, revoke (§10b), alerts and the Telegram bot, outbound requests,
logs, headers, raw HTML, SQL, redirects and dependencies.

| Finding                                                                                                                              | Fix                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limits used the **first** `X-Forwarded-For` entry, which the visitor chooses: a script could get a fresh limit on every request | `clientKey`: `X-Real-IP` (set by nginx / Vercel), else the **last** `X-Forwarded-For` entry; IPv6 counted per /64. nginx must set `X-Real-IP $remote_addr`                                  |
| Request bodies were read whole (`request.json()`) before any size check; the Origin check doesn't stop scripts                       | `server/http/body.ts` `readBodyText` / `readBodyJson` stream the body and stop at a cap (2–48 KB per route; batch 16 KB). All 7 routes with a body use it. nginx `client_max_body_size 64k` |
| Behind nginx the app sees `http`, so the session cookie would have lost `Secure` in production                                       | `isHttps`: request protocol, `X-Forwarded-Proto: https`, or an https `NEXT_PUBLIC_SITE_URL`                                                                                                 |
| `GET /auth/session`, `POST /auth/sign-out`, `DELETE /account` had no rate limit                                                      | `sessionLimiter` (120/min), `authLimiter`, `accountLimiter`                                                                                                                                 |
| Error messages logged by the alerts worker and bot could include provider URLs with keys (viem errors print the request URL)         | `server/redact.ts`: every URL keeps only scheme and host; Telegram tokens removed; used by the worker, bot, start-up and network-error logs                                                 |
| A Telegram chat could try link codes without limit (8 characters, 10 minutes: not guessable in practice)                             | at most 10 `/start CODE` tries per chat per 10 minutes                                                                                                                                      |

Checked and fine: zod or strict parsing on every input; same-origin check on every changing request; SameSite=Lax,
httpOnly cookie with only its hash stored; Drizzle parameters only (no raw SQL); `dangerouslySetInnerHTML` only for
our own static scripts and JSON-LD with `<` escaped; redirects only to paths we build; Telegram mute buttons scoped
to the chat's own account; `TELEGRAM_API_URL` limited to Telegram or this machine; no CORS headers (API readable by
our pages only); `Cache-Control: no-store` on every API answer; provider answers capped at 32 MB; secrets only in
`src/server` (`server-only`).

Accepted (documented):

- `script-src 'unsafe-inline'`: needed for static pages without nonces (Next.js inlines its page data). React escapes
  all text, and no third-party text is ever put into raw HTML.
- `pnpm audit --prod`: zod 3 inside WalletConnect's browser code (our own validation uses zod 4.6.7, patched) and
  minimatch inside the shadcn CLI (used at build time only). Neither handles visitor input on our server.
- Rate limits and the Alchemy/GoPlus pacing are kept in memory: right for one server; a shared store is needed with
  several.

Updates without a gap (B-023): the app runs as `crypy@<port>` (template from `app-unit.sh`, ports 3000 / 3001, build
folder per instance in `.crypy-instance-<port>.env`); `update.sh` starts the new build on the other port, switches the
nginx upstream (`.crypy-port`) with a graceful reload once it answers and has been warmed up (each page type opened
with no user agent, i.e. as a crawler with no lookups, and each API with invalid input), then stops the old one. Only the process named
in `.crypy-worker` runs the background worker (`server/worker-owner.ts`).

Builds (B-019): `.github/workflows/server-build.yml` builds `.next-a` and `.next-b` in `/opt/crypy/app` on GitHub and
publishes them as pre-release `build-<commit>` with SHA-256 files and `crypy-build-env` (commit and `NEXT_PUBLIC_`
values); `update.sh` downloads and checks them, and builds on the server only as a fallback (`CRYPY_BUILD_HERE=1`).

Implemented by `scripts/server/setup.sh` and `nginx-site.sh` (M9 Part 3: HTTP/2, `/_next/static` served by nginx from
disk with year-long immutable caching, upstream keep-alive, https and apex redirects; behind Cloudflare the visitor
address comes from `CF-Connecting-IP` only for Cloudflare's ranges; certificates by webroot); `CRYPY_PREVIEW=1` adds `X-Robots-Tag: noindex, nofollow` and a
disallow-all robots.txt until the official launch. Launch requirements for the VPS (nginx in front of `next start`): TLS; `proxy_set_header Host $host`,
`X-Real-IP $remote_addr`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto $scheme`;
`client_max_body_size 64k`; the app listening on 127.0.0.1 only; `.env` readable by the app user only; PostgreSQL
not exposed to the internet.

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
DATABASE_URL=                 # M8: real PostgreSQL (production); empty = PGlite in .data/pglite
PGLITE_DIR=                   # M8: PGlite folder, or "memory" (browser tests)
CRYPY_FAULT_CHAINS=           # S2 outage drill, staging only: chains treated as down
CRYPY_FAULT_FILE=             # S2 outage drill for browser tests (chain or chain:address per line)
TELEGRAM_BOT_TOKEN=           # M8 Part 3: alerts bot (server-only)
CRYPY_WORKER=                 # M8 Part 3: "off" stops the checker and the bot
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
- Unknown addresses answer 404 (SEO Phase 1): `/<locale>/tools/<unknown>` and `/<locale>/learn/<unknown>` are
  rewritten to the not-found page with status 404 in `proxy.ts` (the streamed route itself would already have sent
  200), and `app/[locale]/[...missing]` shows CRYPY's own not-found page for every other unknown address.
- The browser's native popover with CSS anchor positioning is used for the language menu; browsers without anchor positioning show it centred.

---

## 10a. Blockchain providers and prices (zero API cost)

- `server/chains/evm/providers.ts`: provider list per chain (Alchemy → `ETH_RPC_URLS`/`BSC_RPC_URLS` → public nodes) behind viem `fallback`; every transport is metered (Alchemy compute units per method; requests for others) against a daily budget and refuses once it is used, so the fallback moves on. Usage lives on `globalThis` (one meter per process); a Redis store replaces it at launch.
- `server/chains/evm/providers.ts` also skips a provider for 60 s after a timeout, network error, HTTP 5xx or 429 (never after an RPC answer such as a revert); per-request limit 5 s.
- Provider order is not fixed: `rankedFallback` orders providers per request by measured response time (moving average,
  10-minute memory, starting estimates Alchemy 300 ms / extra 350 ms / public 450 ms) and hedges a slow provider by also
  asking the next one after 2.5× its expected time (0.7–2.5 s). Reverts are thrown at once (viem `shouldThrow`).
  Batches: up to 20 per call for Alchemy, 3 for others (free-plan limits). `archiveClient(chain)` (Alchemy only) serves
  reads at old blocks.
- `server/chains/evm/prices.ts` + `dex.ts`: on-chain USD prices. Round 1 finds pools (v2 `getPair`, v3 `getPool` per fee tier) against stablecoins and the wrapped native coin; round 2 reads quote-side balances and v2 balances / v3 `slot0`. Stablecoins = $1; wrapped native priced from stablecoin pools first; deepest pool ≥ $5,000 quote side wins.
- Alchemy per-second budget (`server/chains/evm/alchemy-pace.ts`): one token bucket of 250 CU/s per server process
  for every chain (the free plan allows 300 CU/s per account). `meteredHttp(provider, timeout, pace)`: "skip" inside
  a rotation with other providers (no budget → `AlchemyBusyError`, next provider at once, no cool-down), "wait"
  where Alchemy is the only source (archive client, health checks; up to 3 s). Alchemy-only HTTP calls (token list,
  transfers) use `waitForAlchemy`; reservations may put the bucket into debt, so they go before ordinary reads.
  An Alchemy 429 pauses it for 2 s instead of the 60 s outage cool-down. Outage rest is per method (S3,
  `restAfterFailure`): a timeout, malformed answer or 5xx rests only that provider+method for 60 s; a connection
  failure, a 429 from a free node, or a second method failing within the minute rests the whole provider. GoPlus
  answers are saved in `saved_results` (`goplus-token` reused < 1 h, `goplus-approvals` < 5 min; 24 h fallback).
  `scripts/providers/map.mjs` (`pnpm providers:map`) measures each provider's capabilities (batch size, old blocks,
  event ranges, wallet-wide searches); host names only. With several server processes, each has its
  own bucket: lower `ALCHEMY_CU_PER_SECOND` accordingly or move it to the shared Redis store.
- Provider health (`server/chains/evm/provider-health.ts`, S3): `meteredHttp` records each sent request's outcome
  (ok incl. a node's own error answer, failed, limited, refused) per provider URL in 5-minute buckets (one hour,
  in memory); `providerHealthTable` (`server/health/admin.ts`) adds `restingNow` and feeds the /admin table.
- Heavy checks (`server/heavy/queue.ts`, S3): `runHeavy(task, priority)` wraps the adapter's `getTokenSecurity` (in
  `tokenSecurityReport`) and `getApprovals` (per chain, in `cachedApprovals`): `HEAVY_MAX_RUNNING` (6) at once, at
  most `HEAVY_MAX_PORTFOLIO` (3) Portfolio safety checks and `HEAVY_MAX_BACKGROUND` (2) background (default inside
  `runInBackground`), pages started first, then Portfolio,
  `HeavyBusyError` past `HEAVY_MAX_QUEUED` (60) waiting or after 2 minutes for background. In memory per process.
- Alchemy daily limit (`alchemy-budget.ts`, pure): (90% of `ALCHEMY_MONTHLY_CU` − units spent earlier this month)
  ÷ days left, at most 2× a normal day; `ALCHEMY_DAILY_CU` fixes it instead. Tiers inside the day: ordinary
  reads in a rotation use Alchemy up to 30%, background work (`server/background.ts`, AsyncLocalStorage: worker
  jobs, lock index at start) up to 50%, visitors' Alchemy-only calls up to 100%; health checks of tools run as
  visitors. Counters are saved every minute in `provider_usage` and added back after a restart (`usage-store.ts`).
- A JSON-RPC answer without a result or an error (`MalformedAnswerError`) counts as an unreachable provider: next
  provider, one-minute rest, one log line per 10 minutes.
- Adapter methods: `getUsdPrices` (keys `native` and lower-case token addresses), `checkProviders`.

## 11a. Balances (M3)

- `ChainFamilyAdapter.getBalances(chain, address)` → `ChainBalances { native, tokens[], coverage }`. EVM: `server/chains/evm/balances.ts` lists tokens with Alchemy `alchemy_getTokenBalances` (100 per page, max 3 pages) and reads metadata by multicall; without Alchemy it checks `ChainConfig.commonTokens` and reports `coverage: "common-only"`.
- B-035 (2026-11-26): with an Alchemy key, tokens come first from `server/chains/evm/wallet-tokens.ts`: Alchemy's
  Portfolio API (`assets/tokens/by-address`, 200 CU per page of 100 across every chain, names and decimals
  included). One shared reading per wallet (all live chains), up to 30 pages; a page waits at most 1.5 s after the
  first page, then shows what arrived (`coverage: "truncated"`, `completing: true`; well-known tokens read directly)
  while the reading continues; the finished list is kept 2 minutes, so the page's own reload (`CheckingNotice`,
  `overview.completing`, cached 1 s) and Portfolio's quiet re-reads (every 4 s, at most 6) get it at once. Tokens
  without usable details are read from the contract. The per-chain `alchemy_getTokenBalances` list stays as the
  fallback (first page failing, budget used, `CRYPY_WALLET_TOKENS=off`) and for background work (alerts checks);
  the balances health check reads one page (`withWalletTokenPages(1, …)`).
- **Pending chains (R3, 2026-11-28):** `pageOverview(address, only, giveUpMs = PENDING_MS)` uses
  `freshSavedOrPending`: with no saved reading, a chain not read within `PENDING_MS` (3 s) is returned in
  `overview.pending` (not in `chains`); its read continues and is kept for the reload; the answer is cached 1 s. Page:
  `CheckingNotice` per pending chain (`entity.freshness.pendingTitle/Body`), card fact "Still reading…", `TotalValue`
  line `totalPending`. Portfolio: `stillReading` follows pending wallets; no snapshot while any chain is pending.
  `overviewForChecks` (Approvals, Activity) passes `Infinity`: they need every chain's holdings. GoPlus token answers
  are reused up to 6 h for priority "portfolio" (`GOPLUS_PORTFOLIO_REUSE_MS`), 1 h otherwise.
- **Token list first view (R2 part 2, 2026-11-28):** the per-chain `alchemy_getTokenBalances` list runs once per
  wallet and chain (`sharedTokenList`, kept `LISTING_KEEP_MS` 2 minutes after it ends; failures not kept), up to
  `MAX_TOKEN_PAGES` (10) or `TOKEN_LIST_BUDGET_MS` (15 s). Page reads wait `FIRST_VIEW_MS` (2 s), then show the
  tokens listed so far plus the well-known tokens with `coverage: "truncated"` and `completing: true`; the page's
  reload gets the finished list. `pageOverview` passes `keep: (h) => !h.completing` to `freshOrSaved`. Background
  reads (`isBackground()`) wait for the whole list.
- **Token registry (R1, 2026-11-27):** table `tokens` (migration `0008_tokens`; chain, lower-case address, name,
  symbol, decimals, `unreadable`, source, spam and price columns for later steps, `used_at`). `server/tokens/registry.ts`
  `tokenDetails(chain, addresses, reader, given?)`: memory (50,000 entries) → database (0.8 s limit) → the chain
  reader for what neither knows; Alchemy's metadata (`given`) is stored as it is; unreadable contracts are asked
  again after 24 h; readable details are never overwritten by "unreadable"; `used_at` written at most daily;
  `pruneTokens` (hourly) deletes tokens unused for 90 days. EVM tools go through
  `server/chains/evm/token-details.ts` `evmTokenDetails` (batched multicalls, 4 at once): balances, transaction
  page, activity (recent-only fallback) and the alerts checker. Not through it: the token page's "is this a token"
  check (needs total supply live), the batch scanner's per-chain token check, the price engine's decimals (moves with
  the price job). Backups leave out the table's data (it refills itself).
- **Stored prices (R1 part 2, 2026-11-27):** `server/tokens/prices.ts` `pricesFor(chain, tokens, livePricer,
{keepTokens})` used by `readChainHoldings`: a stored price under 3 minutes old is used; "no reliable price" (price
  null with a time on the token's row) is remembered 6 hours, never for the chain's well-known tokens; the rest is
  priced live by the DEX engine and stored; if live pricing fails, stored prices up to 1 hour old are used; the native
  coin's price is shared in memory for 1 minute. `server/tokens/price-job.ts` (worker job `prices`, every 3 minutes,
  health check `job:prices`): re-prices up to 300 tokens per chain looked at in the last 7 days whose price is over 2
  minutes old; a token the engine can't price that round keeps its older price. Each fresh chain reading carries
  `readMs` (balances `{balances, prices}`, approvals and activity per chain), shown by `pnpm perf:server`.
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
- **Interpretation (M4.1):** `lib/tx/interpret.ts` turns `TxDetails` into `Interpretation` (kind, evidence, template
  values, flow, sender's changes, failure category). Deterministic and chain-family-neutral: it only reads normalized
  fields (status, transfers, approvals, call). A new family supplies `TxDetails` through its adapter and gets the same
  explanations; family-specific detail stays in its own fields.
- **Known names:** `config/known-contracts.ts` (per chain, live-tested). **Support table:** `config/tx-support.ts`.
- **Views:** both Simple (`components/entity/tx-story.tsx`) and Advanced are server-rendered; `html[data-txview]`, set by
  an inline script from localStorage before paint, shows one. Browser code: view switch, local time, copy buttons,
  `AutoRefresh` for pending.
- **API:** `GET /api/v1/tx/<hash>?chain=&format=json|text|raw[&download=1]` (rate-limited, read-only, nothing stored).
- **Speed:** the EVM reader makes 3 batched network requests per transaction (round 1: tx, receipt, head; round 2: block,
  code, token info, failure replay, price pools + decimals; round 3: pool readings). Past-state reads (failure replay,
  block-time prices) run only for recent blocks or with an archive-capable provider, with 2.5 s limits. Settled
  transactions are cached 5 minutes.
- `TxDetails` also carries `pricesAtTx` (block-time prices when the node has the state), `technical` (chain ID, block
  hash, index, base/priority fee, max fees), `events` (raw, capped 400), `nonceUsed` (pending) and `checkedAt`.

### Transaction Intelligence V2 (M4.2)

- **Data (EVM adapter):** `tx-logs.ts` also decodes protocol events by exact signature into `TxProtocolEvent`
  (pool swap/sync/mint/burn, router reports, Safe, ERC-4337) with log indexes. `tx-reads.ts` adds optional reads in the
  existing rounds: pool tokens/factory then factory verification, allowances (now, and at block − 1 with past state),
  the sender's native balance across the block, and code checks for event parties. Each read has a time limit and
  failing reads leave the field empty.
- **Engine (`lib/tx/`, pure, family-neutral):** `assets.ts` (assets, evidence levels, `weakest`), `actions.ts`
  (actions, permission groups, coverage, parties), `route.ts` (route edges and path search), `interpret.ts` (headline,
  changes, failure). Trust depends on who emitted an event: a pool a known factory lists → protocol; a known router
  marked `reports` in `known-contracts.ts` → reported; anything else → only its standard shape.
- **Other chain families** supply the same normalized fields (transfers, approvals, protocol events, balances) through
  their adapter; their own decoders add protocol events. The UI reads only the engine's output.
- **UI:** `components/entity/tx-intel.tsx` (route, actions, permissions, parties) next to `tx-story.tsx`.

## 12d. Batch Balance Scanner (M4.5; scan jobs since S2 Part A, BATCH_SCANNER_DESIGN.md)

- Browser: `modules/tools/batch-balance/`:
  - `parse.ts` (list parsing, pure) and `results.ts` (values, totals, sorting, CSV, pure);
  - `editor.tsx`;
  - `widget.tsx`: starts a scan job, follows it about once a second (`?since=` returns only new rows), keeps the job id and the list in sessionStorage so a refresh finds it again (labels never leave the browser);
  - `progress.tsx` (boards 56/58) and `results-view.tsx`.

  Picker tokens: `config/batch-assets.ts`.

- **Scan engine** (`lib/batch-scan/engine.ts`, no server code, so the browser mode of Part A.2 reuses it): `scanChain` reads one chain's list through a set of readers.
  - It picks the healthiest reader; "slow down" rests that reader; timeouts and "too big" split the chunk; failures rest the reader with a growing pause.
  - Unread cells are read again elsewhere (3 times).
  - It waits, then "stalled" after 10 minutes, and gives up after 1 hour.
  - It cross-checks a 2% sample (at least 5) with a different reader at the same block, and a third reading settles disagreements.
- **Server readers** (`server/batch-scan/readers.ts`):
  - One per provider from `providersFor`, Alchemy excluded.
  - At most 2 scan requests in flight per provider (`SCAN_IN_FLIGHT`); extra providers stop at 40% of their daily request budget (`SCAN_DAILY_SHARE`).
  - Each reader calls `readBatchBalances` with one multicall request per chunk (`MULTICALL_BYTES`).
- **Jobs** (`server/batch-scan/jobs.ts`, one `ScanManager` per process in `service.ts`):
  - `SCAN_MAX_RUNNING` at once, `SCAN_MAX_QUEUED` in line, one active job per visitor (`clientKey`).
  - `SCAN_MAX_WALLETS` per scan and `SCAN_DAILY_WALLETS` per visitor per UTC day.
  - Tokens are checked first (`decimals()`; a clear failure means "not on this chain"). Prices are read with 3 tries.
  - Results are kept 1 hour after the end; a place in line nobody asks about for 30 minutes is dropped.
  - Lists stay in memory only.
  - Each finished job records a visitor outcome.
  - Runs in the website process for now; moves to the worker service in S4.
- API (`app/api/v1/batch-scans`):
  - `POST /` (same-site, `scanStartLimiter` 10/min; refusals are answers, not errors: `active`, `busy`, `too-many`, `daily-limit`);
  - `GET /{id}?since=N` and `POST /{id}` with `{action}` (`scanPollLimiter` 300/min).

  The older `POST /api/v1/batch-balances` (one batch of 100) stays for retrying single rows and for the S1 audit. A multicall whose calls all failed now throws, so callers try another node.

- **Browser mode** (S2 Part A.2): `modules/tools/batch-balance/browser-scan.ts`, loaded on demand.
  - It runs the same engine with one reader per keyless public node of each chain (`publicRpcUrls`), sharing `lib/batch-scan/read.ts` with the server.
  - The engine gives up after 10 minutes there, and unread rows can be finished by a server job.
  - Prices come from `GET /api/v1/batch-prices` (token contracts only, cached 60 s).
  - The CSP `connect-src` lists every public node (checked by `tests/unit/csp.test.ts`).
  - Lists up to `BROWSER_MAX_ADDRESSES` (10,000); the page merges rows into the table at most every 0.75 s.
- Other chain families plug in by adding a reader for their adapter; the page lists every live chain with the `tokenBalances` capability.

## 12p. Page-change feedback (B-029)

`components/layout/navigation-progress.tsx`, mounted once in the locale layout:

- A capturing click listener marks the clicked sidebar item or bottom tab with `data-nav-pending` (spinner).
- After 150 ms it sets `html[data-navigating]` (the main area fades) and shows the top bar. It ends on the next pathname, or when the address matches (query-only changes), or after 20 s.
- Pointer-over, focus or touch on `a[data-sidebar-href]` or `a[data-intent-prefetch]` calls `router.prefetch` once per page. Result pages are never prefetched.
- Styles are in `globals.css` (`.nav-progress`).

## 12e. Token security (M5)

```
UI (token page Security tab, API)  ← SecurityReport        lib/security/types.ts
lib/security/evaluate.ts (pure)    ← TokenSecurityFacts    one rule set for every chain family
ChainFamilyAdapter.getTokenSecurity                        EVM: server/chains/evm/security/
   token-security.ts  orchestrator, 3 node rounds + cached outside sources
   dex-registry.ts    exchanges per chain (protocol, factory, router, fee tiers, v3 position manager), test size
   pools.ts           pool discovery and reading per protocol (uniswap-v2, uniswap-v3); GoPlus pool leads verified
                      with the pool's own factory
   lockers.ts         lock contracts, vault factories and farms CRYPY recognises, and per-locker lock readers
   locker-index.ts    in-memory index for lockers without a per-token list (Team Finance, UNCX v3); terms re-read live
   lp-holders.ts      holder discovery, classification (Safe, timelock, vault, farm, fee collector…), v3 values
   warm.ts            builds the lock indexes at server start (src/instrumentation.ts)
   trade.ts           trade test via eth_call + state override: v2 pools through their router, v3 pools called
                      directly, stablecoin pools after a native → stablecoin hop (contract CrypyTradeTestV3)
   trade-test.ts      the contract's runtime bytecode, ABI and source hash
   source.ts          owner powers from verified Solidity source (names, who may call, written limits)
   bytecode.ts        selectors, owner-power dictionary, proxy slots, EIP-1167
server/security/external.ts        GoPlus (second opinion, plus pool/holder leads) and Sourcify, cached, fail soft
lib/security/liquidity.ts (pure)   holders → parts (burned, locked, soon, ended, controlled, owner, removable,
                                   unknown, not found); totals weighted by pool value
```

- Evidence classes: verified, simulated, heuristic, external, unsupported. Severity: critical (observed in the trade
  test only), high, medium, low. Headline levels: serious, risks, warnings, none-found — never "safe".
- Trade-test contract: `contracts/security/CrypyTradeTestV3.sol`, built with `scripts/build-trade-test.mjs`
  (solc 0.8.28 via IR, not a project dependency); bytecode in `trade-test.ts` with the source's SHA-256.
  `scripts/verify-trade-test.mjs` runs it against a fee-taking token and a v3-style pool in a local in-memory EVM.
- Adding a chain family: implement `getTokenSecurity` returning the same facts and set the `tokenSecurity` capability.
  Adding an exchange design: a pool reader in `pools.ts`, a branch in the trade-test contract and its `KIND` entry.
- Liquidity holders (M5.1): facts carry each pool's holders (`PoolHolders`: kind, share, locks with end dates,
  multisig threshold, timelock delay, v3 position id) and the share found. Leads from outside providers are only
  addresses to check; every share and date is read on-chain. Adding a locker: a registry entry plus its reader,
  verified by the live test. Free nodes can't serve a pool's full transfer history, so the complete holder list waits
  for CRYPY's own indexer (M5.5 Stage 2); until then the rest is shown as "not found".

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

## 12f. Chain selection on address tools (M7)

- `src/lib/chains/selection.ts`: `ChainSelection` = used | all | pick; `parseSelection` keeps only chains the tool
  supports, in config order (stable links and cache keys); `resolveScope` returns the chains to scan plus the used
  and unused chains left out.
- `src/server/services/chain-scope.ts`: `cachedChainUse` (fresh search lookups — code, sent transactions, coin
  balance — plus the wallet's stored activity map for tokens, R2 below; chains whose check failed or couldn't be
  confirmed count as used) and
  `chainScopeFor(address, capability, ?chains)` — link first, then the `crypy_chains` cookie, then "used".
  `apiChains` does the same for the APIs (no value = all chains, unchanged behaviour).
- Services take an optional chain list: `cachedAddressOverview(address, only)`, `cachedApprovals(owner, only)`,
  `cachedActivity(owner, cursor, only)`.
- UI: `ChainPicker` (client; writes only the link and the cookie) and `ChainScopeBar` (server; scanned line, and
  on safety pages a warning naming used chains that were not checked).

- **Activity map (R2, 2026-11-27):** `server/wallet/activity-map.ts` `walletChains(address)` — the chains where a
  wallet holds tokens. One discovery request for every Alchemy chain (`server/chains/evm/wallet-discovery.ts`,
  Portfolio "Token Balances By Wallet", balances only, at most 2 pages, stops once every chain has a token; counted
  at 1,000 units as `portfolio_balancesByAddress` until measured). Chains it couldn't confirm are checked with the
  well-known-token multicall; if Alchemy fails, every chain is. A failed or unconfirmed check is `unknown` (scanned).
  Stored as saved result kind `wallet-chains` (chain `*`), memory in front; fresh 6 h, then used at once and
  refreshed in the background; a first discovery waits at most 2 s; kept 30 days after the last lookup. Coins, sent
  transactions and code are never taken from the map (always fresh from the lookups), so safety pages see a chain
  the moment the wallet sends a transaction there.

## 12g. More EVM chains (M7)

- Adding an EVM chain: an entry in `config/chains.ts` (CAIP-2, explorer, public nodes, Alchemy network, common
  tokens, capabilities), its viem/wagmi chain, `<CHAIN>_RPC_URLS`, DEX quotes and factories in `server/chains/evm/dex.ts`,
  known contracts, recent-block windows, a badge in `public/chains/`, CSP hosts, and `tests/unit/chains-live.test.ts`.
- Capabilities decide where each tool appears: Base, Arbitrum and Polygon have every capability, including `tokenSecurity`.
- Rollup fees: `TxDetails.l1Fee` (OP-stack receipts) is included in `fee`; `GasFacts.l1Fees` holds the estimated
  Ethereum data fee per action (Base GasPriceOracle `getL1FeeUpperBound`, Arbitrum `ArbGasInfo.getPricesInWei`).
- Finality: `TxDetails.finalized` from the node's `finalized` block; block-count fallbacks only for non-rollups.

## 12i. Outbound requests: cap, size limit, HTTP/1.1

- `server/http/limit.ts` `limitedFetch`: every outbound request (viem transports via `fetchFn`, Alchemy token and
  transfer lists, GoPlus, Sourcify) shares one cap, `MAX_IN_FLIGHT` = 32 per server process. Added after a native Node
  abort on Windows under heavy parallel load. With several server processes, each has its own cap.
- Answers over `MAX_RESPONSE_BYTES` (32 MB) are cut off as a failed request and logged once per host and JSON-RPC
  method (a body parsed as JSON in one piece can't be interrupted; provider data is untrusted).
- `server/http/agent.ts` `preferHttp1()` (run from `instrumentation.ts` at start): Node 26's fetch (undici 8) would use
  HTTP/2 with providers that offer it; under load on Windows that crashed the server (memory +11 GB in seconds, main
  thread stuck in native code, 0xC0000409). The global dispatcher(s) (`Symbol.for("undici.globalDispatcher.N")`; in
  undici 8, slot 2 holds the agent and slot 1 a wrapper around it) are replaced with the same classes and
  `allowH2: false`. `CRYPY_HTTP2=on` keeps the default for diagnosis.
- Opt-in diagnostics (`CRYPY_DEBUG_MEMORY=1`, `server/diagnostics.ts`): memory every 30 s and on sudden growth, the
  computer's free memory falling fast, and a watchdog worker thread that, when the main thread stops answering for
  3 s, writes the requests in progress and (if it can pause it) the JavaScript stack to
  `.crash-reports/blocked-main-thread.txt`.
- `TOKEN_LIST_BUDGET_MS` (5 s) bounds Alchemy's sequential token-list paging; a cut-off list still reads each chain's
  well-known tokens directly and prices them first.

## 12h. Portfolio (M8 Part 1)

- Client-only state: `lib/portfolio/storage.ts` (versioned `localStorage` record, defensive parser, 20-wallet cap,
  "since you last looked" snapshot kept ≥ 1 hour), read through `useSyncExternalStore` so tabs stay in step.
- Input safety: `lib/portfolio/input.ts` refuses seed phrases and private keys before anything is stored or sent;
  strict EIP-55 check for mixed-case addresses; label cleaning.
- Maths: `lib/portfolio/combine.ts` (pure, unit-tested). Cross-chain merging only for each chain's coin and tokens in
  `config/batch-assets.ts`; everything else is keyed by chain + contract.
- Server: `server/services/portfolio.ts` → `GET /api/v1/address/{address}/portfolio` = cached overview on the
  wallet's used chains; `?part=safety` (B-034, its own request) = approvals summary (timeout 45 s) + GoPlus flags on
  the top 8 non-listed tokens (timeout 35 s), both at GoPlus and heavy-line priority "portfolio". Counted as
  `portfolio` and `portfolio-safety` in visitor outcomes. `portfolioLimiter` 60/min. The browser reads balances 4
  wallets at a time and safety 2 at a time, after each wallet's balances; an older answer never replaces a newer one.
  Complete safety results are kept in the browser for 6 hours (`lib/portfolio/safety-cache.ts`, key
  `crypy.portfolio.safety`, owner decision 2026-11-26), with "Checked … · Check again" per wallet.
- GoPlus pace (`server/security/goplus-budget.ts`, S3): a token bucket of 30 calls a minute, burst 10;
  `waitForGoPlusSlot(priority)` waits in a line (pages first up to 4 s; "portfolio" next up to 30 s, never the last
  2 slots, ≤ 15 a minute; "background" behind them up to 20 s, never the last 4 slots, ≤ 8 a minute); 60 s pause on a limit answer refuses waits that can't outlast it; one log line
  per minute with counts. `goPlusToken`, `goPlusApprovals`, `cachedApprovals` and the adapter's `getApprovals` take
  the priority. In memory per process (a shared store is needed with several servers).
- `modules/tools/portfolio/widget.tsx` is a thin client shell that lazy-loads `tracker.tsx`, so route prefetches
  from the header and tab bar don't add the portfolio code to other pages.

## 12j. Accounts and Watchlist (M8 Part 2)

- Database: `server/db/schema.ts` (Drizzle), `server/db/client.ts` → `getDb()` opens `pg` when `DATABASE_URL` is set,
  else PGlite; runs `drizzle/` migrations on first use. New migrations: edit the schema, `pnpm db:generate`.
- Auth: `lib/auth/sign-in-message.ts` (shared rules), `server/auth/session.ts` (codes, sign-in, sessions),
  `server/auth/request.ts` (same-site check, cookie). Routes under `/api/v1/auth/*` and `/api/v1/account*`.
- Watchlist: `lib/watchlist/rules.ts` (zod rules and defaults, 10 items), `server/services/watchlist.ts`,
  `/api/v1/watchlist` and `/api/v1/watchlist/{id}`. Watch items keep `chain` empty for addresses (every chain).
- UI: `modules/tools/watchlist/widget.tsx` lazy-loads `panel.tsx`; the personal part loads only in the browser after
  the session check. Tool status `beta` = working page with a named missing part (sidebar label "Beta").
- Single-server for now: the background checker (Part 3) runs in the always-on server process.

## 12k. Alerts (M8 Part 3)

- **Worker** (`server/alerts/worker.ts`, started from `instrumentation.ts`; `CRYPY_WORKER=off` stops it): checker
  every 60 s, delivery every 10 s, housekeeping hourly, Telegram bot. One server process per database and bot token.
- **Checker** (`server/alerts/checker.ts`):
  - Per chain: cursor in `checker_cursors`, confirmations per chain, at most 15 min of catch-up.
  - `eth_getLogs` with topic lists (≤ 100 wallets per query): Transfer from / to, and Approval / ApprovalForAll /
    Permit2 Approval by owner. Through `logsClient` (every provider except Alchemy); step 25–100 blocks, adaptive.
  - Coin balances via Multicall3 `getEthBalance`, remembered in memory. Changes explained by
    `coinTransfersInRange` (Alchemy).
  - Token details and prices (`getOnchainPrices`); `getTransaction` only where the sender matters; approvals
    confirmed on-chain.
  - Hourly: `addressOverview` (uncached) for value drop; `tokenSecurityReport(…, "background")` for security and
    liquidity snapshots in `watch_items.state`.
  - `checkerStatus()` per chain is shown on the page.
- **Rules and text** (pure, `lib/alerts/`): `events.ts` (decoding), `build.ts` (who gets what; spam rules; hourly
  comparisons), `format.ts` (Telegram HTML with escaping, buttons, summary), `quiet.ts`.
- **Delivery** (`server/alerts/deliver.ts`): `alerts` table (dedupe key per user; statuses queued / sent / muted /
  no-channel / failed), quiet hours per user, summary above 5, about 1 message per second per chat, 403 →
  Telegram unlinked.
- **Telegram** (`server/telegram/api.ts`, `bot.ts`, `server/services/telegram.ts`): token server-only
  (`TELEGRAM_BOT_TOKEN`); long polling; link codes hashed, 10 minutes; `/start`, `/stop`, mute callbacks scoped to
  the chat's own account. `TELEGRAM_API_URL` may only point to Telegram or to this machine (tests).
- **APIs:** `GET /api/v1/alerts` (settings, history, bot, checker), `POST|DELETE /api/v1/alerts/telegram`,
  `POST /api/v1/alerts/telegram/test`, `PATCH /api/v1/alerts/settings`, `GET|PUT|DELETE /api/v1/portfolio`,
  `PATCH /api/v1/watchlist/{id}` with `muted`.
- **Tests:** browser tests use a stand-in Telegram server (`tests/e2e/fake-telegram.ts`, `CRYPY_FAKE_TELEGRAM=1`).

## 12l. Learn guides and SEO (SEO_ROADMAP.md)

- **Content:** one JSON file per guide and language, `src/content/learn/<locale>/<slug>.json` (types in
  `src/content/learn/types.ts`); the index (`src/content/learn/index.ts`, server-only) holds each guide's topic,
  tool, related guides and dates, and falls back to English for a missing translation. `slugs.ts` lists the slugs
  alone for the request proxy (404 for unknown guides) without loading any text.
- **Safe rendering:** guide text is plain text with two marks (`**bold**`, `[label](tool:<id>)` / `(guide:<slug>)`),
  turned into React elements by `components/learn/inline-text.tsx`; no HTML is ever injected, and links can only point
  inside CRYPY. A unit test checks every link target, lengths of search titles and descriptions, and the structure.
- **Pages:** `/learn` and `/learn/<slug>`, static; Article, BreadcrumbList and FAQPage structured data; in the
  sitemap with each guide's real update date. Tool pages link to their guides and to related tools
  (`config/related-tools.ts`).
- **SEO guards:** `tests/e2e/seo.spec.ts` checks every sitemap page (title 15–60, description 110–160, one H1,
  canonical, structured data, no duplicate titles). Search titles and descriptions are separate from on-page names
  (`tools.<id>.seoTitle` / `seoDescription`, `seo.*`, `learn.seo*`). IndexNow runs after each server update.

## 12m. Indexable data pages (SEO Phase 3)

- `config/seo-pages.ts`: readable chain names for links (`bsc` → `bnb-chain`) and the curated token list (each chain's
  `commonTokens`, 10 per chain).
- Gas by chain: `app/[locale]/gas/[chain]` renders `GasTrackerWorkspace` with `only` (the client filters the shared
  12-second refresh to that chain) plus per-chain text from `gasChain.chains.<key>`.
- Token checks: table `token_checks` (id `<chain>:<lower-case address>`, report JSON, `checked_at`);
  `server/services/token-checks.ts` (`dueTokens` pure order, `runDueTokenChecks` 4 per round, `savedCheck`,
  `allSavedChecks`); the alerts worker runs a round every 10 minutes (`CRYPY_WORKER_SKIP=token-checks` turns it off;
  browser tests do). Reports come from `tokenSecurityReport(…, "background")`; pages only read the table.
- `components/entity/token-security.tsx` exports `TokenSecurityReportView` (any report) next to
  `TokenSecuritySection` (fetches the live one), so saved and live checks render the same.
- `app/sitemap.ts` is built per request (`connection()`), listing token pages only once a check is saved.

## 12n. Health checks, status page and admin dashboard (M9 Part 5)

- `lib/health/checks.ts`: every check (`id`, `group`, `everyMs`, `slowMs`) and every public status component, which
  lists the checks it needs (`checks`: worst of them) or alternatives (`someOf`, one per chain: down only when all are
  down). Shared by server and pages; no secrets or provider names.
- `lib/health/status.ts` (pure): check state from its newest results, component state, UTC daily bars, uptime share.
- `server/health/probes.ts`: one function per check; returns normally (passed; `"slow:<reason>"` marks it slow),
  throws (failed) or throws `Skip` (not set up here). Tool checks call the same adapters and services as the pages,
  uncached, with fixed public test data. `server/health/jobs.ts`: worker job heartbeats (the worker's `every` records
  each run), so job checks cost nothing.
- `server/health/runner.ts`: `dueChecks` (pure; tool checks capped at 2 per round, longest-waiting first),
  `runProbe` (25 s limit, keys removed from reasons), `runHealthRound` (worker, every 5 minutes; saves one row per
  check to `health_checks`), `pruneHealthChecks` (hourly housekeeping, 90 days), `publicStatus` (states and bars
  only) and `recentResults` (the admin dashboard will show reasons from it).
- Pages read saved rows only; opening them never calls a provider. A status page on the same server can't report
  the server being down: an external free uptime monitor covers that.
- **Status page** `app/[locale]/status` (`publicStatus` + `publicUpdates`; dynamic part behind `connection()`).
  Components whose own checks aren't set up on a server show "not checked", never "working" on the strength of the
  shared website and database checks.
- **Admin** `app/[locale]/admin` (`noindex`, robots-disallowed): `server/admin/auth.ts` (`adminAccessFromCookies`,
  `adminAccessFromRequest`: SIWE session + `ADMIN_WALLETS`), `server/health/admin.ts` (`adminHealth`: checks with
  reasons, 24-hour pass rate, provider usage, `server/health/counters.ts` daily counts, database size, uptime),
  `components/admin/admin-client.tsx` (sign-in through the existing wallet sign-in, sign-out, update form). Status
  updates: table `status_updates`, `lib/health/updates.ts` (zod, plain-text cleaning), `server/services/status-updates.ts`,
  `/api/v1/admin/status-updates[/id]`.
- **Owner messages** `server/health/notify.ts`: `transitions` (pure: second failure in a row → problem; pass after a
  failing streak → fixed) and `notifyAdmins` (Telegram chats linked to admin wallets; errors logged with keys removed).

## 12o. Visitor outcomes (stabilization S0)

- `lib/outcomes/classify.ts` (pure): per tool, what a visitor got (`full` / `partial` / `error`) and short reason codes,
  cleaned of addresses, hashes, URLs and long numbers (`cleanReason`); `toolForRoute` for Next.js route patterns.
- `server/outcomes/record.ts`: `observe(tool, run, classify)` wraps the service call on a page or API route, passes the
  result or error through unchanged and counts it in memory per 5-minute bucket; a timer saves every minute (any
  process that counts). Background work calls the services directly, so it is never counted.
- `server/outcomes/store.ts`: `visitor_outcomes` (bucket, tool, counts, total ms, reasons jsonb); upserts add counts and
  merge reasons in SQL; `outcomesSince` for /admin; `outcomeTransitions` (pure) for the owner's Telegram messages,
  run by the worker each minute (`server/outcomes/watch.ts`).
- `instrumentation.ts` `onRequestError`: every error Next.js reports while serving a visitor, counted as "pages".
- `scripts/audit/run.mjs`: the S1 audit against any CRYPY address (read-only).

## 12q. Saved results (stabilization S2, boards 60–61)

- `server/saved/store.ts`: table `saved_results` (migration `0007_saved_results`): kind, subject (address, token or
  "all" for gas), chain, data (jsonb), quality (2 complete, 1 usable but incomplete), saved_at, used_at. `saveResults`
  upserts and never replaces a complete reading with an incomplete one unless it is over a day old; results over
  512 KB aren't saved. `readSaved` returns readings young enough to show (`MAX_AGE_MS`: balances and activity 7 days,
  approvals and token security 6 hours, gas 10 minutes), gives up after 1.5 s, and marks them as looked up.
  `pruneSaved` (hourly housekeeping) deletes rows not looked up for 7 days. No IP or visitor id is stored (owner
  decision 2026-11-24; privacy page says so). Saving and reading never throw.
- Services (page paths only; the health checks and alerts checker use the uncached functions and always see chains as
  they are): `cachedAddressOverview` → `withSavedChains` (readings with prices saved; failed chains filled, `saved`
  map), `cachedApprovals` (complete checks only: GoPlus "ok" and recent events searched), `cachedActivity` (first page
  only; history quality 2, recent-only 1), `cachedTokenSecurity` (saved when GoPlus answered; a thrown check returns
  the saved report with `savedAt`), `cachedGas` (saved at most once a minute per chain; `saved: true`). An answer with
  a missing or saved chain is cached for 1 second only (`cacheLife`), so "Try again" reads again; full answers keep
  their usual lifetimes.
- UI: `components/entity/freshness.tsx` (client): `FreshLine`, `SavedNotice` (amber, per chain), `NotCheckedNotice`
  (grey dashed), `SavedTag`; ages are worked out in the browser (`useSyncExternalStore`, server render shows a neutral
  text). Strings in `entity.freshness`. Used on the address overview (cards, notices, total), approvals, activity,
  token security; gas shows "From N min ago" on the chain card; the Portfolio lists saved chains and skips "since you
  last looked" while any chain is missing or saved.
- Fresh or saved (`server/saved/fresh-or-saved.ts`, 2026-11-25): per key (tool, subject, chain) one fresh read at a
  time, shared; not back within `WAIT_MS` (0.25 s since R2, was 2.5 s) and a saved reading exists → the saved one with `refreshing: true`
  (UI `CheckingNotice`, page reloads after 5 s); the fresh result is kept 60 s only when a page was shown a saved
  reading; failures are never kept. Used by `pageOverview` (per chain), `cachedApprovals`, `cachedActivity` (first
  page) and `cachedTokenSecurity` (CRYPY's saved report or the curated daily check ≤ 6 h). Since R2 (2026-11-28): the
  saved reading is requested before the fresh read starts and whichever arrives first after `WAIT_MS` is used.
  Rule: a "use cache" function must not start, without awaiting it, another "use cache" function or work that calls
  one — Next.js stores the outer result only when every cached function started inside it has finished, so the next
  visitor would wait for the whole background read. Hence GoPlus (token, approvals) and Sourcify use `server/memo.ts`
  (in-memory, lifetime per answer, keyed by priority) instead of "use cache", and Approvals and Activity read holdings
  through `overviewForChecks` (plain, shared one minute). `readChainHoldings` is the
  shared one-chain read; `addressOverview` (health checks, alerts) never uses saved readings.
- Transactions: kind `transaction`, saved only when final or 64+ confirmations; shown with `savedAt` when the read
  throws. `resolveAddressPage`: when no chain answers the lookup, a valid address still opens its page (header search
  and `/search` route there too).
- Outage drill (`server/fault.ts`): `CRYPY_FAULT_CHAINS` (staging: chains down for everyone) and `CRYPY_FAULT_FILE`
  (browser tests: lines `chain` or `chain:address` = down, `slow:chain:address` = 4 s late), both operator-only
  settings; never set in production.
- Date → block (`server/chains/evm/block-time.ts`, B-014): header reads in parallel rounds (newest; block 1 and
  decades back; then the interpolated block ±1, ±8, ±64 steps of 1/256 of the bracket) until two neighbouring
  blocks remain; about 5 rounds.
- Prefetch policy (B-027): links on every page (logo, header, bottom tabs, footer) and related-link lists use
  `prefetch={false}` plus `data-intent-prefetch`: `NavigationProgress` prefetches them on touch, hover or focus.

## 12r. Browser-only utilities U1 (FEATURE_REGISTRY.md)

- `lib/math/decimal.ts`: exact decimals (`Dec` = BigInt units + scale), parse what people type (thousands commas,
  exponents), add/sub/mul, rounded div, pow, Newton root, display with grouping and significant digits for tiny values.
- Calculators: `modules/tools/token-valuation/valuation.ts` and `modules/tools/apy-calculator/compound.ts` (pure,
  unit-tested), own routes, category `calculators`; `tools.<id>.shortName` gives the sidebar a short name.
- Gas: `modules/tools/gas-tracker/manual-fee.ts` + `manual-fee-widget.tsx` under the live tracker (no requests).
- Token decimals: `parseDecimals` and the existing exact `parseAmount` / `formatExact` (`unit-converter/units.ts`).
- QR: `components/entity/address-qr.tsx` (native `<dialog>`, `qrcode` imported on opening, drawn as a React SVG path,
  PNG via canvas); `EntityHeader` takes `idActions`; `address-qr-props.ts` gives strings and EVM networks.
- i18n: `messages/pending-translation.json` lists key prefixes of a batch in progress that may be missing in Beta
  languages (English shows); `scripts/check-translations.ts` counts them. Translations are `DeepPartial` in types.

## 12s. Browser-only utilities U2

- Calculators: `modules/tools/loan-to-value/ltv.ts`, `impermanent-loss/il.ts`, `slippage-calculator/slippage.ts` (pure,
  `lib/math/decimal.ts`), shared field reading in `modules/tools/shared/read-dec.ts`, `NumberField` and `Figure` in
  `shared/ui.tsx`.
- Address formats: `lib/address/other-formats.ts` (`@scure/base` base58 / base58check with viem's sha256, bech32 /
  bech32m), used by the Address Formatter (`status` "other" / "other-invalid").
- Signature decoder: `modules/tools/signature-decoder/decode.ts` (pure; viem `hashTypedData`; names from
  `config/known-contracts.ts`; findings as translated keys, sorted by severity).
- Sidebar: categories in `folded` render as a native `<details>` group; `SidebarActiveMarker` opens the group that
  holds the current page.

## 12t. Browser-only utilities U3 (developer tools)

- Category `developer` (folded in the sidebar; `folded` in `sidebar.tsx` maps a category to its summary icon).
- Hashes: `modules/tools/keccak-hash/hash.ts` (`hashes`, `signatureInfo`; viem `keccak256`, `sha256`, `parseAbiItem`,
  `toFunctionSelector`, `toEventSelector`).
- ABI: `modules/tools/abi-encoder/abi.ts` (`readAbi` with type validation, `coerce`, `encodeCall`, `decodeCall`,
  `decodeLog`; viem `encodeFunctionData` / `decodeFunctionData` / `decodeEventLog`). Prefill from the URL fragment
  `#data=` only (never the query string, so typed data doesn't reach the server or its logs).
- Encodings: `modules/tools/encoding-converter/encoding.ts` (`@scure/base` base58 / base64 / base64url).
- JSON/CSV: `modules/tools/json-csv/json-csv.ts` (formula-safe CSV cells; RFC 4180 reader).
- Shared: `Choice` (radio row) in `modules/tools/shared/ui.tsx`.

## 12u. Browser-only utilities U4

- `modules/tools/signature-verifier/verify.ts` (viem `recoverMessageAddress`, `recoverTypedDataAddress`, `hashMessage`,
  `hashTypedData`); `raw-tx-decoder/raw-tx.ts` (`parseTransaction`, `recoverTransactionAddress`, `fromRlp`);
  `file-hash/checksum.ts` (Web Crypto `crypto.subtle.digest`, published-checksum parser); `bitcoin-fee/fee.ts` (vbyte
  table, exact BigInt sats); `address-book/book.ts` (localStorage `crypy.addressBook`, look-alike rule: same first and
  last 4 characters of the address body, different middle; EVM via `checkWalletInput`, Bitcoin/Solana via
  `checkOtherAddress`).
- Shared `Notice` in `modules/tools/shared/ui.tsx`. Sidebar: `utilities` joins the folded categories.

## 12v. Browser-only utilities U5

- `modules/tools/profit-calculator/profit.ts` (exact `Dec` maths: average cost, profit, break-even after the selling
  fee); `bytecode-compare/bytecode.ts` (a small CBOR reader for the Solidity metadata tail, viem `keccak256`, EIP-1167
  and EIP-7702 patterns, run-length of differing bytes); `nft-uri-decoder/nft-uri.ts` (`data:` URI decoding with
  `@scure/base`, ERC-1155 `{id}` fill, gateway addresses that are never fetched, findings with tones; image previews
  only from `data:image/*` in an `<img>`, allowed by the existing `img-src data:`); `calldata-gas/calldata.ts` (EIP-2028 byte costs, EIP-3860 init-code words, EIP-7623 floor; BigInt only).
- The calldata tool links to the Transaction Data Decoder with `#data=` (fragment, never the query string).

## 12w. Backups (S4)

- `scripts/server/backup.sh` → `/usr/local/sbin/crypy-backup` (root-owned, installed from git HEAD by
  `install-backup.sh`, which `update.sh` and `setup.sh` run; cron in `/etc/cron.d/crypy-backup`).
- Nightly `pg_dump -Fc` (data of `saved_results`, `sign_in_nonces`, `telegram_link_codes` excluded) to
  `/var/backups/crypy` (14 days); then `age` (X25519 public key; the identity is only in the owner's password manager)
  and `rclone` to R2 (remote defined by `RCLONE_CONFIG_R2_*` environment variables from `/etc/crypy/backup.env`, root
  only; `no_check_bucket` so a bucket-scoped token works); upload size checked; R2 copies older than 14 days deleted.
- Weekly restore test into `<db>_restore_test` (`pg_restore --no-owner --exit-on-error`), row counts of the people's
  tables compared with live, then dropped; newest R2 copy listed.
- Status files `/var/lib/crypy-backup/{backup,restore}.json` (world-readable, no secrets), validated with zod and
  judged by `lib/health/backup.ts`; probe `server:backup` (hourly, `CRYPY_BACKUP_STATUS_DIR` overrides the folder)
  feeds /admin and the owner's Telegram messages through the usual health-check transitions.
- Restore: `pg_restore --clean --if-exists --no-owner --role=crypy` (README "Backups").

## 13. Performance budget

Rules added in M9 (accessibility and speed):

- **No layout shift:** content that arrives after the page (live data, browser-only values) gets its space up front:
  loading placeholders for streamed sections are at least one screen tall (`min-h-[100svh]`), the home gas line has a
  reserved height per breakpoint, and browser-only text (local time) renders an invisible same-length placeholder.
- **Formatters:** use `numberFormat()` / `decimalSeparator()` from `lib/format/intl.ts` in anything that runs per
  item; never `new Intl.NumberFormat` in a loop.
- **Accessibility:** `tests/e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA + best practices) on the main pages in both
  themes and fails on any violation. Text boxes without their own outline get a `focus-within` ring on their frame;
  sideways-scrolling regions are focusable (`tabIndex={0}`, `role="group"`, labelled). Light-theme severity colours
  are dark enough for 4.5:1 on their own 14–15% tints.

Checked automatically in `tests/e2e/foundation.spec.ts` on `/en`, `/en/tools`, a tool page and settings:

- JavaScript ≤ 650 KB uncompressed per page (M2.5: home ≈ 510 KB uncompressed / 157 KB gzipped, heaviest tool page ≈ 580 KB / 178 KB; most of it is the React/Next.js runtime. An earlier "≈ 120 KB gzipped" M1 figure was a measuring error).
- CSS ≤ 82 KB uncompressed, one shared cached file (M1: ≈ 9 KB gzipped; M4: 62 KB raw ≈ 11 KB gzipped; raised from 60 KB at M4, to 80 KB at M7 and to 82 KB on 2026-11-25).
  Rules: no new always-loaded client library without a measured reason; wallet SDKs load only when the user opens the connect dialog (verified by `tests/e2e/wallet.spec.ts`); charts and heavy widgets are lazy-loaded.
