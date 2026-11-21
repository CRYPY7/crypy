import "server-only";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ApprovalsSummary, type RatedApproval, rateApprovals, summarize } from "@/lib/approvals/evaluate";
import type { ApprovalsFacts } from "@/lib/approvals/types";
import { registry } from "@/server/chains/registry";
import { cachedAddressOverview } from "./overview";

export interface ChainApprovals {
  chain: ChainKey;
  block: string;
  approvals: RatedApproval[];
  sources: ApprovalsFacts["sources"];
}

export interface ApprovalsReport {
  owner: string;
  checkedAt: number;
  chains: ChainApprovals[];
  /** Chains that couldn't be read right now. */
  unavailable: ChainKey[];
  summary: ApprovalsSummary;
}

/**
 * Approvals on every live chain with the `approvals` capability. Held tokens come from the (cached) balance overview
 * so common spenders are checked for each. Cached briefly: approvals change when the user revokes.
 */
export async function cachedApprovals(owner: string, only?: readonly string[]): Promise<ApprovalsReport> {
  "use cache";
  cacheLife({ stale: 15, revalidate: 20, expire: 120 });
  // Not awaited here: each chain starts its outside lookups while the balances load.
  const overviewRequest = cachedAddressOverview(owner, only).catch(() => null);
  const targets = liveChains.filter((chain) => chain.capabilities.approvals && (!only || only.includes(chain.key)));
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.getApprovals) throw new Error("Approvals not supported");
      const held = overviewRequest.then((overview) => {
        const holdings = overview?.chains.find((c) => c.chain === chain.key);
        return [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
          h.kind === "token" && h.address ? [h.address] : [],
        );
      });
      return adapter.getApprovals(chain, owner, held);
    }),
  );
  const overview = await overviewRequest;
  // Tokens the balance view hides as likely spam: approvals on them never need attention.
  const spam = new Set(
    (overview?.chains ?? []).flatMap((c) =>
      c.hidden.flatMap((h) => (h.kind === "token" && h.address ? [h.address.toLowerCase()] : [])),
    ),
  );
  const chains: ChainApprovals[] = settled.flatMap((r) =>
    r.status === "fulfilled"
      ? [
          {
            chain: r.value.chain as ChainKey,
            block: r.value.block,
            approvals: rateApprovals(r.value.approvals, spam),
            sources: r.value.sources,
          },
        ]
      : [],
  );
  const unavailable = targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key);
  return {
    owner,
    checkedAt: Date.now(),
    chains,
    unavailable,
    summary: summarize(chains.flatMap((c) => c.approvals)),
  };
}
