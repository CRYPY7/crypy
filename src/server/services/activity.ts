import "server-only";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import type { ActivityFacts, ChainActivity } from "@/lib/activity/types";
import { registry } from "@/server/chains/registry";
import { cachedAddressOverview } from "./overview";

export interface ActivityReport extends ActivityFacts {
  /** Tokens the balance view hides as likely spam (lower-case), for the spam filter. */
  hiddenTokens: string[];
}

/** "bsc:123,ethereum:456" ↔ per-chain cursors. Unknown chains and bad numbers are dropped. */
export function parseCursor(value: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (value ?? "").split(",").slice(0, 16)) {
    const [chain, block] = part.split(":");
    const n = Number(block);
    if (chain && liveChains.some((c) => c.key === chain) && Number.isSafeInteger(n) && n >= 0) out.set(chain, n);
  }
  return out;
}
export function formatCursor(chains: ChainActivity[]): string | null {
  const parts = chains.filter((c) => c.next !== null).map((c) => `${c.chain}:${c.next}`);
  return parts.length ? parts.join(",") : null;
}

/**
 * Activity on every live chain with the `activity` capability. First page: all chains; next pages (cursor): only
 * the chains that have more. Cached briefly per address and cursor.
 */
export async function cachedActivity(owner: string, cursor: string | null): Promise<ActivityReport> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  const cursors = parseCursor(cursor);
  const overview = await cachedAddressOverview(owner).catch(() => null);
  const targets = liveChains.filter(
    (chain) => chain.capabilities.activity && (cursor === null || cursors.has(chain.key)),
  );
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.getActivity) throw new Error("Activity not supported");
      const holdings = overview?.chains.find((c) => c.chain === chain.key);
      const held = [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
        h.kind === "token" && h.address ? [h.address] : [],
      );
      return adapter.getActivity(chain, owner, cursors.get(chain.key) ?? null, held);
    }),
  );
  const chains: ChainActivity[] = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value.chain
      : { chain: targets[i]!.key as ChainKey, source: "unavailable", next: null, first: null, internalIncluded: false },
  );
  const transfers = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value.transfers : []))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.block - a.block);
  const hiddenTokens = (overview?.chains ?? []).flatMap((c) =>
    c.hidden.flatMap((h) => (h.kind === "token" && h.address ? [h.address.toLowerCase()] : [])),
  );
  return { owner, checkedAt: Date.now(), chains, transfers, hiddenTokens };
}
