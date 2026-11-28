import "server-only";
import { limitedFetch } from "@/server/http/limit";
import { type Hex, type PublicClient, erc20Abi, getAddress } from "viem";
import { z } from "zod";
import type { ChainConfig } from "@/config/chains";
import type { BalanceCoverage, ChainBalances, RawTokenBalance } from "@/lib/chains/types";
import { noteAlchemyLimited, waitForAlchemy } from "./alchemy-pace";
import {
  BudgetExhaustedError,
  type Provider,
  alchemyUnits,
  budgetExhausted,
  getEvmClient,
  recordUsage,
} from "./providers";
import { logTiming } from "@/server/diagnostics";
import { serverEnv } from "@/server/env";
import { isBackground } from "@/server/background";
import { discardBody } from "@/server/http/discard";
import { walletTokens } from "./wallet-tokens";
import type { TokenDetails } from "@/server/tokens/registry";
import { evmTokenDetails } from "./token-details";

/**
 * Alchemy lists every token an address has EVER held (including ones now at zero), 100 per page.
 * Busy wallets touch hundreds of tokens, so we read up to 10 pages (1,000 entries) and drop the zeros.
 * Cost: 20 compute units per page; results are cached per address.
 */
export const MAX_TOKEN_PAGES = 10;
/**
 * Alchemy's token list is read one page after another (each needs the previous page's key). Wallets that received
 * thousands of airdropped tokens need all 10 pages, which took 6–15 s on the owner's PC. After this long, no further
 * page is requested and the list is marked as cut off (the page says some tokens may be missing).
 */
export const TOKEN_LIST_BUDGET_MS = 15_000;
/**
 * R2 part 2: a page shows what the list has after this long (plus the well-known tokens, read directly), marked as
 * still completing; the list keeps going in the background up to `TOKEN_LIST_BUDGET_MS` and the page's reload gets
 * the whole list. Background work (alerts checks) waits for the whole list.
 */
export const FIRST_VIEW_MS = 2_000;
/** A finished list is kept this long for the page's reload and for other tools reading the same wallet. */
export const LISTING_KEEP_MS = 120_000;
const PAGE_SIZE = 100;

const tokenBalancesSchema = z.object({
  result: z
    .object({
      tokenBalances: z.array(
        z.object({
          contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
          tokenBalance: z.string().nullable(),
          error: z.unknown().optional(),
        }),
      ),
      pageKey: z.string().nullish(),
    })
    .optional(),
  error: z.object({ message: z.string() }).optional(),
});

export interface ListedToken {
  address: Hex;
  raw: bigint;
}

/**
 * Parses one page of Alchemy `alchemy_getTokenBalances`. Zero and errored balances are dropped.
 * Exported for unit tests with recorded responses.
 */
export function parseTokenBalancesPage(json: unknown): {
  tokens: ListedToken[];
  pageKey: string | null;
  entries: number;
} {
  const parsed = tokenBalancesSchema.parse(json);
  if (parsed.error || !parsed.result) throw new Error("Token list provider returned an error");
  const tokens: ListedToken[] = [];
  for (const entry of parsed.result.tokenBalances) {
    if (entry.error || !entry.tokenBalance || !/^0x[0-9a-fA-F]+$/.test(entry.tokenBalance)) continue;
    const raw = BigInt(entry.tokenBalance);
    if (raw > 0n) tokens.push({ address: getAddress(entry.contractAddress), raw });
  }
  return { tokens, pageKey: parsed.result.pageKey ?? null, entries: parsed.result.tokenBalances.length };
}

/** Every ERC-20/BEP-20 token the address has a balance in, from Alchemy's token index. */
export async function listTokensFromAlchemy(
  provider: Provider,
  owner: string,
  /** Called with each page as it arrives (its tokens and how many entries it had). */
  onPage?: (page: { tokens: ListedToken[]; entries: number }) => void,
): Promise<{ tokens: ListedToken[]; truncated: boolean; entries: number }> {
  const tokens: ListedToken[] = [];
  let entries = 0;
  let pageKey: string | null = null;
  const started = Date.now();
  for (let page = 0; page < MAX_TOKEN_PAGES; page++) {
    const options: Record<string, unknown> = { maxCount: PAGE_SIZE };
    if (pageKey) options.pageKey = pageKey;
    // Metered like every other request: once today's budget is used, fall back to well-known tokens.
    if (budgetExhausted(provider)) throw new BudgetExhaustedError(provider.name);
    // Shares Alchemy's per-second budget; waits at most 2 s per page.
    await waitForAlchemy(alchemyUnits("alchemy_getTokenBalances"), 2_000);
    recordUsage(provider, "alchemy_getTokenBalances");
    const response = await limitedFetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenBalances",
        params: [owner, "erc20", options],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) noteAlchemyLimited();
      discardBody(response);
      throw new Error(`Token list provider responded ${response.status}`);
    }
    const result = parseTokenBalancesPage(await response.json());
    tokens.push(...result.tokens);
    entries += result.entries;
    onPage?.({ tokens: result.tokens, entries: result.entries });
    pageKey = result.pageKey;
    if (pageKey && Date.now() - started > TOKEN_LIST_BUDGET_MS) {
      logTiming(`alchemy token list: ${page + 1} pages (time budget), ${entries} entries, ${Date.now() - started} ms`);
      return { tokens, truncated: true, entries };
    }
    if (!pageKey) {
      logTiming(`alchemy token list: ${page + 1} pages, ${entries} entries, ${Date.now() - started} ms`);
      return { tokens, truncated: false, entries };
    }
  }
  logTiming(`alchemy token list: ${MAX_TOKEN_PAGES} pages (cut off), ${entries} entries, ${Date.now() - started} ms`);
  return { tokens, truncated: true, entries };
}

/** Balances of the chain's well-known tokens, read directly from the contracts (no key needed). */
async function listCommonTokens(client: PublicClient, chain: ChainConfig, owner: Hex): Promise<ListedToken[]> {
  const addresses = chain.commonTokens.map((token) => getAddress(token));
  const results = await client.multicall({
    allowFailure: true,
    contracts: addresses.map((address) => ({
      address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [owner],
    })),
  });
  return addresses.flatMap((address, i) => {
    const result = results[i];
    return result?.status === "success" && result.result > 0n ? [{ address, raw: result.result }] : [];
  });
}

/** Whether the address holds any of the chain's well-known tokens (one multicall): a cheap "is it used here" hint. */
export async function holdsCommonToken(chain: ChainConfig, owner: string): Promise<boolean> {
  const client = getEvmClient(chain);
  const held = await listCommonTokens(client, chain, getAddress(owner));
  return held.length > 0;
}

/**
 * Name, symbol and decimals for many tokens, through the shared token registry (R1): memory, then the database, then
 * batched multicalls (several batches at once) for tokens nobody has read yet. `given`: details already known from
 * Alchemy's list. Contract text is sanitized. Output keeps the input order.
 */
async function readMetadata(
  client: PublicClient,
  chainKey: string,
  tokens: ListedToken[],
  given?: ReadonlyMap<string, TokenDetails>,
): Promise<RawTokenBalance[]> {
  const details = await evmTokenDetails(
    client,
    chainKey,
    tokens.map((t) => t.address),
    given,
  );
  return tokens.map((token) => {
    const info = details.get(token.address.toLowerCase()) ?? null;
    return {
      address: token.address,
      // Without readable decimals the amount can't be shown correctly; it is kept raw and flagged.
      balance: { raw: token.raw.toString(), decimals: info?.decimals ?? 0 },
      info,
    };
  });
}

type ListResult = { tokens: ListedToken[]; truncated: boolean; entries: number };
interface Listing {
  /** Tokens listed so far (grows while pages arrive). */
  sofar: ListedToken[];
  entries: number;
  full: Promise<ListResult>;
  doneAt?: number;
}
const listings: Map<string, Listing> = ((
  globalThis as { __crypyTokenListings?: Map<string, Listing> }
).__crypyTokenListings ??= new Map());

/** For tests. */
export function resetTokenListings(): void {
  listings.clear();
}

/**
 * One token list per wallet and chain at a time, shared by every request (R2 part 2); kept `LISTING_KEEP_MS` after
 * it finishes. Each page's token details go into the token registry while the next page is listed.
 */
export function sharedTokenList(
  provider: Provider,
  owner: string,
  chainKey: string,
  warm: (page: ListedToken[]) => void,
  list: typeof listTokensFromAlchemy = listTokensFromAlchemy,
  now = Date.now(),
): Listing {
  const key = `${chainKey}|${owner.toLowerCase()}`;
  const existing = listings.get(key);
  if (existing && (existing.doneAt === undefined || now - existing.doneAt < LISTING_KEEP_MS)) return existing;
  for (const [k, l] of listings) if (l.doneAt !== undefined && now - l.doneAt >= LISTING_KEEP_MS) listings.delete(k);
  const listing: Listing = {
    sofar: [],
    entries: 0,
    full: Promise.resolve({ tokens: [], truncated: false, entries: 0 }),
  };
  listing.full = list(provider, owner, (page) => {
    listing.sofar.push(...page.tokens);
    listing.entries += page.entries;
    warm(page.tokens);
  }).then(
    (result) => {
      listing.doneAt = Date.now();
      return result;
    },
    (error: unknown) => {
      listings.delete(key); // a failed list isn't kept: the next request tries again
      throw error;
    },
  );
  listing.full.catch(() => {});
  listings.set(key, listing);
  return listing;
}

export async function getEvmBalances(
  client: PublicClient,
  chain: ChainConfig,
  address: string,
  alchemy: Provider | null,
): Promise<ChainBalances> {
  const owner = getAddress(address);
  const nativePromise = client.getBalance({ address: owner });

  let tokensPromise: Promise<RawTokenBalance[]>;
  let coverage: BalanceCoverage;
  let checkedEntries: number | undefined;
  let completing = false;
  // B-035: every chain's tokens in one shared reading (Alchemy Portfolio API); the per-chain list below is the
  // fallback when it isn't available. Background work (the hourly alerts checks) keeps the per-chain list: nobody
  // is waiting, and it costs a tenth per page.
  const directory =
    alchemy && chain.alchemyNetwork && serverEnv.CRYPY_WALLET_TOKENS !== "off" && !isBackground()
      ? await walletTokens(alchemy, owner, chain.alchemyNetwork).catch(() => null)
      : null;
  if (directory) {
    const given = new Map(
      directory.tokens.flatMap((t) => (t.info ? [[t.address.toLowerCase(), t.info] as const] : [])),
    );
    const listed: ListedToken[] = directory.tokens.map((t) => ({ address: t.address, raw: t.raw }));
    const parts: Promise<RawTokenBalance[]>[] = [
      readMetadata(client, chain.key, listed, given).catch(() => listed.map(unread)),
    ];
    if (!directory.complete) {
      // A list still being read, or cut off, must never miss the well-known tokens: read them directly.
      const seen = new Set(directory.tokens.map((t) => t.address.toLowerCase()));
      parts.push(
        listCommonTokens(client, chain, owner)
          .then((common) => common.filter((t) => !seen.has(t.address.toLowerCase())))
          .then((missing) => (missing.length ? readMetadata(client, chain.key, missing) : []))
          .catch(() => [] as RawTokenBalance[]),
      );
    }
    tokensPromise = Promise.all(parts).then((p) => p.flat());
    coverage = directory.complete ? "full" : "truncated";
    checkedEntries = directory.entries;
    completing = directory.completing;
  } else {
    try {
      if (!alchemy) throw new Error("No token index configured");
      // R2 part 2: one shared list per wallet and chain; each page's details are stored while the next is listed.
      const listing = sharedTokenList(alchemy, owner, chain.key, (page) => {
        void readMetadata(client, chain.key, page).catch(() => {});
      });
      let result: ListResult;
      if (isBackground()) result = await listing.full;
      else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const firstView = await Promise.race([
          listing.full,
          new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), FIRST_VIEW_MS))),
        ]).finally(() => clearTimeout(timer));
        if (firstView) result = firstView;
        else {
          // Still listing: show what has arrived; the page looks again shortly (`completing`).
          result = { tokens: [...listing.sofar], truncated: true, entries: listing.entries };
          completing = true;
        }
      }
      const pages: Promise<RawTokenBalance[]>[] = [readMetadata(client, chain.key, result.tokens)];
      if (result.truncated) {
        // A cut-off or still-completing list must never miss the well-known tokens: check them directly (one
        // multicall) and add any the list didn't reach.
        const seen = new Set(result.tokens.map((t) => t.address.toLowerCase()));
        const extra = listCommonTokens(client, chain, owner)
          .then((common) => common.filter((t) => !seen.has(t.address.toLowerCase())))
          .then((missing) => (missing.length ? readMetadata(client, chain.key, missing) : []))
          .catch(() => [] as RawTokenBalance[]);
        pages.push(extra);
      }
      tokensPromise = Promise.all(pages).then((parts) => parts.flat());
      coverage = result.truncated ? "truncated" : "full";
      checkedEntries = result.entries;
    } catch {
      // Honest fallback: only well-known tokens, and the page says so.
      const listed = await listCommonTokens(client, chain, owner);
      tokensPromise = readMetadata(client, chain.key, listed);
      coverage = "common-only";
    }
  }

  const [native, tokens] = await Promise.all([nativePromise, tokensPromise]);
  return {
    chain: chain.key,
    native: { raw: native.toString(), decimals: chain.nativeDecimals },
    tokens,
    coverage,
    ...(checkedEntries !== undefined ? { checkedEntries } : {}),
    ...(completing ? { completing } : {}),
  };
}

/** A token whose details couldn't be read: kept raw and flagged, as readMetadata does. */
const unread = (token: ListedToken): RawTokenBalance => ({
  address: token.address,
  balance: { raw: token.raw.toString(), decimals: 0 },
  info: null,
});
