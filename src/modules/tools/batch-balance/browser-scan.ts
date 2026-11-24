/**
 * "Scan in my browser" (S2 Part A.2, board 55): the same scan engine as CRYPY's servers, with readers that call the
 * chain's keyless public nodes straight from this browser. Loaded only when the visitor picks that mode.
 * Nothing here holds a key: the nodes are the public ones in config/chains.ts, also allowed by the page's CSP.
 */
import { type PublicClient, http, createPublicClient } from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";
import { type ChainState, type Reader, ReadError, type ScanRow, scanChain } from "@/lib/batch-scan/engine";
import { readBatchBalances } from "@/lib/batch-scan/read";

const viemChains = { ethereum: mainnet, bsc, base, arbitrum, polygon } as const;
type ChainKey = keyof typeof viemChains;

/** One multicall request per chunk, as on the server. */
const MULTICALL_BYTES = 96_000;
/** In the browser the engine waits less before offering to finish on CRYPY's servers. */
const BROWSER_STALL_MS = 2 * 60_000;
const BROWSER_GIVE_UP_MS = 10 * 60_000;

export function toBrowserReadError(error: unknown): ReadError {
  if (error instanceof ReadError) return error;
  const status = (error as { status?: number } | null)?.status;
  const text =
    error instanceof Error ? `${error.name} ${error.message} ${(error as { details?: string }).details ?? ""}` : "";
  if (status === 429 || /too many requests|rate limit/i.test(text)) return new ReadError("rate-limited", 5_000);
  if (
    /timeout|timed out|took too long|entity too large|\b413\b|payload|response size|out of gas|gas limit|exceeds/i.test(
      text,
    )
  ) {
    return new ReadError("timeout");
  }
  return new ReadError("failed");
}

export function browserReaders(chain: string, urls: string[]): Reader[] {
  const viemChain = viemChains[chain as ChainKey];
  if (!viemChain) return [];
  return urls.map((url) => {
    const client = createPublicClient({
      chain: viemChain,
      transport: http(url, { timeout: 8_000, retryCount: 0 }),
    }) as PublicClient;
    return {
      id: new URL(url).host,
      async read(addresses, tokens, block) {
        try {
          return await readBatchBalances(
            client,
            addresses,
            tokens,
            block === undefined ? undefined : BigInt(block),
            MULTICALL_BYTES,
          );
        } catch (error) {
          throw toBrowserReadError(error);
        }
      },
    } satisfies Reader;
  });
}

export interface BrowserScanChain {
  key: string;
  urls: string[];
  tokens: string[];
}

/** Scans every chain side by side in this browser; reports rows and each chain's state as they come. */
export async function runBrowserScan({
  chains,
  addresses,
  signal,
  isPaused,
  onRows,
  onState,
}: {
  chains: BrowserScanChain[];
  addresses: string[];
  signal: AbortSignal;
  isPaused: () => boolean;
  onRows: (chain: string, rows: ScanRow[], block: string) => void;
  onState: (chain: string, state: ChainState) => void;
}): Promise<Record<string, ChainState>> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const state = await scanChain({
        readers: browserReaders(chain.key, chain.urls),
        addresses,
        tokens: chain.tokens,
        signal,
        isPaused,
        stallAfterMs: BROWSER_STALL_MS,
        giveUpAfterMs: BROWSER_GIVE_UP_MS,
        onRows: (rows, block) => onRows(chain.key, rows, block),
        onState: (s) => onState(chain.key, s),
      });
      return [chain.key, state] as const;
    }),
  );
  return Object.fromEntries(results);
}
