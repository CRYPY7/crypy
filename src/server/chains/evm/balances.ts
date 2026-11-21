import "server-only";
import { type Hex, type PublicClient, erc20Abi, getAddress } from "viem";
import { z } from "zod";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { BalanceCoverage, ChainBalances, RawTokenBalance } from "@/lib/chains/types";
import { BudgetExhaustedError, type Provider, budgetExhausted, getEvmClient, recordUsage } from "./providers";

/**
 * Alchemy lists every token an address has EVER held (including ones now at zero), 100 per page.
 * Busy wallets touch hundreds of tokens, so we read up to 10 pages (1,000 entries) and drop the zeros.
 * Cost: 20 compute units per page; results are cached per address.
 */
export const MAX_TOKEN_PAGES = 10;
const PAGE_SIZE = 100;
/** Metadata reads per multicall batch (3 calls per token). */
const METADATA_BATCH = 100;

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
export function parseTokenBalancesPage(json: unknown): { tokens: ListedToken[]; pageKey: string | null } {
  const parsed = tokenBalancesSchema.parse(json);
  if (parsed.error || !parsed.result) throw new Error("Token list provider returned an error");
  const tokens: ListedToken[] = [];
  for (const entry of parsed.result.tokenBalances) {
    if (entry.error || !entry.tokenBalance || !/^0x[0-9a-fA-F]+$/.test(entry.tokenBalance)) continue;
    const raw = BigInt(entry.tokenBalance);
    if (raw > 0n) tokens.push({ address: getAddress(entry.contractAddress), raw });
  }
  return { tokens, pageKey: parsed.result.pageKey ?? null };
}

/** Every ERC-20/BEP-20 token the address has a balance in, from Alchemy's token index. */
export async function listTokensFromAlchemy(
  provider: Provider,
  owner: string,
): Promise<{ tokens: ListedToken[]; truncated: boolean }> {
  const tokens: ListedToken[] = [];
  let pageKey: string | null = null;
  for (let page = 0; page < MAX_TOKEN_PAGES; page++) {
    const options: Record<string, unknown> = { maxCount: PAGE_SIZE };
    if (pageKey) options.pageKey = pageKey;
    // Metered like every other request: once today's budget is used, fall back to well-known tokens.
    if (budgetExhausted(provider)) throw new BudgetExhaustedError(provider.name);
    recordUsage(provider, "alchemy_getTokenBalances");
    const response = await fetch(provider.url, {
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
    if (!response.ok) throw new Error(`Token list provider responded ${response.status}`);
    const result = parseTokenBalancesPage(await response.json());
    tokens.push(...result.tokens);
    pageKey = result.pageKey;
    if (!pageKey) return { tokens, truncated: false };
  }
  return { tokens, truncated: true };
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

/** Name, symbol and decimals for many tokens with batched multicalls. Contract text is sanitized. */
async function readMetadata(client: PublicClient, tokens: ListedToken[]): Promise<RawTokenBalance[]> {
  const out: RawTokenBalance[] = [];
  for (let i = 0; i < tokens.length; i += METADATA_BATCH) {
    const batch = tokens.slice(i, i + METADATA_BATCH);
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
      out.push({
        address: token.address,
        // Without readable decimals the amount can't be shown correctly; it is kept raw and flagged.
        balance: { raw: token.raw.toString(), decimals: info?.decimals ?? 0 },
        info,
      });
    });
  }
  return out;
}

export async function getEvmBalances(
  client: PublicClient,
  chain: ChainConfig,
  address: string,
  alchemy: Provider | null,
): Promise<ChainBalances> {
  const owner = getAddress(address);
  const nativePromise = client.getBalance({ address: owner });

  let listed: ListedToken[];
  let coverage: BalanceCoverage;
  try {
    if (!alchemy) throw new Error("No token index configured");
    const result = await listTokensFromAlchemy(alchemy, owner);
    listed = result.tokens;
    coverage = result.truncated ? "truncated" : "full";
  } catch {
    // Honest fallback: only well-known tokens, and the page says so.
    listed = await listCommonTokens(client, chain, owner);
    coverage = "common-only";
  }

  const [native, tokens] = await Promise.all([nativePromise, readMetadata(client, listed)]);
  return {
    chain: chain.key,
    native: { raw: native.toString(), decimals: chain.nativeDecimals },
    tokens,
    coverage,
  };
}
