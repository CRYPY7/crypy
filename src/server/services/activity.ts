import "server-only";
import { chainDrill } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import type { ActivityFacts, ChainActivity } from "@/lib/activity/types";
import { registry } from "@/server/chains/registry";
import { type FreshOrSaved, freshOrSaved } from "@/server/saved/fresh-or-saved";
import { readSavedOne, saveResults } from "@/server/saved/store";
import { cachedAddressOverview } from "./overview";

export interface ActivityReport extends ActivityFacts {
  /** Tokens the balance view hides as likely spam (lower-case), for the spam filter. */
  hiddenTokens: string[];
  /** First page: chains shown from their last full history (up to 7 days old) because reading failed now. */
  saved?: Record<string, string>;
  /** First page: chains shown from their last first page while a slow fresh read finishes in the background. */
  refreshing?: Record<string, string>;
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
  const readChain = async (chain: (typeof targets)[number]): Promise<SavedActivity> => {
    const adapter = registry.adapters.find((a) => a.family === chain.family);
    if (!adapter?.getActivity) throw new Error("Activity not supported");
    await chainDrill(chain.key, owner);
    const held = overviewRequest.then((overview) => {
      const holdings = overview?.chains.find((c) => c.chain === chain.key);
      return [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
        h.kind === "token" && h.address ? [h.address] : [],
      );
    });
    const started = Date.now();
    const page = await adapter.getActivity(chain, owner, cursors.get(chain.key) ?? null, held);
    // How long this chain took, in ms (R1 part 2: read by the speed script).
    return { ...page, chain: { ...page.chain, readMs: Date.now() - started } };
  };
  // Stabilization S2, first page only: each chain is read fresh; one that fails, or takes longer than a moment, shows
  // its last first page (up to 7 days old) while the fresh read finishes in the background. Full history is saved as
  // complete; "recent only" can fill a gap but never replaces it. Older pages always read fresh.
  const firstPage = cursor === null;
  const results = await Promise.all(
    targets.map(async (chain): Promise<FreshOrSaved<SavedActivity>> => {
      if (!firstPage)
        return readChain(chain).then(
          (value) => ({ kind: "fresh" as const, value }),
          (error: unknown) => ({ kind: "failed" as const, error }),
        );
      return freshOrSaved<SavedActivity>(
        `activity|${owner.toLowerCase()}|${chain.key}`,
        () => readChain(chain),
        () => readSavedOne<SavedActivity>("activity", owner, chain.key),
        (page) => {
          if (page.chain.source === "unavailable") return;
          void saveResults("activity", owner, [
            {
              chain: page.chain.chain,
              data: { chain: page.chain, transfers: page.transfers },
              quality: page.chain.source === "history" ? 2 : 1,
            },
          ]);
        },
      );
    }),
  );
  const overview = await overviewRequest;
  const saved: Record<string, string> = {};
  const refreshing: Record<string, string> = {};
  const chains: ChainActivity[] = results.map((result, i) => {
    if (result.kind === "failed")
      return {
        chain: targets[i]!.key as ChainKey,
        source: "unavailable",
        next: null,
        first: null,
        internalIncluded: false,
      };
    if (result.kind === "saved") (result.refreshing ? refreshing : saved)[targets[i]!.key] = result.savedAt;
    return result.value.chain;
  });
  const transfers = results
    .flatMap((result) => (result.kind === "failed" ? [] : result.value.transfers))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || b.block - a.block);
  const partial = results.some((result) => result.kind !== "fresh");
  cacheLife(
    partial ? { stale: 0, revalidate: 1, expire: 1 } : { stale: 30, revalidate: 60, expire: 1800 }, // a repeat visit within 30 min opens at once (refreshed in the background)
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
    ...(Object.keys(saved).length ? { saved } : {}),
    ...(Object.keys(refreshing).length ? { refreshing } : {}),
  };
}
