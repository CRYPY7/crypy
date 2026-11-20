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

/**
 * Who holds a pool's liquidity. v2-style pools: holders of the LP token. v3-style pools: owners of the position NFTs,
 * measured by each position's value.
 */
export type LpHolderKind =
  | "burn" // dead or zero address: gone for good
  | "locker" // a lock contract from CRYPY's registry (one contract, many locks)
  | "vault" // a one-lock vault made by a registered vault factory (confirmed with the factory)
  | "multisig" // Safe: several signers must agree
  | "timelock" // withdrawals wait a fixed delay
  | "farm" // a registered staking contract (many stakers)
  | "exchange" // the exchange's protocol-fee collector (factory feeTo)
  | "owner" // the token's owner
  | "token" // the token's own contract
  | "pool" // the pool itself
  | "wallet" // an ordinary wallet (also EIP-7702 delegated wallets)
  | "contract"; // a contract CRYPY doesn't recognise

export interface LpLock {
  /** Share of the pool (0–1) under this lock. */
  share: number;
  /** Unix seconds when it can be withdrawn; null = no end date. */
  unlockAt: number | null;
  /** Vesting lock: unlockAt is the first release, the rest follows in steps. */
  vesting: boolean;
}

export interface LpHolder {
  address: string;
  kind: LpHolderKind;
  /** Name from CRYPY's registry only (lockers, vault factories, farms); never text read from the chain. */
  name: string | null;
  /** Share of the pool (0–1). */
  share: number;
  /** Lockers and vaults: "read" = every lock was read from the contract; "unread" = the terms couldn't be read. */
  lockRead: "read" | "unread" | null;
  locks: LpLock[];
  multisig?: { threshold: number; signers: number };
  /** Timelock delay in seconds. */
  delay?: number;
  /** v3: the position NFT's id. */
  position?: string;
}

export interface PoolHolders {
  kind: "lp-token" | "positions";
  /** Share of the pool (0–1) whose holder was found and read. The rest is shown as "not checked". */
  found: number;
  holders: LpHolder[];
  /** How the holders were found. */
  sources: ("known" | "goplus" | "recent-transfers" | "lock-contracts" | "positions")[];
}

export interface PoolFact {
  dex: string;
  protocol: string;
  address: string;
  /** v3 fee tier in hundredths of a basis point (3000 = 0.3%). */
  fee: number | null;
  /** False for a pool found through a lead on an exchange that isn't in CRYPY's registry. */
  listed: boolean;
  /** Symbol of the token paired with the scanned token. */
  pairedWith: string;
  /** USD value of both sides; null without a price for the paired token. */
  liquidityUsd: number | null;
  /** null: holders couldn't be read (timeout, unsupported pool design). */
  holders: PoolHolders | null;
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
