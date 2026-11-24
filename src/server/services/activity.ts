import "server-only";
import { assertChainUp } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import type { ActivityFacts, ChainActivity } from "@/lib/activity/types";
import { registry } from "@/server/chains/registry";
import { readSaved, saveResults } from "@/server/saved/store";
import { cachedAddressOverview } from "./overview";

export interface ActivityReport extends ActivityFacts {
  /** Tokens the balance view hides as likely spam (lower-case), for the spam filter. */
  hiddenTokens: string[];
  /** First page: chains shown from their last full history (up to 7 days old) because reading failed now. */
  saved?: Record<string, string>;
}

interface SavedActivity {
  chain: ChainActivity;
  transfers: ActivityFacts["transfers"];
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
export async function cachedActivity(
  owner: string,
  cursor: string | null,
  only?: readonly string[],
): Promise<ActivityReport> {
  "use cache";
  const cursors = parseCursor(cursor);
  // Not awaited here: the history source doesn't need balances, so it starts at once.
  const overviewRequest = cachedAddressOverview(owner, only).catch(() => null);
  const targets = liveChains.filter(
    (chain) =>
      chain.capabilities.activity && (!only || only.includes(chain.key)) && (cursor === null || cursors.has(chain.key)),
  );
  const settled = await Promise.allSettled(
    targets.map(async (chain) => {
      const adapter = registry.adapters.find((a) => a.family === chain.family);
      if (!adapter?.getActivity) throw new Error("Activity not supported");
      assertChainUp(chain.key, owner);
      const held = overviewRequest.then((overview) => {
        const holdings = overview?.chains.find((c) => c.chain === chain.key);
        return [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
          h.kind === "token" && h.address ? [h.address] : [],
        );
      });
      return adapter.getActivity(chain, owner, cursors.get(chain.key) ?? null, held);
    }),
  );
  const overview = await overviewRequest;
  // Stabilization S2, first page only: save each chain's first page; a chain that failed now shows its last one (up to
  // 7 days old). Older pages always read fresh.
  const firstPage = cursor === null;
  if (firstPage)
    void saveResults(
      "activity",
      owner,
      settled.flatMap((r) =>
        // Full history is complete; "recent only" (no history source) can fill a gap but never replaces it.
        r.status === "fulfilled" && r.value.chain.source !== "unavailable"
          ? [
              {
                chain: r.value.chain.chain,
                data: { chain: r.value.chain, transfers: r.value.transfers },
                quality: r.value.chain.source === "history" ? (2 as const) : (1 as const),
              },
            ]
          : [],
      ),
    );
  const failed = targets.filter((_, i) => settled[i]?.status === "rejected").map((c) => c.key);
  const saved =
    firstPage && failed.length ? await readSaved<SavedActivity>("activity", owner, failed) : new Map<string, never>();
  const chains: ChainActivity[] = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value.chain
      : (saved.get(targets[i]!.key)?.data.chain ?? {
          chain: targets[i]!.key as ChainKey,
          source: "unavailable",
          next: null,
          first: null,
          internalIncluded: false,
        }),
  );
  const transfers = [
    ...settled.flatMap((r) => (r.status === "fulfilled" ? r.value.transfers : [])),
    ...[...saved.values()].flatMap((s) => s.data.transfers),
  ].sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.block - a.block);
  cacheLife(
    failed.length ? { stale: 0, revalidate: 1, expire: 1 } : { stale: 30, revalidate: 60, expire: 1800 }, // a repeat visit within 30 min opens at once (refreshed in the background)
  );
  const hiddenTokens = (overview?.chains ?? []).flatMap((c) =>
    c.hidden.flatMap((h) => (h.kind === "token" && h.address ? [h.address.toLowerCase()] : [])),
  );
  return {
    owner,
    checkedAt: Date.now(),
    chains,
    transfers,
    hiddenTokens,
    ...(saved.size ? { saved: Object.fromEntries([...saved].map(([chain, s]) => [chain, s.savedAt])) } : {}),
  };
}
