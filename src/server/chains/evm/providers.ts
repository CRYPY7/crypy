import "server-only";
import {
  type Chain,
  type EIP1193RequestFn,
  type PublicClient,
  type Transport,
  createPublicClient,
  createTransport,
  http,
  shouldThrow,
} from "viem";
import { arbitrum, base, bsc, mainnet, polygon } from "viem/chains";
import type { ChainConfig, ChainKey } from "@/config/chains";
import { serverEnv } from "@/server/env";

/**
 * Free blockchain providers, tried in order, each with a daily budget (zero-API-cost rule).
 *
 *   1. Alchemy free plan (budget in compute units, ~1/30 of the monthly allowance per day)
 *   2. Extra free providers from <CHAIN>_RPC_URLS (ETH, BSC, BASE, ARBITRUM, POLYGON) (dRPC, Ankr, Chainstack, Infura…; budget in requests)
 *   3. Free public nodes (no budget; they rate-limit on their own)
 *
 * When a provider's budget for the day is used up it is skipped until midnight UTC, so no free plan
 * runs out and a busy day can't use up the month. Usage is kept in memory per server (shared store at launch).
 */

const viemChains: Record<ChainKey, Chain> = { ethereum: mainnet, bsc, base, arbitrum, polygon };

export interface Provider {
  /** Safe to show (host name), never the URL, which may contain a key. */
  name: string;
  url: string;
  kind: "alchemy" | "extra" | "public";
}

/** Alchemy compute units per method (alchemy.com/docs/reference/compute-unit-costs). */
const ALCHEMY_CU: Record<string, number> = {
  eth_blockNumber: 10,
  eth_chainId: 0,
  eth_call: 26,
  eth_getLogs: 60,
  alchemy_getTokenBalances: 20,
  alchemy_getAssetTransfers: 120,
};
const DEFAULT_CU = 20;

export function alchemyUnits(method: string): number {
  return ALCHEMY_CU[method] ?? DEFAULT_CU;
}

/** "https://rpc.ankr.com/bsc/KEY" → "ankr.com". Keys live in paths or queries, never in host names. */
export function providerLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split(".").slice(-2).join(".");
  } catch {
    return "custom";
  }
}

/** Extra free providers per chain, from `<CHAIN>_RPC_URLS` in .env.local. */
const extraUrls: Record<ChainKey, string[]> = {
  ethereum: serverEnv.ETH_RPC_URLS,
  bsc: serverEnv.BSC_RPC_URLS,
  base: serverEnv.BASE_RPC_URLS,
  arbitrum: serverEnv.ARBITRUM_RPC_URLS,
  polygon: serverEnv.POLYGON_RPC_URLS,
};

export function providersFor(chain: ChainConfig): Provider[] {
  const list: Provider[] = [];
  if (serverEnv.ALCHEMY_API_KEY && chain.alchemyNetwork) {
    list.push({
      name: "alchemy",
      kind: "alchemy",
      url: `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${serverEnv.ALCHEMY_API_KEY}`,
    });
  }
  const extra = extraUrls[chain.key];
  for (const url of extra) list.push({ name: providerLabel(url), kind: "extra", url });
  for (const url of chain.publicRpcUrls) list.push({ name: `public:${providerLabel(url)}`, kind: "public", url });
  return list;
}

// ---- Daily usage meter -------------------------------------------------------------------------

interface Usage {
  day: string;
  requests: number;
  units: number;
}

// One meter per server process. Next.js can load this module more than once (pages, API routes),
// so the map lives on globalThis to keep a single count.
const globalKey = Symbol.for("crypy.providerUsage");
const holder = globalThis as unknown as Record<symbol, Map<string, Usage> | undefined>;
const usage: Map<string, Usage> = (holder[globalKey] ??= new Map<string, Usage>());
const today = () => new Date().toISOString().slice(0, 10);

function usageFor(key: string): Usage {
  const day = today();
  let entry = usage.get(key);
  if (!entry || entry.day !== day) {
    entry = { day, requests: 0, units: 0 };
    usage.set(key, entry);
  }
  return entry;
}

/** Budgets are per provider account, so all chains of one provider share it. */
function budgetKey(provider: Provider): string {
  return provider.kind === "alchemy" ? "alchemy" : provider.name;
}

export function budgetExhausted(provider: Provider): boolean {
  if (provider.kind === "public") return false;
  const used = usageFor(budgetKey(provider));
  return provider.kind === "alchemy"
    ? used.units >= serverEnv.ALCHEMY_DAILY_CU
    : used.requests >= serverEnv.RPC_DAILY_REQUESTS;
}

export function recordUsage(provider: Provider, method: string): void {
  const used = usageFor(budgetKey(provider));
  used.requests += 1;
  used.units += provider.kind === "alchemy" ? alchemyUnits(method) : 0;
}

export class BudgetExhaustedError extends Error {
  constructor(provider: string) {
    super(`Daily budget used up for ${provider}`);
    this.name = "BudgetExhaustedError";
  }
}

/** Today's usage per provider, for the health page (names and numbers only). */
export function usageSnapshot(): { provider: string; requests: number; units?: number; limit: number | null }[] {
  const day = today();
  return [...usage.entries()]
    .filter(([, value]) => value.day === day)
    .map(([provider, value]) =>
      provider === "alchemy"
        ? { provider, requests: value.requests, units: value.units, limit: serverEnv.ALCHEMY_DAILY_CU }
        : provider.startsWith("public:")
          ? { provider, requests: value.requests, limit: null }
          : { provider, requests: value.requests, limit: serverEnv.RPC_DAILY_REQUESTS },
    );
}

/** Test helper: forget all usage. */
export function resetUsage(): void {
  usage.clear();
}

// ---- Transports ----------------------------------------------------------------------------------

/**
 * An HTTP transport that counts every request against its provider's daily budget and refuses
 * (so the fallback moves on) once the budget is used up. Concurrent requests are sent as one
 * JSON-RPC batch to save round trips.
 */
// ---- Unreachable providers ------------------------------------------------------------------------

/** How long a provider that timed out or couldn't be reached is skipped, so later requests don't wait for it again. */
export const COOL_DOWN_MS = 60_000;
type Health = Map<string, number>;
const healthKey = Symbol.for("crypy.providerCoolDown");
const coolDown: Health = ((globalThis as Record<symbol, Health>)[healthKey] ??= new Map());

export class ProviderCoolingDownError extends Error {
  constructor(name: string) {
    super(`Provider ${name} is skipped for a moment after failing to answer`);
    this.name = "ProviderCoolingDownError";
  }
}

/** Only connection problems count (timeouts, network errors, HTTP 5xx/429), never a node's answer such as a revert. */
export function isUnreachable(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError") return true;
  if (name === "HttpRequestError") {
    const status = (error as { status?: number }).status;
    return status === undefined || status === 429 || status >= 500;
  }
  return false;
}

export function isCoolingDown(provider: Provider, now = Date.now()): boolean {
  const until = coolDown.get(provider.url);
  return until !== undefined && until > now;
}

/**
 * When every provider of a chain is resting at once (for example after a burst of heavy checks), failing every request
 * for up to a minute would make CRYPY look broken. Instead, the provider whose rest ends soonest gets another try now.
 * Providers over their daily budget stay off (zero-cost rule).
 */
export function wakeOneIfAllResting(providers: Provider[], now = Date.now()): void {
  const withBudget = providers.filter((p) => !budgetExhausted(p));
  if (withBudget.length === 0 || withBudget.some((p) => !isCoolingDown(p, now))) return;
  const soonest = withBudget.reduce((x, y) => ((coolDown.get(y.url) ?? 0) < (coolDown.get(x.url) ?? 0) ? y : x));
  coolDown.delete(soonest.url);
}

/** Test helper. */
export function coolDownFor(provider: Provider, ms: number): void {
  coolDown.set(provider.url, Date.now() + ms);
}

/** Test helper. */
export function resetCoolDown(): void {
  coolDown.clear();
}

// ---- Speed ranking ----------------------------------------------------------------------------------

/**
 * Response times measured from real requests (moving average per provider). The rotation tries the fastest working
 * provider first, so CRYPY adapts to wherever it runs (a PC far from one provider, a VPS close to another).
 * A provider not measured for a while falls back to its starting estimate, so it gets another chance.
 */
interface Speed {
  ms: number;
  at: number;
}
const speedKey = Symbol.for("crypy.providerSpeed");
const speeds: Map<string, Speed> = ((globalThis as Record<symbol, Map<string, Speed>>)[speedKey] ??= new Map());
const SPEED_MEMORY_MS = 10 * 60_000;
/** Starting estimates keep the configured preference until real measurements exist. */
const PRIOR_MS: Record<Provider["kind"], number> = { alchemy: 300, extra: 350, public: 450 };

export function recordLatency(provider: Provider, ms: number, now = Date.now()): void {
  const previous = speeds.get(provider.url);
  const fresh = previous && now - previous.at < SPEED_MEMORY_MS;
  speeds.set(provider.url, { ms: fresh ? previous.ms * 0.7 + ms * 0.3 : ms, at: now });
}

export function expectedLatency(provider: Provider, now = Date.now()): number {
  const speed = speeds.get(provider.url);
  return speed && now - speed.at < SPEED_MEMORY_MS ? speed.ms : PRIOR_MS[provider.kind];
}

/** Providers in the order to try: fastest expected first; cooling-down or over-budget ones last. */
export function rankProviders(providers: Provider[], now = Date.now()): Provider[] {
  const usable = (p: Provider) => !isCoolingDown(p, now) && !budgetExhausted(p);
  return [...providers].sort((a, b) => {
    const ua = usable(a);
    const ub = usable(b);
    if (ua !== ub) return ua ? -1 : 1;
    return expectedLatency(a, now) - expectedLatency(b, now);
  });
}

/** How long to wait for a provider before also asking the next one: 2.5× its expected time, 0.7–2.5 s. */
export function hedgeDelay(provider: Provider, now = Date.now()): number {
  return Math.min(2_500, Math.max(700, Math.round(expectedLatency(provider, now) * 2.5)));
}

/** Test helper. */
export function resetSpeeds(): void {
  speeds.clear();
}

/**
 * Like viem's fallback, but the order is decided per request by measured speed. Errors where another node can't help
 * (a revert, a rejected request) are thrown at once, as viem's fallback does.
 */
/** Lookups where a null answer from one node may only mean that node hasn't seen it (yet). */
const NOT_FOUND_IS_NOT_FINAL = new Set(["eth_getTransactionByHash", "eth_getTransactionReceipt"]);

/**
 * Some free nodes refuse requests about old blocks ("archive requests require a personal token", "missing trie node").
 * We remember that per provider and method for a while and ask them last, instead of first. Temporary on purpose:
 * one refusal never removes a provider, and the note expires.
 */
const REFUSAL_MS = 10 * 60_000;
const refusals = new Map<string, number>();
const REFUSAL_PATTERN =
  /archive|missing trie node|pruned|historical state|state (?:is )?not available|header not found/i;

export function noteRefusal(provider: Provider, method: string, error: unknown): void {
  const text = error instanceof Error ? `${error.message} ${(error as { details?: string }).details ?? ""}` : "";
  if (REFUSAL_PATTERN.test(text)) refusals.set(`${provider.url}|${method}`, Date.now() + REFUSAL_MS);
}

/** The error is a node refusing old data, not an answer about the request itself. */
export function isRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const details = (error as { details?: unknown }).details;
  return REFUSAL_PATTERN.test(`${error.message} ${typeof details === "string" ? details : ""}`);
}

export function refusesLately(provider: Provider, method: string): boolean {
  const until = refusals.get(`${provider.url}|${method}`);
  if (until === undefined) return false;
  if (until < Date.now()) {
    refusals.delete(`${provider.url}|${method}`);
    return false;
  }
  return true;
}

export function resetRefusals(): void {
  refusals.clear();
}

export function rankedFallback(providers: Provider[]): Transport {
  return (options) => {
    const transports = new Map(providers.map((provider) => [provider.url, meteredHttp(provider)(options)]));
    return createTransport({
      key: "ranked-fallback",
      name: "Ranked fallback",
      type: "fallback",
      retryCount: 0,
      // Typed loosely like viem's own transports; arguments are passed through unchanged.
      request: ((args: { method: string; params?: unknown }) =>
        new Promise<unknown>((resolve, reject) => {
          // Try the fastest provider; if it is slow to answer, also ask the next one ("hedging") and take the
          // first answer. Safe because the server only reads: it never sends transactions.
          // Fastest first; providers that recently refused this kind of request (old data) go last.
          wakeOneIfAllResting(providers);
          const ranked = rankProviders(providers);
          const ordered = [
            ...ranked.filter((p) => !refusesLately(p, args.method)),
            ...ranked.filter((p) => refusesLately(p, args.method)),
          ];
          let next = 0;
          let inFlight = 0;
          let settled = false;
          let lastError: unknown = new Error("No provider available");
          let sawNull = false;
          const finish = (error: unknown) => {
            if (!settled && inFlight === 0 && next >= ordered.length) {
              settled = true;
              // Some nodes said "not found" and the others failed: that is still "not found", not an outage.
              if (sawNull) resolve(null);
              else reject(error);
            }
          };
          let woke = false;
          const start = () => {
            if (settled) return;
            if (next >= ordered.length && !woke) {
              // Everyone else failed or refused, and some providers are only resting after an earlier slow answer:
              // a rest is a speed measure, not a ban, so the one whose rest ends soonest gets one more try.
              woke = true;
              const resting = providers.filter((p) => isCoolingDown(p) && !budgetExhausted(p));
              if (resting.length > 0) {
                const soonest = resting.reduce((x, y) =>
                  (coolDown.get(y.url) ?? 0) < (coolDown.get(x.url) ?? 0) ? y : x,
                );
                coolDown.delete(soonest.url);
                ordered.push(soonest);
              }
            }
            if (next >= ordered.length) return finish(lastError);
            const provider = ordered[next++]!;
            const transport = transports.get(provider.url)!;
            inFlight += 1;
            const hedge = setTimeout(start, hedgeDelay(provider));
            (transport.request as (a: typeof args) => Promise<unknown>)(args).then(
              (value) => {
                clearTimeout(hedge);
                inFlight -= 1;
                if (settled) return;
                // "I don't have it" from one node isn't final for lookups: nodes lag behind or disagree. Ask every
                // remaining provider at once; answer null only when none of them has it.
                if (value === null && NOT_FOUND_IS_NOT_FINAL.has(args.method)) {
                  sawNull = true;
                  while (next < ordered.length) start();
                  if (inFlight > 0) return; // wait for the others
                  settled = true;
                  resolve(null);
                  return;
                }
                settled = true;
                resolve(value);
              },
              (error: unknown) => {
                clearTimeout(hedge);
                inFlight -= 1;
                if (settled) return;
                // A node that refuses old data ("archive requests require a personal token") answers with an
                // "invalid parameters" error, which would otherwise end the request: ask the next provider instead.
                const refused = isRefusal(error);
                if (!refused && error instanceof Error && shouldThrow(error)) {
                  settled = true;
                  reject(error);
                  return;
                }
                lastError = error;
                noteRefusal(provider, args.method, error);
                // start() moves on, gives a resting provider its last try, or finishes.
                start();
              },
            );
          };
          start();
        })) as EIP1193RequestFn,
    });
  };
}

export function meteredHttp(provider: Provider, timeout = 5_000): Transport {
  // Free plans often limit batches (dRPC free: 3 per call). Bigger rounds go out as a few parallel calls instead.
  const batchSize = provider.kind === "alchemy" ? 20 : 3;
  const inner = http(provider.url, { timeout, retryCount: 0, batch: { batchSize, wait: 10 } });
  return (options) => {
    const transport = inner(options);
    return {
      ...transport,
      async request(args: { method: string; params?: unknown }, requestOptions?: unknown) {
        if (budgetExhausted(provider)) throw new BudgetExhaustedError(provider.name);
        if (isCoolingDown(provider)) throw new ProviderCoolingDownError(provider.name);
        recordUsage(provider, args.method);
        const started = Date.now();
        try {
          const result = await (transport.request as (a: typeof args, o?: unknown) => Promise<unknown>)(
            args,
            requestOptions,
          );
          recordLatency(provider, Date.now() - started);
          return result;
        } catch (error) {
          if (isUnreachable(error)) coolDown.set(provider.url, Date.now() + COOL_DOWN_MS);
          // A node's own error answer still tells us how fast it is.
          else recordLatency(provider, Date.now() - started);
          throw error;
        }
      },
    } as ReturnType<Transport>;
  };
}

const clients = new Map<ChainKey, PublicClient>();

/** One client per chain over the provider rotation. */
export function getEvmClient(chain: ChainConfig): PublicClient {
  let client = clients.get(chain.key);
  if (!client) {
    client = createPublicClient({
      chain: viemChains[chain.key],
      batch: { multicall: { batchSize: 4_096 } },
      transport: rankedFallback(providersFor(chain)),
    }) as PublicClient;
    clients.set(chain.key, client);
  }
  return client;
}

/** A single-provider client, for health checks. */
export function clientFor(chain: ChainConfig, provider: Provider): PublicClient {
  return createPublicClient({ chain: viemChains[chain.key], transport: meteredHttp(provider, 5_000) }) as PublicClient;
}

const archiveClients = new Map<ChainKey, PublicClient>();

/**
 * A client for reads at old blocks (failure replay, past prices): only providers that keep full history (Alchemy).
 * Null when none is configured, so callers skip those reads instead of asking nodes that can't answer.
 */
export function archiveClient(chain: ChainConfig): PublicClient | null {
  const archive = providersFor(chain).filter((provider) => provider.kind === "alchemy");
  if (archive.length === 0) return null;
  let client = archiveClients.get(chain.key);
  if (!client) {
    client = createPublicClient({
      chain: viemChains[chain.key],
      transport: rankedFallback(archive),
    }) as PublicClient;
    archiveClients.set(chain.key, client);
  }
  return client;
}

/** The Alchemy provider for Alchemy-only methods (token index), if configured and within budget. */
export function alchemyProvider(chain: ChainConfig): Provider | null {
  return providersFor(chain).find((provider) => provider.kind === "alchemy") ?? null;
}
