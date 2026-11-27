import "server-only";
import { z } from "zod";
import { serverEnv } from "@/server/env";
import { discardBody } from "@/server/http/discard";
import { limitedFetch } from "@/server/http/limit";
import { noteAlchemyLimited, waitForAlchemy } from "./alchemy-pace";
import { BudgetExhaustedError, type Provider, budgetExhausted, recordUsage } from "./providers";

/**
 * R2 wallet discovery (INFRASTRUCTURE_DESIGN.md §5.2): which chains a wallet holds tokens on, for every Alchemy chain
 * in one request ("Token Balances By Wallet", `assets/tokens/balances/by-address`, balances only, up to 20 networks).
 * Native coins, sent transactions and contract code come from the search lookups, which are cheap and always fresh.
 *
 * A wallet full of airdropped spam lists thousands of entries over many pages. Discovery needs only to know which
 * networks hold *something*, so it reads at most MAX_PAGES and stops as soon as every network has a token; networks
 * it couldn't confirm are reported as unknown (the caller checks them another way, or scans them).
 */
export const MAX_PAGES = 2;
const PAGE_TIMEOUT_MS = 4_000;
export const DISCOVERY_METHOD = "portfolio_balancesByAddress";
const NETWORK_ALIASES: Record<string, string> = { "matic-mainnet": "polygon-mainnet" };

const pageSchema = z.object({
  data: z.object({
    tokens: z.array(
      z.object({
        network: z.string().max(64),
        tokenAddress: z.string().nullish(),
        tokenBalance: z.string().nullish(),
        error: z.unknown().optional(),
      }),
    ),
    pageKey: z.string().max(4096).nullish(),
  }),
});

/** Networks with a non-zero token balance on this page, and whether more pages follow. Exported for tests. */
export function parseDiscoveryPage(json: unknown): { held: Set<string>; seen: Set<string>; pageKey: string | null } {
  const parsed = pageSchema.parse(json);
  const held = new Set<string>();
  const seen = new Set<string>();
  for (const token of parsed.data.tokens) {
    const network = NETWORK_ALIASES[token.network] ?? token.network;
    seen.add(network);
    if (!token.tokenAddress || token.error) continue;
    if (!token.tokenBalance || !/^0x[0-9a-fA-F]{1,64}$/.test(token.tokenBalance)) continue;
    if (BigInt(token.tokenBalance) > 0n) held.add(network);
  }
  return { held, seen, pageKey: parsed.data.pageKey ?? null };
}

export type FetchDiscoveryPage = (body: unknown) => Promise<unknown>;

export interface Discovery {
  /** Alchemy network names where the wallet holds at least one token. */
  held: Set<string>;
  /** Networks whose holdings couldn't be confirmed (the list was longer than MAX_PAGES). */
  unknown: Set<string>;
  pages: number;
}

/** Throws when the first page fails: the caller then uses the per-chain check. */
export async function discoverTokens(
  owner: string,
  networks: readonly string[],
  fetchPage: FetchDiscoveryPage,
): Promise<Discovery> {
  const held = new Set<string>();
  let pageKey: string | null = null;
  let pages = 0;
  let complete = false;
  while (pages < MAX_PAGES) {
    const body = {
      addresses: [{ address: owner, networks }],
      includeNativeTokens: false,
      includeErc20Tokens: true,
      ...(pageKey ? { pageKey } : {}),
    };
    let page;
    try {
      page = parseDiscoveryPage(await fetchPage(body));
    } catch (error) {
      if (pages === 0) throw error;
      break; // a later page failing keeps what was found; the rest is unknown
    }
    pages += 1;
    for (const net of page.held) held.add(net);
    pageKey = page.pageKey;
    if (!pageKey) {
      complete = true;
      break;
    }
    if (networks.every((net) => held.has(net))) {
      complete = true;
      break;
    }
  }
  const unknown = new Set(complete ? [] : networks.filter((net) => !held.has(net)));
  return { held, unknown, pages };
}

/** The real reader: metered against Alchemy's daily budget and per-second pace like every Alchemy call. */
export function alchemyDiscoveryFetcher(alchemy: Provider): FetchDiscoveryPage {
  return async (body) => {
    const key = serverEnv.ALCHEMY_API_KEY;
    if (!key) throw new Error("No Alchemy key");
    if (budgetExhausted(alchemy)) throw new BudgetExhaustedError(alchemy.name);
    await waitForAlchemy(1, 1_000);
    recordUsage(alchemy, DISCOVERY_METHOD);
    const response = await limitedFetch(`https://api.g.alchemy.com/data/v1/${key}/assets/tokens/balances/by-address`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) noteAlchemyLimited();
      discardBody(response);
      throw new Error(`Wallet discovery responded ${response.status}`);
    }
    return response.json();
  };
}
