import "server-only";
import { batchAssets } from "@/config/batch-assets";
import { type ChainKey, getChain } from "@/config/chains";
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
 */
export interface FlaggedToken {
  chain: ChainKey;
  address: string;
  symbol: string;
  reason: "honeypot" | "sell-tax";
  sellTax: number | null;
}

export interface PortfolioWalletReport {
  overview: AddressOverview;
  /** null when the approval check didn't finish in time or failed. */
  approvals: { attention: number; chains: ChainKey[] } | null;
  flagged: { tokens: FlaggedToken[]; checked: number } | null;
}

const APPROVALS_MS = 20_000;
const FLAGS_MS = 8_000;
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

async function flaggedTokens(overview: AddressOverview): Promise<PortfolioWalletReport["flagged"]> {
  const candidates = overview.chains
    .flatMap((c) => c.visible.map((h) => ({ ...h, chain: c.chain })))
    .filter((h) => h.kind === "token" && h.address && !wellKnown.has(`${h.chain}:${h.address.toLowerCase()}`))
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, FLAG_CHECKS);
  const results = await Promise.all(
    candidates.map(async (h): Promise<FlaggedToken | null> => {
      const chain = getChain(h.chain);
      if (!chain?.capabilities.tokenSecurity) return null;
      const result = await goPlusToken(chain.evmChainId, h.address!);
      if (result.status !== "ok") return null;
      const { honeypot, sellTax } = result.facts;
      if (honeypot === true)
        return { chain: h.chain, address: h.address!, symbol: h.symbol, reason: "honeypot", sellTax };
      if (sellTax !== null && sellTax >= HIGH_SELL_TAX)
        return { chain: h.chain, address: h.address!, symbol: h.symbol, reason: "sell-tax", sellTax };
      return null;
    }),
  );
  return { tokens: results.filter((r): r is FlaggedToken => r !== null), checked: candidates.length };
}

export async function portfolioWallet(address: string): Promise<PortfolioWalletReport> {
  // Only the chains this wallet uses: a portfolio of 20 wallets must not scan every chain for each.
  const balanceChains = (await apiChains(address, "tokenBalances", "used")) ?? undefined;
  const approvalChains = (await apiChains(address, "approvals", "used")) ?? undefined;
  const overview = await cachedAddressOverview(address, balanceChains);
  const [approvals, flagged] = await Promise.all([
    withTimeout(
      cachedApprovals(address, approvalChains).then((r) => ({
        attention: r.summary.attention,
        chains: [...new Set(r.chains.filter((c) => c.approvals.some((a) => a.attention)).map((c) => c.chain))],
      })),
      APPROVALS_MS,
      null,
    ),
    withTimeout(flaggedTokens(overview), FLAGS_MS, null),
  ]);
  return { overview, approvals, flagged };
}
