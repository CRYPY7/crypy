import "server-only";
import { cacheLife } from "next/cache";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { ExternalFacts, SourceFacts } from "@/lib/security/types";

/**
 * Outside sources for token security. Both are free and need no key:
 *  - GoPlus Security token API (free plan, royalty-free licence; about 150,000 credits a month): a second opinion,
 *    always shown with its name and never mixed into CRYPY's own checks;
 *  - Sourcify (open, free): whether the contract's source code is published and matches.
 * Results are cached (GoPlus 1 hour, Sourcify 1 day) to stay well inside the free limits. Any failure → a status the
 * page shows as "not checked", never an error.
 */
const TIMEOUT_MS = 4_000;
const BURN = new Set(["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"]);

const flag = (v: unknown): boolean | null => (v === "1" || v === 1 ? true : v === "0" || v === 0 ? false : null);
const fraction = (v: unknown): number | null => {
  if (typeof v !== "string" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

/** Parses a GoPlus token_security entry. Exported for tests; never trusts field types. */
export function parseGoPlus(entry: Record<string, unknown>, fetchedAt: number): ExternalFacts {
  const holdersList = Array.isArray(entry.holders) ? (entry.holders as Record<string, unknown>[]) : [];
  const top = holdersList
    .filter((h) => typeof h.address === "string" && !BURN.has(h.address.toLowerCase()))
    .slice(0, 10)
    .reduce((sum, h) => sum + (Number(h.percent) || 0), 0);
  const count = Number(entry.holder_count);
  const owner = typeof entry.owner_address === "string" ? entry.owner_address.toLowerCase() : null;
  return {
    provider: "GoPlus",
    fetchedAt,
    honeypot: flag(entry.is_honeypot),
    buyTax: fraction(entry.buy_tax),
    sellTax: fraction(entry.sell_tax),
    mintable: flag(entry.is_mintable),
    proxy: flag(entry.is_proxy),
    blacklist: flag(entry.is_blacklisted),
    openSource: flag(entry.is_open_source),
    ownerRenounced: owner === null ? null : owner === "" || BURN.has(owner),
    creator:
      typeof entry.creator_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(entry.creator_address)
        ? entry.creator_address
        : null,
    holders: holdersList.length
      ? {
          count: Number.isFinite(count) && entry.holder_count !== "" ? count : null,
          top10: Math.min(1, top),
          ownerShare: fraction(entry.owner_percent),
          creatorShare: fraction(entry.creator_percent),
        }
      : null,
  };
}

export type GoPlusResult = { status: "ok"; facts: ExternalFacts } | { status: "unavailable" | "not-listed" };

export async function goPlusToken(chainId: number, address: string): Promise<GoPlusResult> {
  "use cache";
  try {
    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { code?: number; result?: Record<string, Record<string, unknown>> };
    if (json.code !== 1 || !json.result) {
      cacheLife({ revalidate: 60, expire: 300 });
      return { status: "unavailable" };
    }
    const entry = json.result[address.toLowerCase()];
    // GoPlus answers with an empty entry for tokens it hasn't analysed yet.
    if (!entry || entry.is_honeypot === undefined) {
      cacheLife({ revalidate: 600, expire: 3600 });
      return { status: "not-listed" };
    }
    cacheLife({ revalidate: 3600, expire: 86_400 });
    return { status: "ok", facts: parseGoPlus(entry, Date.now()) };
  } catch {
    cacheLife({ revalidate: 60, expire: 300 });
    return { status: "unavailable" };
  }
}

export async function sourcifyStatus(chainId: number, address: string): Promise<SourceFacts> {
  "use cache";
  try {
    const response = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      cacheLife({ revalidate: 3600, expire: 86_400 });
      return { status: "not-found", provider: "Sourcify" };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { match?: unknown };
    cacheLife({ revalidate: 86_400, expire: 604_800 });
    const match = typeof json.match === "string" ? sanitizeTokenText(json.match, 20) : "";
    return { status: match === "match" || match === "exact_match" ? "verified" : "not-found", provider: "Sourcify" };
  } catch {
    cacheLife({ revalidate: 60, expire: 300 });
    return { status: "unknown", provider: "Sourcify" };
  }
}
