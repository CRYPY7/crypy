import "server-only";
import { cacheLife } from "next/cache";
import { cookies } from "next/headers";
import { type ChainCapabilities, liveChains } from "@/config/chains";
import { isActiveLookup } from "@/lib/chains/types";
import { CHAINS_COOKIE, type ChainScope, parseSelection, resolveScope } from "@/lib/chains/selection";
import { registry } from "@/server/chains/registry";
import { cachedResolve } from "./lookups";

/**
 * Chains where an address shows any use: contract code, sent transactions or a coin balance (from the search
 * lookups every page already does), plus — for chains without those — whether it holds any of the chain's
 * well-known tokens (one multicall), so a wallet that only ever received USDT still counts as used.
 * Chains whose check failed count as used, so a provider outage never narrows a scan.
 */
export async function cachedChainUse(address: string): Promise<string[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  const resolved = await cachedResolve(address);
  const lookups = resolved.status === "address" ? resolved.lookups : [];
  const used = new Set(lookups.filter(isActiveLookup).map((l) => l.chain));
  // A chain whose quick check failed counts as used: better to scan it than to skip it silently.
  if (resolved.status === "address") for (const chain of resolved.unavailable) used.add(chain);
  await Promise.all(
    liveChains
      .filter((c) => !used.has(c.key))
      .map(async (c) => {
        const adapter = registry.adapters.find((a) => a.family === c.family);
        const holds = await adapter?.holdsCommonToken?.(c, address).catch(() => false);
        if (holds) used.add(c.key);
      }),
  );
  return liveChains.filter((c) => used.has(c.key)).map((c) => c.key);
}

/**
 * The chains a page scans: the link's ?chains= first, then the visitor's remembered choice, then "used".
 * `capability`: what the tool needs (e.g. "approvals"); only chains with it are offered.
 */
export async function chainScopeFor(
  address: string,
  capability: keyof ChainCapabilities,
  param: string | string[] | undefined,
): Promise<ChainScope> {
  const capable = liveChains.filter((c) => c.capabilities[capability]).map((c) => c.key);
  const remembered = (await cookies()).get(CHAINS_COOKIE)?.value;
  const selection = parseSelection(typeof param === "string" ? param : undefined, capable) ??
    parseSelection(remembered, capable) ?? { mode: "used" as const };
  const used = new Set(await cachedChainUse(address));
  return resolveScope(selection, capable, used);
}

/**
 * For the APIs: `?chains=` narrows the scan (used | all | bsc,ethereum). No value scans every supported chain,
 * as before. null means the value is invalid.
 */
export async function apiChains(
  address: string,
  capability: keyof ChainCapabilities,
  param: string | null,
): Promise<string[] | undefined | null> {
  if (param === null) return undefined;
  const capable = liveChains.filter((c) => c.capabilities[capability]).map((c) => c.key);
  const selection = parseSelection(param, capable);
  if (!selection) return null;
  const used = selection.mode === "used" ? new Set(await cachedChainUse(address)) : new Set<string>();
  return resolveScope(selection, capable, used).scan;
}

/** Synchronous check of a ?chains= value (used | all | known chain keys), so bad input is refused before any work. */
export function validChainsParam(param: string, capability: keyof ChainCapabilities): boolean {
  const capable = liveChains.filter((c) => c.capabilities[capability]).map((c) => c.key);
  return parseSelection(param, capable) !== null;
}
