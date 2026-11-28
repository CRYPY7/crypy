import "server-only";
import { runHeavy } from "@/server/heavy/queue";
import { chainDrill } from "@/server/fault";
import { freshOrSaved } from "@/server/saved/fresh-or-saved";
import { MAX_AGE_MS, type Saved, readSavedOne, saveResults } from "@/server/saved/store";
import { cacheLife } from "next/cache";
import { getChain } from "@/config/chains";
import type { AddressLookup, TxDetails } from "@/lib/chains/types";
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
  cacheLife({ stale: 30, revalidate: 60, expire: 1800 });
  return resolveSearch(input, registry);
}

/**
 * For the address pages (stabilization S2): when no chain answered the lookup, a valid address still opens its page,
 * so its saved readings can be shown; every chain counts as not answered.
 */
export async function resolveAddressPage(input: string): Promise<ResolveResult> {
  const result = await cachedResolve(input);
  if (result.status !== "unavailable") return result;
  for (const adapter of registry.adapters) {
    const parsed = adapter.parseAddress(input.trim());
    if (!parsed || parsed.checksumValid === false) continue;
    return {
      status: "address",
      address: parsed.normalized,
      checksumValid: parsed.checksumValid,
      lookups: [],
      unavailable: result.unavailable,
      target: null,
      choices: [],
      overview: `/address/${parsed.normalized}`,
      inactive: [],
    };
  }
  return result;
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
/** Full transaction details for the transaction page. Short cache: confirmations and pending status move. */
export async function cachedTxDetails(chainKey: string, hash: string): Promise<TxDetails | null> {
  "use cache";
  const found = adapterFor(chainKey);
  const parsedHash = found?.adapter.getTransactionDetails ? found.adapter.parseTxId(hash) : null;
  let details: TxDetails | null;
  try {
    if (parsedHash) await chainDrill(chainKey, parsedHash);
    details = parsedHash ? await found!.adapter.getTransactionDetails!(found!.chain, parsedHash) : null;
  } catch (error) {
    // Stabilization S2: a confirmed transaction read before is shown from its saved reading, marked with its time.
    const saved = parsedHash ? await readSavedOne<TxDetails>("transaction", parsedHash, chainKey) : undefined;
    if (!saved) throw error;
    cacheLife({ stale: 0, revalidate: 1, expire: 1 });
    return { ...saved.data, savedAt: saved.savedAt };
  }
  // Settled transactions no longer change (only their confirmation count grows): keep them for 5 minutes, and save
  // them for when the chain can't be read. Pending, recent and unknown ones are re-read every 15 seconds.
  if (details && details.status !== "pending" && (details.finalized === true || (details.confirmations ?? 0) >= 64)) {
    void saveResults("transaction", details.hash, [{ chain: chainKey, data: details }]);
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
  // Stabilization S2 (B-006): a check that fails, or takes longer than a moment, shows the last complete report (at
  // most 6 hours old: CRYPY's own saved one or the curated token's daily check) while the fresh one finishes in the
  // background. Saved only when every source answered (GoPlus included).
  const result = await freshOrSaved<SecurityReport | null>(
    `token-security|${chainKey}|${address.toLowerCase()}`,
    () => tokenSecurityReport(chainKey, address),
    () => savedTokenReport(chainKey, address),
    (report) => {
      if (report && report.facts.externalStatus !== "unavailable")
        void saveResults("token-security", address, [{ chain: chainKey, data: report }]);
    },
  );
  if (result.kind === "failed") throw result.error;
  if (result.kind === "saved") {
    cacheLife({ stale: 0, revalidate: 1, expire: 1 });
    return result.value && { ...result.value, savedAt: result.savedAt, refreshing: result.refreshing };
  }
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });
  return result.value;
}

/** The newest complete report at most 6 hours old: CRYPY's saved one, or the curated token's daily check. */
async function savedTokenReport(chainKey: string, address: string): Promise<Saved<SecurityReport | null> | undefined> {
  const [own, daily] = await Promise.all([
    readSavedOne<SecurityReport>("token-security", address, chainKey),
    import("./token-checks").then((m) => m.savedCheck(chainKey, address)).catch(() => null),
  ]);
  const dailyAt = daily && daily.report.facts.externalStatus !== "unavailable" ? daily.checkedAt.getTime() : 0;
  const fresh = Date.now() - dailyAt <= MAX_AGE_MS["token-security"];
  if (daily && fresh && (!own || dailyAt > Date.parse(own.savedAt)))
    return { data: daily.report, savedAt: daily.checkedAt.toISOString() };
  return own;
}

/** The same without the page cache, for the background alerts checker (GoPlus at background priority there). */
export async function tokenSecurityReport(
  chainKey: string,
  address: string,
  priority: "page" | "background" = "page",
): Promise<SecurityReport | null> {
  const found = adapterFor(chainKey);
  if (!found?.adapter.getTokenSecurity || !found.chain.capabilities.tokenSecurity) return null;
  const parsed = found.adapter.parseAddress(address);
  if (!parsed || parsed.checksumValid === false) return null;
  await chainDrill(found.chain.key, parsed.normalized);
  const getTokenSecurity = found.adapter.getTokenSecurity.bind(found.adapter);
  // S3: heavy checks share one line (server/heavy/queue.ts): pages first, background work behind.
  const facts = await runHeavy(() => getTokenSecurity(found.chain, parsed.normalized, priority), priority);
  return facts ? evaluate(facts) : null;
}
