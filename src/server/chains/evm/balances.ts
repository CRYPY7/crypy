import "server-only";
import { limitedFetch } from "@/server/http/limit";
import { type Hex, type PublicClient, erc20Abi, getAddress } from "viem";
import { z } from "zod";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
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
import { discardBody } from "@/server/http/discard";

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
export const TOKEN_LIST_BUDGET_MS = 5_000;
const PAGE_SIZE = 100;
/** Metadata reads per multicall batch (3 calls per token). */
const METADATA_BATCH = 100;
/** Metadata batches read at the same time (each is one multicall). */
const METADATA_PARALLEL = 4;

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
  /** Called with each page as it arrives, so its token details can be read while the next page loads. */
  onPage?: (tokens: ListedToken[]) => void,
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
    // Shares Alchemy's per-second budget; waits at most 2 s (the whole list has a 5 s time budget).
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
    onPage?.(result.tokens);
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

type TokenInfo = NonNullable<RawTokenBalance["info"]>;

/**
 * Name, symbol and decimals never change for a deployed token, so readable ones are kept in memory (per chain,
 * bounded). Unreadable tokens are not kept: the read may have failed for a passing reason.
 */
const METADATA_CACHE_MAX = 50_000;
const metadataCache: Map<string, TokenInfo> = ((
  globalThis as { __crypyTokenMeta?: Map<string, TokenInfo> }
).__crypyTokenMeta ??= new Map());

function rememberMetadata(key: string, info: TokenInfo) {
  if (metadataCache.size >= METADATA_CACHE_MAX) {
    // Drop the oldest tenth (Map keeps insertion order).
    let n = METADATA_CACHE_MAX / 10;
    for (const k of metadataCache.keys()) {
      metadataCache.delete(k);
      if (--n <= 0) break;
    }
  }
  metadataCache.set(key, info);
}

/**
 * Name, symbol and decimals for many tokens: known ones from memory, the rest with batched multicalls, several
 * batches at once. Contract text is sanitized. Output keeps the input order.
 */
async function readMetadata(client: PublicClient, chainKey: string, tokens: ListedToken[]): Promise<RawTokenBalance[]> {
  const key = (address: string) => `${chainKey}:${address.toLowerCase()}`;
  const known = new Map<string, TokenInfo | null>();
  const missing = tokens.filter((token) => {
    const hit = metadataCache.get(key(token.address));
    if (hit) known.set(token.address, hit);
    return !hit;
  });
  const batches: ListedToken[][] = [];
  for (let i = 0; i < missing.length; i += METADATA_BATCH) batches.push(missing.slice(i, i + METADATA_BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      await readMetadataBatch(client, batch, (address, info) => {
        known.set(address, info);
        if (info) rememberMetadata(key(address), info);
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(METADATA_PARALLEL, batches.length) }, worker));
  return tokens.map((token) => {
    const info = known.get(token.address) ?? null;
    return {
      address: token.address,
      // Without readable decimals the amount can't be shown correctly; it is kept raw and flagged.
      balance: { raw: token.raw.toString(), decimals: info?.decimals ?? 0 },
      info,
    };
  });
}

async function readMetadataBatch(
  client: PublicClient,
  batch: ListedToken[],
  found: (address: string, info: TokenInfo | null) => void,
): Promise<void> {
  const results = await client.multicall({
    allowFailure: true,
    contracts: batch.flatMap((token) => [
      { address: token.address, abi: erc20Abi, functionName: "name" as const },
      { address: token.address, abi: erc20Abi, functionName: "symbol" as const },
      { address: token.address, abi: erc20Abi, functionName: "decimals" as const },
    ]),
  });
  batch.forEach((token, j) => {
    const [name, symbol, decimals] = [results[j * 3], results[j * 3 + 1], results[j * 3 + 2]];
    const dec = decimals?.status === "success" ? Number(decimals.result) : NaN;
    const validDecimals = Number.isInteger(dec) && dec >= 0 && dec <= 255;
    const info =
      validDecimals && symbol?.status === "success"
        ? {
            name: sanitizeTokenText(name?.status === "success" ? name.result : "", 64),
            symbol: sanitizeTokenText(symbol.result, 32),
            decimals: dec,
          }
        : null;
    found(token.address, info);
  });
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
  try {
    if (!alchemy) throw new Error("No token index configured");
    // Each page's token details are read while the next page is listed.
    const pages: Promise<RawTokenBalance[]>[] = [];
    const result = await listTokensFromAlchemy(alchemy, owner, (page) => {
      const read = readMetadata(client, chain.key, page);
      read.catch(() => {}); // If listing fails later, these reads are dropped: never an unhandled rejection.
      pages.push(read);
    });
    if (result.truncated) {
      // A cut-off list must never miss the well-known tokens: check them directly (one multicall) and add any the
      // list didn't reach.
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

  const [native, tokens] = await Promise.all([nativePromise, tokensPromise]);
  return {
    chain: chain.key,
    native: { raw: native.toString(), decimals: chain.nativeDecimals },
    tokens,
    coverage,
    ...(checkedEntries !== undefined ? { checkedEntries } : {}),
  };
}
