import "server-only";
import { cacheLife } from "next/cache";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { ExternalFacts, PowerFact, SourceFacts } from "@/lib/security/types";
import { type AbiEntry, powersFromSource } from "@/server/chains/evm/security/source";

/**
 * Outside sources for token security. Both are free and need no key:
 *  - GoPlus Security token API (free plan, royalty-free licence; about 150,000 credits a month): a second opinion,
 *    always shown with its name and never mixed into CRYPY's own checks;
 *  - Sourcify (open, free): whether the contract's source code is published and matches, and the owner powers read
 *    from that source.
 * Results are cached (GoPlus 1 hour, Sourcify 1 day) to stay well inside the free limits. Any failure → a status the
 * page shows as "not checked", never an error.
 */
const TIMEOUT_MS = 4_000;
/** Source files can be large: a little more time than the GoPlus call. */
const SOURCE_TIMEOUT_MS = 6_000;
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

/** Addresses GoPlus names: only used as candidates to check on-chain, never as facts. */
export interface GoPlusLeads {
  lpHolders: string[];
  pairs: string[];
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Parses GoPlus's LP holder and pair lists into plain addresses. Exported for tests. */
export function parseGoPlusLeads(entry: Record<string, unknown>): GoPlusLeads {
  const list = (v: unknown, field: string) =>
    (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
      .map((x) => x?.[field])
      .filter((a): a is string => typeof a === "string" && ADDRESS.test(a))
      .map((a) => a.toLowerCase())
      .slice(0, 30);
  return { lpHolders: list(entry.lp_holders, "address"), pairs: list(entry.dex, "pair") };
}

export type GoPlusResult =
  { status: "ok"; facts: ExternalFacts; leads: GoPlusLeads } | { status: "unavailable" | "not-listed" };

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
    return { status: "ok", facts: parseGoPlus(entry, Date.now()), leads: parseGoPlusLeads(entry) };
  } catch {
    cacheLife({ revalidate: 60, expire: 300 });
    return { status: "unavailable" };
  }
}

/** Sourcify answers bigger than this are not analysed (a token's source is normally far smaller). */
const MAX_SOURCE_BYTES = 3_000_000;

/**
 * Whether the contract's source is published and matches on Sourcify, and, when it is, the owner powers read from
 * that source (who may call each function, limits it checks). Cached 1 day; only the small analysis is kept.
 */
export async function sourcifyVerified(
  chainId: number,
  address: string,
): Promise<{ source: SourceFacts; powers: PowerFact[] | null }> {
  "use cache";
  const unknown = { source: { status: "unknown" as const, provider: "Sourcify" }, powers: null };
  try {
    const response = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,sources`, {
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      cacheLife({ revalidate: 3600, expire: 86_400 });
      return { source: { status: "not-found", provider: "Sourcify" }, powers: null };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const size = Number(response.headers.get("content-length") ?? 0);
    const json = (size > MAX_SOURCE_BYTES ? {} : await response.json()) as {
      match?: unknown;
      abi?: unknown;
      sources?: Record<string, { content?: unknown }>;
    };
    cacheLife({ revalidate: 86_400, expire: 604_800 });
    const match = typeof json.match === "string" ? sanitizeTokenText(json.match, 20) : "";
    const verified = match === "match" || match === "exact_match";
    if (!verified) return { source: { status: "not-found", provider: "Sourcify" }, powers: null };
    const sources: Record<string, string> = {};
    for (const [path, file] of Object.entries(json.sources ?? {}))
      if (typeof file?.content === "string") sources[path] = file.content;
    const abi = Array.isArray(json.abi) ? (json.abi as AbiEntry[]) : null;
    return {
      source: { status: "verified", provider: "Sourcify" },
      powers: abi && Object.keys(sources).length ? powersFromSource(abi, sources) : null,
    };
  } catch {
    cacheLife({ revalidate: 60, expire: 300 });
    return unknown;
  }
}

// ---- Approvals (M6) -------------------------------------------------------------------------------------------

/** One approval GoPlus reports for a wallet: only where to look; CRYPY re-reads it on-chain. */
export interface GoPlusApprovalLead {
  kind: "token" | "nft-all";
  token: string;
  spender: string;
  /** Unix seconds of the last change, and its transaction, as GoPlus reports them. */
  at: number | null;
  tx: string | null;
  flags: { malicious: boolean; doubt: boolean; trusted: boolean };
  /** When GoPlus says the spender contract was created (unix seconds); null when unknown. */
  spenderCreatedAt: number | null;
  /** The spender's contract name as GoPlus reports it (sanitized), or null. */
  spenderName: string | null;
}

const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Parses GoPlus token_approval_security / nft721 / nft1155 answers. Exported for tests; never trusts field types. */
export function parseGoPlusApprovals(result: unknown, kind: GoPlusApprovalLead["kind"]): GoPlusApprovalLead[] {
  const out: GoPlusApprovalLead[] = [];
  for (const item of Array.isArray(result) ? (result as Record<string, unknown>[]) : []) {
    const token = item?.token_address ?? item?.nft_address;
    if (typeof token !== "string" || !ADDRESS.test(token)) continue;
    for (const a of Array.isArray(item.approved_list) ? (item.approved_list as Record<string, unknown>[]) : []) {
      const spender = a?.approved_contract;
      if (typeof spender !== "string" || !ADDRESS.test(spender)) continue;
      // NFT: only "approved for all" matters here; single-item approvals are cleared when the item moves.
      if (kind === "nft-all" && !(a.approved_for_all === 1 || a.approved_for_all === "1")) continue;
      const info = (a.address_info ?? {}) as Record<string, unknown>;
      const behaviours = Array.isArray(info.malicious_behavior) ? info.malicious_behavior : [];
      const time = Number(a.approved_time);
      const created = Number(info.deployed_time);
      out.push({
        kind,
        token: token.toLowerCase(),
        spender: spender.toLowerCase(),
        at: Number.isFinite(time) && time > 0 ? (time > 1e12 ? Math.floor(time / 1000) : time) : null,
        tx: typeof a.hash === "string" && HASH.test(a.hash) ? a.hash : null,
        flags: {
          malicious: behaviours.length > 0 || flag(info.malicious_address) === true,
          doubt: flag(info.doubt_list) === true,
          trusted: flag(info.trust_list) === true,
        },
        spenderName: typeof info.contract_name === "string" ? sanitizeTokenText(info.contract_name, 48) || null : null,
        spenderCreatedAt:
          Number.isFinite(created) && created > 0 ? (created > 1e12 ? Math.floor(created / 1000) : created) : null,
      });
    }
  }
  return out.slice(0, 1000);
}

/**
 * "partial": GoPlus answered with code 2 ("partial data obtained"): the list it has, possibly incomplete. Busy wallets
 * often get this answer; the leads are still used and the page says the list may be incomplete.
 */
export type GoPlusApprovals = { status: "ok" | "partial"; leads: GoPlusApprovalLead[] } | { status: "unavailable" };

/** Approval lists take GoPlus several seconds for busy wallets (measured: 3–6 s). */
const APPROVALS_TIMEOUT_MS = 15_000;

/** GoPlus's approval lists for a wallet (tokens and NFT collections). Cached 5 minutes. */
export async function goPlusApprovals(chainId: number, owner: string): Promise<GoPlusApprovals> {
  "use cache";
  let partial = false;
  const get = async (path: string) => {
    const response = await fetch(
      `https://api.gopluslabs.io/api/v2/${path}/${chainId}?addresses=${owner.toLowerCase()}`,
      {
        signal: AbortSignal.timeout(APPROVALS_TIMEOUT_MS),
        headers: { accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { code?: number; result?: unknown };
    // 1 = complete, 2 = "partial data obtained" (still a real list); anything else is an error.
    if (json.code === 2) partial = true;
    else if (json.code !== 1) throw new Error("GoPlus error");
    return json.result;
  };
  try {
    const [tokens, nft721, nft1155] = await Promise.all([
      get("token_approval_security"),
      get("nft721_approval_security").catch(() => []),
      get("nft1155_approval_security").catch(() => []),
    ]);
    cacheLife({ revalidate: 300, expire: 900 });
    return {
      status: partial ? "partial" : "ok",
      leads: [
        ...parseGoPlusApprovals(tokens, "token"),
        ...parseGoPlusApprovals(nft721, "nft-all"),
        ...parseGoPlusApprovals(nft1155, "nft-all"),
      ],
    };
  } catch {
    cacheLife({ revalidate: 60, expire: 300 });
    return { status: "unavailable" };
  }
}
