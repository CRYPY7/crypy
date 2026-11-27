import "server-only";
import { chainDrill } from "@/server/fault";
import { cacheLife } from "next/cache";
import { type ChainKey, liveChains } from "@/config/chains";
import { type ApprovalsSummary, type RatedApproval, rateApprovals, summarize } from "@/lib/approvals/evaluate";
import type { ApprovalsFacts } from "@/lib/approvals/types";
import { registry } from "@/server/chains/registry";
import { runHeavy } from "@/server/heavy/queue";
import type { GoPlusPriority } from "@/server/security/goplus-budget";
import { freshOrSaved } from "@/server/saved/fresh-or-saved";
import { readSavedOne, saveResults } from "@/server/saved/store";
import { cachedAddressOverview } from "./overview";

export interface ChainApprovals {
  chain: ChainKey;
  block: string;
  approvals: RatedApproval[];
  sources: ApprovalsFacts["sources"];
  /** How long this chain's check took, in ms (R1 part 2: read by the speed script). */
  readMs?: number;
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
  /** Chains shown from their last complete check while a slow fresh check finishes in the background. */
  refreshing?: Partial<Record<ChainKey, string>>;
}

/**
 * Approvals on every live chain with the `approvals` capability. `priority` "portfolio" (Portfolio badges) or
 * "background" lets page reports go first for GoPlus's free capacity. Held tokens come from the (cached) balance overview
 * so common spenders are checked for each. Cached briefly: approvals change when the user revokes.
 */
export async function cachedApprovals(
  owner: string,
  only?: readonly string[],
  priority: GoPlusPriority = "page",
): Promise<ApprovalsReport> {
  "use cache";
  // Not awaited here: each chain starts its outside lookups while the balances load.
  const overviewRequest = cachedAddressOverview(owner, only).catch(() => null);
  const targets = liveChains.filter((chain) => chain.capabilities.approvals && (!only || only.includes(chain.key)));
  // Tokens the balance view hides as likely spam: approvals on them never need attention.
  const spamTokens = overviewRequest.then(
    (overview) =>
      new Set(
        (overview?.chains ?? []).flatMap((c) =>
          c.hidden.flatMap((h) => (h.kind === "token" && h.address ? [h.address.toLowerCase()] : [])),
        ),
      ),
  );
  // Stabilization S2: each chain is checked fresh; one that fails, or takes longer than a moment, shows its last
  // complete check (at most 6 hours old) while the fresh one finishes in the background. Only complete checks are
  // saved (isFullCheck).
  const results = await Promise.all(
    targets.map((chain) =>
      freshOrSaved<ChainApprovals>(
        `approvals|${owner.toLowerCase()}|${chain.key}`,
        async () => {
          const adapter = registry.adapters.find((a) => a.family === chain.family);
          if (!adapter?.getApprovals) throw new Error("Approvals not supported");
          await chainDrill(chain.key, owner);
          const held = overviewRequest.then((overview) => {
            const holdings = overview?.chains.find((c) => c.chain === chain.key);
            return [...(holdings?.visible ?? []), ...(holdings?.hidden ?? [])].flatMap((h) =>
              h.kind === "token" && h.address ? [h.address] : [],
            );
          });
          const getApprovals = adapter.getApprovals.bind(adapter);
          // S3: heavy checks share one line (server/heavy/queue.ts): pages first, background work behind.
          const started = Date.now();
          const facts = await runHeavy(() => getApprovals(chain, owner, held, priority), priority);
          return {
            chain: facts.chain as ChainKey,
            block: facts.block,
            approvals: rateApprovals(facts.approvals, await spamTokens),
            sources: facts.sources,
            readMs: Date.now() - started,
          };
        },
        () => readSavedOne<ChainApprovals>("approvals", owner, chain.key),
        (checked) => {
          if (isFullCheck(checked)) void saveResults("approvals", owner, [{ chain: checked.chain, data: checked }]);
        },
      ),
    ),
  );
  const chains: ChainApprovals[] = [];
  const unavailable: ChainKey[] = [];
  const saved: Partial<Record<ChainKey, string>> = {};
  const refreshing: Partial<Record<ChainKey, string>> = {};
  results.forEach((result, i) => {
    const key = targets[i]!.key;
    if (result.kind === "failed") return unavailable.push(key);
    chains.push(result.value);
    if (result.kind === "saved") (result.refreshing ? refreshing : saved)[key] = result.savedAt;
  });
  cacheLife(
    unavailable.length || Object.keys(saved).length || Object.keys(refreshing).length
      ? { stale: 0, revalidate: 1, expire: 1 }
      : { stale: 15, revalidate: 20, expire: 120 },
  );
  return {
    owner,
    checkedAt: Date.now(),
    chains,
    unavailable,
    summary: summarize(chains.flatMap((c) => c.approvals)),
    ...(Object.keys(saved).length ? { saved } : {}),
    ...(Object.keys(refreshing).length ? { refreshing } : {}),
  };
}

/** Every discovery source answered (recent events need a held token to search: none held is complete). */
export function isFullCheck(c: ChainApprovals): boolean {
  return c.sources.goplus === "ok" && (c.sources.recentLogs || c.sources.knownSpenders === false);
}
