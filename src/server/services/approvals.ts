import "server-only";
import { assertChainUp } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ApprovalsSummary, type RatedApproval, rateApprovals, summarize } from "@/lib/approvals/evaluate";
import type { ApprovalsFacts } from "@/lib/approvals/types";
import { registry } from "@/server/chains/registry";
import { readSaved, saveResults } from "@/server/saved/store";
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
  /** Chains shown from their last full check (at most 6 hours old) because a fresh one failed now: ISO time. */
  saved?: Partial<Record<ChainKey, string>>;
}

/**
 * Approvals on every live chain with the `approvals` capability. `priority` "background" (Portfolio badges) lets
 * page reports go first for GoPlus's free capacity. Held tokens come from the (cached) balance overview
 * so common spenders are checked for each. Cached briefly: approvals change when the user revokes.
 */
export async function cachedApprovals(
  owner: string,
  only?: readonly string[],
  priority: "page" | "background" = "page",
): Promise<ApprovalsReport> {
  "use cache";
  // Not awaited here: each chain starts its outside lookups while the balances load.
  const overviewRequest = cachedAddressOverview(owner, only).catch(() => null);
  const targets = liveChains.filter((chain) => chain.capabilities.approvals && (!only || only.includes(chain.key)));
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.getApprovals) throw new Error("Approvals not supported");
      assertChainUp(chain.key, owner);
      const held = overviewRequest.then((overview) => {
        const holdings = overview?.chains.find((c) => c.chain === chain.key);
        return [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
          h.kind === "token" && h.address ? [h.address] : [],
        );
      });
      return adapter.getApprovals(chain, owner, held, priority);
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
  const failed = targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key);
  // Stabilization S2: save each chain checked in full; a chain that failed now shows its last full check (≤ 6 h).
  void saveResults(
    "approvals",
    owner,
    chains.filter(isFullCheck).map((c) => ({ chain: c.chain, data: c })),
  );
  const saved = failed.length ? await readSaved<ChainApprovals>("approvals", owner, failed) : new Map();
  const all = [...chains, ...[...saved.values()].map((s) => s.data)];
  const unavailable = failed.filter((c) => !saved.has(c));
  cacheLife(
    unavailable.length || saved.size
      ? { stale: 0, revalidate: 1, expire: 1 }
      : { stale: 15, revalidate: 20, expire: 120 },
  );
  return {
    owner,
    checkedAt: Date.now(),
    chains: all,
    unavailable,
    summary: summarize(all.flatMap((c) => c.approvals)),
    ...(saved.size ? { saved: Object.fromEntries([...saved].map(([chain, s]) => [chain, s.savedAt])) } : {}),
  };
}

/** Every discovery source answered (recent events need a held token to search: none held is complete). */
export function isFullCheck(c: ChainApprovals): boolean {
  return c.sources.goplus === "ok" && (c.sources.recentLogs || c.sources.knownSpenders === false);
}
