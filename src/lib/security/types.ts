/**
 * Token security: chain-family-neutral facts and checks (M5).
 *
 * Layering, so any blockchain or exchange can be added without touching the page:
 *   chain-family adapter  → TokenSecurityFacts   (EVM today: on-chain reads, trade simulation per DEX protocol)
 *   lib/security/evaluate → SecurityReport        (pure rules: facts → checks with severity and evidence class)
 *   UI                    → renders the report    (knows nothing about EVM, DEXes or providers)
 * A family that can't provide a fact leaves it null; the matching check is shown as "not checked".
 */

/** How a result was obtained. Never a "safe" verdict. */
export type CheckClass =
  /** Read directly from the chain (owner, proxy slots, pool reserves, LP balances). */
  | "verified"
  /** Measured by simulating trades in a read-only call. */
  | "simulated"
  /** Inferred, e.g. a function found in the contract's code; it may or may not be used. */
  | "heuristic"
  /** From an outside provider, shown with its name. */
  | "external"
  /** Couldn't be checked here. */
  | "unsupported";

export type Severity = "critical" | "high" | "medium" | "low";
export type CheckStatus = "risk" | "pass" | "unchecked";
export type CheckGroup = "trading" | "owner" | "contract" | "liquidity" | "holders" | "token";

export interface SecurityCheck {
  /** Stable id, also the translation key: entity.tokenSecurity.checks.<id>.<status>. */
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  /** Only for risks. */
  severity: Severity | null;
  class: CheckClass;
  /** Values for the translated sentence (numbers already formatted as plain strings). */
  values?: Record<string, string | number>;
}

// ---------- facts supplied by a chain-family adapter ----------

export type TradeOutcome =
  | "ok"
  /** No pool at all on the exchanges CRYPY checks. */
  | "no-pool"
  /** Pools exist, but none the trade test supports yet (e.g. only v3, or only against a stablecoin). */
  | "unsupported-pool"
  /** A pool exists but holds (almost) nothing. */
  | "no-liquidity"
  | "quote-failed"
  | "buy-failed"
  | "buy-nothing"
  | "transfer-failed"
  | "approve-failed"
  | "sell-failed"
  /** The node couldn't run the simulation (no state override support, timeout…). */
  | "error";

export interface TradeVenue {
  /** Exchange name, e.g. "PancakeSwap v2". */
  dex: string;
  /** Exchange design, e.g. "uniswap-v2". Simulators are registered per protocol. */
  protocol: string;
  pool: string;
  router: string;
}

export interface TradeFacts {
  outcome: TradeOutcome;
  venue: TradeVenue | null;
  /** Test size in the native coin (raw integer string) and its symbol. */
  amountIn: string | null;
  nativeSymbol: string;
  /** Fractions 0–1; null when that step didn't run. */
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
  /** The contract's own error message for the failed step (sanitized text, or a selector). */
  reason: string | null;
}

export type OwnerPower = "mint" | "fees" | "blacklist" | "pause" | "limits" | "cooldown" | "upgrade" | "selfdestruct";

export interface PowerFact {
  power: OwnerPower;
  /** Function signatures found (or "SELFDESTRUCT"). */
  functions: string[];
}

export interface OwnerFacts {
  /** null: the contract has no owner() / getOwner() function we could read. */
  owner: string | null;
  renounced: boolean;
  ownerIsContract: boolean | null;
  /** Role-based access control functions (hasRole) found: owner renouncement may not remove all powers. */
  roleBased: boolean;
}

export interface ProxyFacts {
  kind: "eip1967" | "eip1822" | "beacon" | "minimal" | "zeppelinos" | null;
  implementation: string | null;
  admin: string | null;
}

export interface LpShares {
  /** Fractions 0–1 of the pool's LP tokens. */
  burned: number;
  locked: number;
  owner: number;
  other: number;
}

export interface PoolFact {
  dex: string;
  protocol: string;
  address: string;
  /** Symbol of the token paired with the scanned token. */
  pairedWith: string;
  /** USD value of both sides; null without a price for the paired token. */
  liquidityUsd: number | null;
  /** Only for pools whose LP is a token (v2-style). */
  lp: LpShares | null;
}

export interface SourceFacts {
  status: "verified" | "not-found" | "unknown";
  /** e.g. "Sourcify". */
  provider: string;
}

export interface ExternalHolders {
  count: number | null;
  /** Share held by the 10 largest holders, burn addresses excluded (0–1). */
  top10: number | null;
  ownerShare: number | null;
  creatorShare: number | null;
}

/** A second opinion from an outside provider (GoPlus), kept apart from CRYPY's own checks. */
export interface ExternalFacts {
  provider: string;
  fetchedAt: number;
  honeypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  mintable: boolean | null;
  proxy: boolean | null;
  blacklist: boolean | null;
  openSource: boolean | null;
  ownerRenounced: boolean | null;
  creator: string | null;
  holders: ExternalHolders | null;
}

export interface TokenSecurityFacts {
  chain: string;
  address: string;
  block: string | null;
  checkedAt: number;
  token: { name: string; symbol: string; decimals: number; totalSupply: string };
  /** Native coin price used for liquidity values (USD), when known. */
  priceUsd: number | null;
  trade: TradeFacts;
  owner: OwnerFacts;
  powers: PowerFact[];
  proxy: ProxyFacts;
  pools: PoolFact[];
  source: SourceFacts;
  external: ExternalFacts | null;
  /** Why the outside provider has no answer (rate limit, not listed…), when it doesn't. */
  externalStatus: "ok" | "unavailable" | "not-listed";
}

// ---------- report for the page ----------

export interface Comparison {
  provider: string;
  shared: number;
  agree: number;
  differences: { id: string; ours: string; theirs: string }[];
}

export interface SecurityReport {
  facts: TokenSecurityFacts;
  checks: SecurityCheck[];
  counts: { critical: number; high: number; medium: number; low: number; passed: number; unchecked: number };
  /** Headline level, never "safe". */
  level: "serious" | "risks" | "warnings" | "none-found";
  comparison: Comparison | null;
}
