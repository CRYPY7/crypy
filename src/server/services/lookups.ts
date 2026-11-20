import "server-only";
import { cacheLife } from "next/cache";
import { getChain } from "@/config/chains";
import type { AddressLookup, TxDetails, TxLookup } from "@/lib/chains/types";
import { registry } from "@/server/chains/registry";
import { evaluate } from "@/lib/security/evaluate";
import type { SecurityReport } from "@/lib/security/types";
import { type ResolveResult, resolveSearch } from "./resolve";

/**
 * Cached entry points used by pages and API routes. Short cache times keep data fresh
 * while repeated searches (and crawlers) don't spend RPC quota.
 */
export async function cachedResolve(input: string): Promise<ResolveResult> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  return resolveSearch(input, registry);
}

function adapterFor(chainKey: string) {
  const chain = getChain(chainKey);
  const adapter = chain && registry.adapters.find((a) => a.family === chain.family);
  return chain && adapter ? { chain, adapter } : null;
}

export async function cachedTokenLookup(chainKey: string, address: string): Promise<AddressLookup | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const found = adapterFor(chainKey);
  if (!found) return null;
  const parsed = found.adapter.parseAddress(address);
  if (!parsed || parsed.checksumValid === false) return null;
  return found.adapter.lookupAddress(found.chain, parsed.normalized);
}

export async function cachedTxLookup(chainKey: string, hash: string): Promise<TxLookup | null> {
  "use cache";
  // Pending transactions change quickly; confirmed ones never do. Keep it short and simple here.
  cacheLife({ stale: 10, revalidate: 15, expire: 120 });
  const found = adapterFor(chainKey);
  if (!found) return null;
  const parsedHash = found.adapter.parseTxId(hash);
  return parsedHash ? found.adapter.lookupTransaction(found.chain, parsedHash) : null;
}

/** Full transaction details for the transaction page. Short cache: confirmations and pending status move. */
export async function cachedTxDetails(chainKey: string, hash: string): Promise<TxDetails | null> {
  "use cache";
  const found = adapterFor(chainKey);
  const parsedHash = found?.adapter.getTransactionDetails ? found.adapter.parseTxId(hash) : null;
  const details = parsedHash ? await found!.adapter.getTransactionDetails!(found!.chain, parsedHash) : null;
  // Settled transactions no longer change (only their confirmation count grows): keep them for 5 minutes.
  // Pending, recent and unknown ones are re-read every 15 seconds.
  if (details && details.status !== "pending" && (details.confirmations ?? 0) >= 64) {
    cacheLife({ stale: 60, revalidate: 300, expire: 3_600 });
  } else {
    cacheLife({ stale: 10, revalidate: 15, expire: 120 });
  }
  return details;
}

export function explorerLink(chainKey: string, kind: "address" | "tx" | "token", id: string): string | null {
  const found = adapterFor(chainKey);
  return found ? found.adapter.explorerUrl(found.chain, kind, id) : null;
}

/**
 * Token security report, cached 5 minutes per token (owners can switch fees or trading at any time, so it stays
 * short). The adapter supplies facts; the shared rules turn them into checks.
 */
export async function cachedTokenSecurity(chainKey: string, address: string): Promise<SecurityReport | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });
  const found = adapterFor(chainKey);
  if (!found?.adapter.getTokenSecurity || !found.chain.capabilities.tokenSecurity) return null;
  const parsed = found.adapter.parseAddress(address);
  if (!parsed || parsed.checksumValid === false) return null;
  const facts = await found.adapter.getTokenSecurity(found.chain, parsed.normalized);
  return facts ? evaluate(facts) : null;
}
