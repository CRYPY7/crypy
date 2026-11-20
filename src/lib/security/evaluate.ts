/**
 * Facts → checks. Pure, deterministic, unit-tested, and the same for every chain family.
 * Thresholds are written here once so the page, the API and any future channel (alerts, reports) agree.
 */
import { looksLikeLink } from "@/lib/chains/sanitize";
import type {
  CheckClass,
  Comparison,
  OwnerPower,
  SecurityCheck,
  SecurityReport,
  Severity,
  TokenSecurityFacts,
} from "./types";

/** Tax bands (fractions). */
export const TAX_CRITICAL = 0.5;
export const TAX_HIGH = 0.1;
export const TAX_MEDIUM = 0.05;
/** Below this the measurement is rounding noise. */
export const TAX_NOISE = 0.001;
/** Liquidity in USD below which large trades move the price a lot. */
export const SMALL_LIQUIDITY_USD = 10_000;
/** Owner holding more than this share of LP can remove most liquidity. */
export const LP_OWNER_HIGH = 0.5;
/** Burned + locked share considered "most liquidity is safe from removal". */
export const LP_PROTECTED = 0.9;
/** Pools at least this deep are usually held by many providers: unprotected LP is a note, not a warning. */
export const DEEP_POOL_USD = 100_000;
export const TOP10_HIGH = 0.5;
/** Two tax figures differing by less than this count as the same. */
const TAX_TOLERANCE = 0.01;

const BAIT = /\b(claim|reward|rewards|airdrop|visit|voucher|bonus|gift|free|access|redeem)\b|\$\s?\d/i;

export const pct = (fraction: number) => `${(Math.round(fraction * 1000) / 10).toString()}%`;

function taxSeverity(tax: number): Severity | null {
  if (tax >= TAX_CRITICAL) return "critical";
  if (tax >= TAX_HIGH) return "high";
  if (tax >= TAX_MEDIUM) return "medium";
  if (tax > TAX_NOISE) return "low";
  return null;
}

const LOWER: Record<Severity, Severity> = { critical: "high", high: "medium", medium: "low", low: "low" };
const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);

/**
 * Owner-only powers matter much less once ownership is renounced (unless roles exist).
 * A function found in the code is a capability, not an act: it is never "critical". Critical is kept for what the
 * trade test observed (selling blocked, a sell tax of 50% or more).
 */
const POWER_SEVERITY: Record<OwnerPower, Severity> = {
  mint: "high",
  fees: "high",
  blacklist: "high",
  pause: "medium",
  limits: "medium",
  cooldown: "low",
  upgrade: "high",
  selfdestruct: "medium",
};

export function evaluate(facts: TokenSecurityFacts): SecurityReport {
  const checks: SecurityCheck[] = [];
  const add = (
    id: string,
    group: SecurityCheck["group"],
    status: SecurityCheck["status"],
    severity: Severity | null,
    cls: CheckClass,
    values?: SecurityCheck["values"],
  ) => checks.push({ id, group, status, severity: status === "risk" ? severity : null, class: cls, values });

  // ---------- trading (simulation) ----------
  const trade = facts.trade;
  const venue: Record<string, string> = trade.venue ? { dex: trade.venue.dex } : {};
  switch (trade.outcome) {
    case "ok": {
      add("sell", "trading", "pass", null, "simulated", venue);
      for (const [id, tax] of [
        ["buyTax", trade.buyTax],
        ["sellTax", trade.sellTax],
        ["transferTax", trade.transferTax],
      ] as const) {
        if (tax === null) continue;
        const severity = id === "transferTax" && tax > TAX_NOISE && tax < TAX_HIGH ? "medium" : taxSeverity(tax);
        add(id, "trading", severity ? "risk" : "pass", severity, "simulated", { tax: pct(tax) });
      }
      break;
    }
    case "sell-failed":
    case "approve-failed":
      add("sell", "trading", "risk", "critical", "simulated", { ...venue, reason: trade.reason ?? "" });
      if (trade.buyTax !== null) {
        const s = taxSeverity(trade.buyTax);
        add("buyTax", "trading", s ? "risk" : "pass", s, "simulated", { tax: pct(trade.buyTax) });
      }
      break;
    case "transfer-failed":
      add("transfer", "trading", "risk", "critical", "simulated", { reason: trade.reason ?? "" });
      break;
    case "buy-failed":
    case "buy-nothing":
      add("buy", "trading", "risk", "high", "simulated", { ...venue, reason: trade.reason ?? "" });
      break;
    case "no-liquidity":
      add("tradeTest", "trading", "unchecked", null, "unsupported", { why: "noLiquidity" });
      break;
    case "no-pool":
      add("tradeTest", "trading", "unchecked", null, "unsupported", { why: "noPool" });
      break;
    case "unsupported-pool":
      add("tradeTest", "trading", "unchecked", null, "unsupported", { why: "unsupportedPool" });
      break;
    default:
      add("tradeTest", "trading", "unchecked", null, "unsupported", { why: "error" });
  }

  // ---------- owner and powers ----------
  const owner = facts.owner;
  const ownerActive = owner.owner !== null && !owner.renounced;
  if (owner.owner === null) add("owner", "owner", "pass", null, "verified", { state: "none" });
  else if (owner.renounced) add("owner", "owner", "pass", null, "verified", { state: "renounced" });
  else add("owner", "owner", "risk", "low", "verified", { state: owner.ownerIsContract ? "contract" : "wallet" });

  const adminBurned = facts.proxy.admin !== null && BURN.has(facts.proxy.admin.toLowerCase());
  for (const power of facts.powers) {
    // A detected proxy already reports who can upgrade it.
    if (power.power === "upgrade" && facts.proxy.kind && facts.proxy.kind !== "minimal") continue;
    // Without an active owner (and without roles) owner-only functions can't be used by anyone. A proxy's upgrade
    // is controlled by its admin when it has one.
    const usable =
      power.power === "upgrade"
        ? facts.proxy.admin !== null
          ? !adminBurned
          : ownerActive || owner.roleBased
        : power.power === "selfdestruct" || ownerActive || owner.roleBased;
    let severity: Severity = usable ? POWER_SEVERITY[power.power] : "low";
    // A contract owner is often a timelock, multisig or staking contract: still a power, one step less severe.
    const contractOwner = usable && ownerActive && owner.ownerIsContract === true && power.power !== "upgrade";
    if (contractOwner) severity = LOWER[severity];
    add(`power.${power.power}`, "owner", "risk", severity, "heuristic", {
      functions: power.functions.slice(0, 3).join(", "),
      usable: usable ? (contractOwner ? "contract" : "yes") : "no",
    });
  }
  if (
    facts.powers.filter((p) => !(p.power === "upgrade" && facts.proxy.kind && facts.proxy.kind !== "minimal"))
      .length === 0
  ) {
    add("powers", "owner", "pass", null, "heuristic");
  }

  // ---------- contract ----------
  if (facts.proxy.kind === "minimal") {
    // EIP-1167 clone: forwards to one fixed contract and can never be pointed elsewhere.
    add("proxy", "contract", "pass", null, "verified", {
      kind: "minimal",
      implementation: facts.proxy.implementation ?? "",
    });
  } else if (facts.proxy.kind) {
    add("proxy", "contract", "risk", adminBurned ? "low" : "high", "verified", {
      kind: facts.proxy.kind,
      implementation: facts.proxy.implementation ?? "",
      admin: adminBurned ? "burned" : "active",
    });
  } else add("proxy", "contract", "pass", null, "verified");

  if (facts.source.status === "verified")
    add("source", "contract", "pass", null, "external", { provider: facts.source.provider });
  else
    add("source", "contract", "unchecked", null, "unsupported", {
      provider: facts.source.provider,
      state: facts.source.status,
    });

  // ---------- liquidity ----------
  const pools = facts.pools;
  const main = [...pools].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))[0];
  if (!main) add("liquidity", "liquidity", "risk", "high", "verified", { state: "none" });
  else if (main.liquidityUsd !== null && main.liquidityUsd < 1) {
    add("liquidity", "liquidity", "risk", "high", "verified", { state: "empty", count: pools.length });
  } else {
    if (main.liquidityUsd !== null && main.liquidityUsd < 1) {
      // Reported above as empty pools.
    } else if (main.liquidityUsd !== null && main.liquidityUsd < SMALL_LIQUIDITY_USD) {
      add("liquidity", "liquidity", "risk", "medium", "verified", {
        usd: Math.round(main.liquidityUsd),
        dex: main.dex,
      });
    } else if (main.liquidityUsd !== null) {
      add("liquidity", "liquidity", "pass", null, "verified", { usd: Math.round(main.liquidityUsd), dex: main.dex });
    }
    if (main.lp) {
      const protectedShare = main.lp.burned + main.lp.locked;
      if (main.lp.owner >= LP_OWNER_HIGH) {
        add("lp", "liquidity", "risk", "high", "verified", { owner: pct(main.lp.owner), state: "owner" });
      } else if (protectedShare >= LP_PROTECTED) {
        add("lp", "liquidity", "pass", null, "verified", { protected: pct(protectedShare) });
      } else {
        const deep = (main.liquidityUsd ?? 0) >= DEEP_POOL_USD;
        add("lp", "liquidity", "risk", deep ? "low" : "medium", "verified", {
          protected: pct(protectedShare),
          state: "unprotected",
        });
      }
    }
  }

  // ---------- holders (outside provider only, for now) ----------
  const holders = facts.external?.holders;
  if (holders?.top10 != null) {
    const s: Severity | null = holders.top10 >= TOP10_HIGH ? "medium" : null;
    add("holders", "holders", s ? "risk" : "pass", s, "external", {
      top10: pct(holders.top10),
      provider: facts.external!.provider,
    });
  } else add("holders", "holders", "unchecked", null, "unsupported");

  // ---------- token text ----------
  const name = `${facts.token.name} ${facts.token.symbol}`;
  if (looksLikeLink(facts.token.name) || looksLikeLink(facts.token.symbol)) {
    add("name", "token", "risk", "high", "verified", { state: "link" });
  } else if (BAIT.test(name)) add("name", "token", "risk", "medium", "verified", { state: "bait" });
  else add("name", "token", "pass", null, "verified");

  add("age", "contract", "unchecked", null, "unsupported");

  const counts = { critical: 0, high: 0, medium: 0, low: 0, passed: 0, unchecked: 0 };
  for (const c of checks) {
    if (c.status === "pass") counts.passed++;
    else if (c.status === "unchecked") counts.unchecked++;
    else counts[c.severity!]++;
  }
  const level =
    counts.critical > 0 ? "serious" : counts.high > 0 ? "risks" : counts.medium > 0 ? "warnings" : "none-found";
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  checks.sort(
    (a, b) =>
      (a.status === "risk" ? order[a.severity!]! : a.status === "pass" ? 4 : 5) -
      (b.status === "risk" ? order[b.severity!]! : b.status === "pass" ? 4 : 5),
  );
  return { facts, checks, counts, level, comparison: compare(facts) };
}

/** Where CRYPY and the outside provider both have an answer, do they agree? */
export function compare(facts: TokenSecurityFacts): Comparison | null {
  const ext = facts.external;
  if (!ext) return null;
  const yesNo = (v: boolean) => (v ? "yes" : "no");
  const rows: { id: string; ours: string | null; theirs: string | null; same: (a: string, b: string) => boolean }[] =
    [];
  const eq = (a: string, b: string) => a === b;
  const near = (a: string, b: string) => Math.abs(parseFloat(a) - parseFloat(b)) < TAX_TOLERANCE * 100;
  const tradeRan = !["no-pool", "unsupported-pool", "no-liquidity", "error"].includes(facts.trade.outcome);
  const blocked = ["sell-failed", "approve-failed", "transfer-failed"].includes(facts.trade.outcome);
  rows.push({
    id: "honeypot",
    ours: tradeRan ? yesNo(blocked) : null,
    theirs: ext.honeypot === null ? null : yesNo(ext.honeypot),
    same: eq,
  });
  const taxText = (v: number | null) => (v === null ? null : (Math.round(v * 1000) / 10).toString());
  rows.push({ id: "buyTax", ours: taxText(facts.trade.buyTax), theirs: taxText(ext.buyTax), same: near });
  rows.push({ id: "sellTax", ours: taxText(facts.trade.sellTax), theirs: taxText(ext.sellTax), same: near });
  rows.push({
    id: "mintable",
    ours: yesNo(facts.powers.some((p) => p.power === "mint")),
    theirs: ext.mintable === null ? null : yesNo(ext.mintable),
    same: eq,
  });
  const upgradeable = facts.proxy.kind !== null && facts.proxy.kind !== "minimal";
  rows.push({ id: "proxy", ours: yesNo(upgradeable), theirs: ext.proxy === null ? null : yesNo(ext.proxy), same: eq });
  rows.push({
    id: "blacklist",
    ours: yesNo(facts.powers.some((p) => p.power === "blacklist")),
    theirs: ext.blacklist === null ? null : yesNo(ext.blacklist),
    same: eq,
  });
  if (facts.owner.owner !== null) {
    rows.push({
      id: "renounced",
      ours: yesNo(facts.owner.renounced),
      theirs: ext.ownerRenounced === null ? null : yesNo(ext.ownerRenounced),
      same: eq,
    });
  }
  const shared = rows.filter((r) => r.ours !== null && r.theirs !== null);
  const differences = shared
    .filter((r) => !r.same(r.ours!, r.theirs!))
    .map((r) => ({ id: r.id, ours: r.ours!, theirs: r.theirs! }));
  return { provider: ext.provider, shared: shared.length, agree: shared.length - differences.length, differences };
}
