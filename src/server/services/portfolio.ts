import "server-only";
import { batchAssets } from "@/config/batch-assets";
import { type ChainKey, getChain } from "@/config/chains";
import { logTiming } from "@/server/diagnostics";
import { goPlusToken } from "@/server/security/external";
import { apiChains } from "./chain-scope";
import { cachedApprovals } from "./approvals";
import { type AddressOverview, cachedAddressOverview } from "./overview";

/**
 * One wallet of the Portfolio: its balances on the chains it uses, plus two quick safety signals. Read-only; the
 * Portfolio itself (which wallets, their labels) stays in the visitor's browser and is never sent as a list.
 *
 *  - approvals: how many of its approvals need attention (CRYPY's own approval checks);
 *  - flagged tokens: held tokens that GoPlus reports as a honeypot or with a high sell tax. This is GoPlus's finding,
 *    shown with its name; the token's own page runs CRYPY's full checks. Only the wallet's most valuable tokens are
 *    checked (FLAG_CHECKS), and never well-known tokens from CRYPY's checked list.
 *
 * Both use GoPlus at "portfolio" priority: page reports go first for its free capacity, Portfolio has its own share,
 * and anything skipped is reported as not checked. Balances and safety are separate requests (B-034).
 */
export interface FlaggedToken {
  chain: ChainKey;
  address: string;
  symbol: string;
  reason: "honeypot" | "sell-tax";
  sellTax: number | null;
}

/** B-034: a wallet is read in two parts, so its balances show at once while the safety checks finish. */
export interface PortfolioBalancesReport {
  overview: AddressOverview;
}

export interface PortfolioSafetyReport {
  /** null when the approval check didn't finish in time or failed. */
  /** `partial`: GoPlus's approval list wasn't read on some chain, so approvals found only there may be missing. */
  approvals: { attention: number; chains: ChainKey[]; partial: boolean } | null;
  /** `skipped`: tokens GoPlus couldn't check right now (unavailable, or its free capacity kept for page reports). */
  flagged: { tokens: FlaggedToken[]; checked: number; skipped: number } | null;
}

// The safety part has its own request, so it can wait its turn for GoPlus (goplus-budget.ts "portfolio") instead of
// giving up while the balances are already shown.
const APPROVALS_MS = 45_000;
const FLAGS_MS = 35_000;
const FLAG_CHECKS = 8;
const HIGH_SELL_TAX = 0.3;

const wellKnown = new Set(
  batchAssets.flatMap((a) =>
    Object.entries(a.chains).flatMap(([chain, d]) => (d ? [`${chain}:${d.address.toLowerCase()}`] : [])),
  ),
);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

async function flaggedTokens(overview: AddressOverview): Promise<PortfolioSafetyReport["flagged"]> {
  const candidates = overview.chains
    .flatMap((c) => c.visible.map((h) => ({ ...h, chain: c.chain })))
    .filter((h) => h.kind === "token" && h.address && !wellKnown.has(`${h.chain}:${h.address.toLowerCase()}`))
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, FLAG_CHECKS);
  let skipped = 0;
  const results = await Promise.all(
    candidates.map(async (h): Promise<FlaggedToken | null> => {
      const chain = getChain(h.chain);
      if (!chain?.capabilities.tokenSecurity) return null;
      const result = await goPlusToken(chain.evmChainId, h.address!, "portfolio");
      if (result.status === "unavailable") skipped += 1;
      if (result.status !== "ok") return null;
      const { honeypot, sellTax } = result.facts;
      if (honeypot === true)
        return { chain: h.chain, address: h.address!, symbol: h.symbol, reason: "honeypot", sellTax };
      if (sellTax !== null && sellTax >= HIGH_SELL_TAX)
        return { chain: h.chain, address: h.address!, symbol: h.symbol, reason: "sell-tax", sellTax };
      return null;
    }),
  );
  return {
    tokens: results.filter((r): r is FlaggedToken => r !== null),
    checked: candidates.length - skipped,
    skipped,
  };
}

/** Chains this wallet uses: a portfolio of 20 wallets must not scan every chain for each. */
async function scope(address: string) {
  const [balanceChains, approvalChains] = await Promise.all([
    apiChains(address, "tokenBalances", "used"),
    apiChains(address, "approvals", "used"),
  ]);
  return { balanceChains: balanceChains ?? undefined, approvalChains: approvalChains ?? undefined };
}

/** Part 1: balances on the chains the wallet uses (cached: the safety part reuses the same reading). */
export async function portfolioBalances(address: string): Promise<PortfolioBalancesReport> {
  const started = Date.now();
  const { balanceChains } = await scope(address);
  const scoped = Date.now();
  const overview = await cachedAddressOverview(address, balanceChains);
  logTiming(`portfolio balances: chains ${scoped - started} ms, balances ${Date.now() - scoped} ms`);
  return { overview };
}

/** Part 2: approvals needing attention and GoPlus-flagged tokens, at Portfolio priority. */
export async function portfolioSafety(address: string): Promise<PortfolioSafetyReport> {
  const started = Date.now();
  const { balanceChains, approvalChains } = await scope(address);
  let approvalsMs = -1;
  let flagsMs = -1;
  const [approvals, flagged] = await Promise.all([
    withTimeout(
      cachedApprovals(address, approvalChains, "portfolio").then((r) => {
        approvalsMs = Date.now() - started;
        return {
          attention: r.summary.attention,
          partial:
            r.unavailable.length > 0 || Boolean(r.saved) || r.chains.some((c) => c.sources.goplus === "unavailable"),
          chains: [...new Set(r.chains.filter((c) => c.approvals.some((a) => a.attention)).map((c) => c.chain))],
        };
      }),
      APPROVALS_MS,
      null,
    ),
    withTimeout(
      // The overview is cached from part 1; flags start as soon as it is there.
      cachedAddressOverview(address, balanceChains)
        .then(flaggedTokens)
        .then((r) => ((flagsMs = Date.now() - started), r)),
      FLAGS_MS,
      null,
    ),
  ]);
  logTiming(
    `portfolio safety: approvals ${approvalsMs < 0 ? "timed out" : `${approvalsMs} ms`}${
      approvals?.partial ? " (partial)" : ""
    }, flags ${flagsMs < 0 ? "timed out" : `${flagsMs} ms`}${
      flagged && flagged.skipped > 0 ? ` (${flagged.skipped} skipped)` : ""
    }, total ${Date.now() - started} ms`,
  );
  return { approvals, flagged };
}
