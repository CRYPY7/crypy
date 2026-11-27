import "server-only";
import { cookies } from "next/headers";
import { type ChainCapabilities, liveChains } from "@/config/chains";
import { isActiveLookup } from "@/lib/chains/types";
import { CHAINS_COOKIE, type ChainScope, parseSelection, resolveScope } from "@/lib/chains/selection";
import { walletChains } from "@/server/wallet/activity-map";
import { cachedResolve } from "./lookups";

/**
 * Chains where an address shows any use: contract code, sent transactions or a coin balance (from the search lookups
 * every page already does, always fresh), plus the chains where it holds tokens from the wallet's stored activity map
 * (R2: one discovery request for every chain, refreshed in the background), so a wallet that only ever received
 * tokens still counts as used. Chains whose check failed or couldn't be confirmed count as used, so a provider outage
 * never narrows a scan.
 */
export async function cachedChainUse(address: string): Promise<string[]> {
  const [resolved, map] = await Promise.all([cachedResolve(address), walletChains(address)]);
  const lookups = resolved.status === "address" ? resolved.lookups : [];
  const used = new Set<string>(lookups.filter(isActiveLookup).map((l) => l.chain));
  // A chain whose quick check failed counts as used: better to scan it than to skip it silently.
  if (resolved.status === "address") for (const chain of resolved.unavailable) used.add(chain);
  else for (const chain of liveChains) used.add(chain.key);
  for (const chain of [...map.tokens, ...map.unknown]) used.add(chain);
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
