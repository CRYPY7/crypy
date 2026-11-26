import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { type Hex, getAddress } from "viem";
import { z } from "zod";
import { liveChains } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { RawTokenBalance } from "@/lib/chains/types";
import { logTiming } from "@/server/diagnostics";
import { serverEnv } from "@/server/env";
import { discardBody } from "@/server/http/discard";
import { limitedFetch } from "@/server/http/limit";
import { noteAlchemyLimited, waitForAlchemy } from "./alchemy-pace";
import { BudgetExhaustedError, type Provider, budgetExhausted, recordUsage } from "./providers";

/**
 * B-035: one wallet's tokens on every chain at once, from Alchemy's Portfolio API ("Tokens By Wallet",
 * `assets/tokens/by-address`), with names, symbols and decimals included. Measured on the server (2026-11-26):
 * 0.25–0.33 s per page of 100 tokens across all 5 chains, BNB Chain included; 200 compute units per page (the
 * per-chain `alchemy_getTokenBalances` costs 20 but needs a page per chain plus our own metadata reads).
 *
 * Wallets full of airdropped spam list thousands of tokens, read one page after another. So a page waits at most
 * FIRST_VIEW_MS for the list; whatever has arrived is shown (the well-known tokens are always read directly too) and
 * the reading continues in the background up to MAX_PAGES. The finished list is kept for KEEP_MS, so the page's own
 * reload a few seconds later gets it at once. One reading per wallet at a time, shared by every caller.
 */
export const MAX_PAGES = 30;
export const FIRST_VIEW_MS = 1_500;
const KEEP_MS = 120_000;
const MAX_KEPT = 200;
const PAGE_TIMEOUT_MS = 10_000;
/** Alchemy's throughput cost per request for this API is 1 (its monthly cost is 200, counted by `recordUsage`). */
const THROUGHPUT_UNITS = 1;
export const PORTFOLIO_METHOD = "portfolio_tokensByAddress";

/**
 * A lower page limit for work inside `withWalletTokenPages` (the balances health check reads one page: it checks
 * that the list answers, at 200 units, not 6,000). Such readings are kept apart from visitors' readings.
 */
const pageLimit: AsyncLocalStorage<number> = ((
  globalThis as { __crypyWalletTokenPages?: AsyncLocalStorage<number> }
).__crypyWalletTokenPages ??= new AsyncLocalStorage<number>());

export function withWalletTokenPages<T>(pages: number, task: () => T): T {
  return pageLimit.run(Math.max(1, Math.min(MAX_PAGES, pages)), task);
}

/** Alchemy answers Polygon as "matic-mainnet" although it is asked for "polygon-mainnet". */
const NETWORK_ALIASES: Record<string, string> = { "matic-mainnet": "polygon-mainnet" };

const pageSchema = z.object({
  data: z.object({
    tokens: z.array(
      z.object({
        network: z.string().max(64),
        tokenAddress: z.string().nullish(),
        tokenBalance: z.string().nullish(),
        tokenMetadata: z
          .object({
            decimals: z.number().nullish(),
            name: z.string().nullish(),
            symbol: z.string().nullish(),
          })
          .nullish(),
        error: z.unknown().optional(),
      }),
    ),
    pageKey: z.string().max(4096).nullish(),
  }),
});

export interface DirectoryToken {
  address: Hex;
  raw: bigint;
  /** null: Alchemy had no usable name/symbol/decimals; read from the contract instead. */
  info: RawTokenBalance["info"];
}

/**
 * One page: tokens grouped by our network name. The native coin (no token address), zero and unreadable balances
 * are dropped; text is sanitized like everything read from a contract. Exported for unit tests.
 */
export function parseWalletTokensPage(json: unknown): {
  byNetwork: Map<string, DirectoryToken[]>;
  entries: Map<string, number>;
  pageKey: string | null;
} {
  const parsed = pageSchema.parse(json);
  const byNetwork = new Map<string, DirectoryToken[]>();
  const entries = new Map<string, number>();
  for (const token of parsed.data.tokens) {
    const network = NETWORK_ALIASES[token.network] ?? token.network;
    if (!token.tokenAddress) continue; // the native coin: read from the chain itself
    entries.set(network, (entries.get(network) ?? 0) + 1);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token.tokenAddress)) continue;
    if (token.error || !token.tokenBalance || !/^0x[0-9a-fA-F]{1,64}$/.test(token.tokenBalance)) continue;
    const raw = BigInt(token.tokenBalance);
    if (raw === 0n) continue;
    const meta = token.tokenMetadata;
    const decimals = meta?.decimals;
    const info =
      meta &&
      typeof decimals === "number" &&
      Number.isInteger(decimals) &&
      decimals >= 0 &&
      decimals <= 255 &&
      meta.symbol
        ? {
            name: sanitizeTokenText(meta.name ?? "", 64),
            symbol: sanitizeTokenText(meta.symbol, 32),
            decimals,
          }
        : null;
    const list = byNetwork.get(network) ?? [];
    list.push({ address: getAddress(token.tokenAddress), raw, info });
    byNetwork.set(network, list);
  }
  return { byNetwork, entries, pageKey: parsed.data.pageKey ?? null };
}

export type FetchPage = (body: unknown) => Promise<unknown>;

interface Reading {
  byNetwork: Map<string, DirectoryToken[]>;
  entries: Map<string, number>;
  pages: number;
  /** Every page was read (false while reading, or when it stopped at MAX_PAGES or after a failed later page). */
  complete: boolean;
  done: boolean;
  /** The first page failed: callers use the per-chain method instead. */
  failed: boolean;
  finished: Promise<void>;
  firstPage: Promise<void>;
  endedAt: number;
}

const readings: Map<string, Reading> = ((
  globalThis as { __crypyWalletTokens?: Map<string, Reading> }
).__crypyWalletTokens ??= new Map());

function prune(now: number) {
  for (const [key, r] of readings) if (r.done && now - r.endedAt > KEEP_MS) readings.delete(key);
  while (readings.size > MAX_KEPT) {
    const oldest = [...readings.entries()].find(([, r]) => r.done);
    if (!oldest) break;
    readings.delete(oldest[0]);
  }
}

/** Every live chain that Alchemy's Portfolio API covers for this key, by Alchemy network name. */
function networks(): string[] {
  return liveChains.flatMap((c) => (c.capabilities.tokenBalances && c.alchemyNetwork ? [c.alchemyNetwork] : []));
}

function startReading(owner: Hex, nets: string[], fetchPage: FetchPage, maxPages: number): Reading {
  let resolveFirst!: () => void;
  const reading: Reading = {
    byNetwork: new Map(),
    entries: new Map(),
    pages: 0,
    complete: false,
    done: false,
    failed: false,
    finished: Promise.resolve(),
    firstPage: new Promise<void>((r) => (resolveFirst = r)),
    endedAt: 0,
  };
  const started = Date.now();
  reading.finished = (async () => {
    let pageKey: string | null = null;
    try {
      while (reading.pages < maxPages) {
        const body = {
          addresses: [{ address: owner, networks: nets }],
          withMetadata: true,
          withPrices: false,
          includeNativeTokens: false,
          includeErc20Tokens: true,
          ...(pageKey ? { pageKey } : {}),
        };
        const page = parseWalletTokensPage(await fetchPage(body));
        for (const [net, list] of page.byNetwork)
          reading.byNetwork.set(net, [...(reading.byNetwork.get(net) ?? []), ...list]);
        for (const [net, n] of page.entries) reading.entries.set(net, (reading.entries.get(net) ?? 0) + n);
        reading.pages += 1;
        resolveFirst();
        pageKey = page.pageKey;
        if (!pageKey) {
          reading.complete = true;
          break;
        }
      }
    } catch {
      // A later page failing keeps what was read (marked as cut off); the first failing means "use the old way".
      if (reading.pages === 0) reading.failed = true;
    } finally {
      reading.done = true;
      reading.endedAt = Date.now();
      resolveFirst();
      logTiming(
        `alchemy wallet tokens: ${reading.pages} pages${reading.complete ? "" : reading.failed ? " (failed)" : " (cut off)"}, ` +
          `${[...reading.entries.values()].reduce((a, b) => a + b, 0)} entries, ${reading.endedAt - started} ms`,
      );
    }
  })();
  return reading;
}

/** The real page reader: metered against Alchemy's daily budget and per-second pace like every Alchemy call. */
export function alchemyPageFetcher(alchemy: Provider): FetchPage {
  return async (body) => {
    const key = serverEnv.ALCHEMY_API_KEY;
    if (!key) throw new Error("No Alchemy key");
    if (budgetExhausted(alchemy)) throw new BudgetExhaustedError(alchemy.name);
    await waitForAlchemy(THROUGHPUT_UNITS, 2_000);
    recordUsage(alchemy, PORTFOLIO_METHOD);
    const response = await limitedFetch(`https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) noteAlchemyLimited();
      discardBody(response);
      throw new Error(`Wallet token list responded ${response.status}`);
    }
    return response.json();
  };
}

export interface WalletTokensView {
  tokens: DirectoryToken[];
  /** Entries Alchemy listed on this chain so far (zeros included), for the "checked the first N" note. */
  entries: number;
  /** false: the list for this wallet is still being read, or stopped at MAX_PAGES. */
  complete: boolean;
  /** Still reading in the background: the page should look again in a few seconds. */
  completing: boolean;
}

/**
 * This wallet's tokens on one chain (`network`: its Alchemy name). Starts or joins the shared reading; waits for it
 * to finish, but at most `waitMs` once the first page is in. Throws when the first page failed (the caller then
 * uses the per-chain method).
 */
export async function walletTokens(
  alchemy: Provider,
  owner: string,
  network: string,
  waitMs = FIRST_VIEW_MS,
  fetchPage: FetchPage = alchemyPageFetcher(alchemy),
): Promise<WalletTokensView> {
  const now = Date.now();
  prune(now);
  const nets = networks();
  if (!nets.includes(network)) nets.push(network);
  const maxPages = pageLimit.getStore() ?? MAX_PAGES;
  const key = `${owner.toLowerCase()}|${nets.join(",")}|${maxPages}`;
  let reading = readings.get(key);
  if (!reading || (reading.done && (reading.failed || now - reading.endedAt > KEEP_MS))) {
    reading = startReading(getAddress(owner), nets, fetchPage, maxPages);
    readings.set(key, reading);
  }
  await reading.firstPage;
  if (!reading.done) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([reading.finished, new Promise<void>((r) => (timer = setTimeout(r, waitMs)))]);
    clearTimeout(timer);
  }
  if (reading.failed) {
    readings.delete(key);
    throw new Error("Wallet token list unavailable");
  }
  return {
    tokens: [...(reading.byNetwork.get(network) ?? [])],
    entries: reading.entries.get(network) ?? 0,
    complete: reading.complete,
    completing: !reading.done,
  };
}

/** Tests only. */
export function resetWalletTokens() {
  readings.clear();
}
