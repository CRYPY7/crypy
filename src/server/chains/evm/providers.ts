import "server-only";
import { AlchemyBusyError, noteAlchemyLimited, takeAlchemyNow, waitForAlchemy } from "./alchemy-pace";
import { limitedFetch } from "@/server/http/limit";
import { isBackground } from "@/server/background";
import { alchemyDailyLimit } from "./alchemy-budget";
import { recordOutcome } from "./provider-health";
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
  // R2 discovery, "Token Balances By Wallet" (balances only, no metadata): counted high (the related "Tokens By Wallet"
  // cost 360–920 per request on the owner's dashboard, 2026-11-26) until the dashboard shows its real cost (method
  // "data/assets/tokens/balances/by-address").
  portfolio_balancesByAddress: 1_000,
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
  /** Alchemy only: compute units by method, and the part spent by background work. */
  byMethod: Map<string, number>;
  backgroundUnits: number;
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
    entry = { day, requests: 0, units: 0, byMethod: new Map(), backgroundUnits: 0 };
    usage.set(key, entry);
  }
  return entry;
}

/** Budgets are per provider account, so all chains of one provider share it. */
function budgetKey(provider: Provider): string {
  return provider.kind === "alchemy" ? "alchemy" : provider.name;
}

// ---- Alchemy's limit for today ---------------------------------------------------------------------

/** Units spent earlier this month (from the database), per UTC day; unknown until the usage store has been read. */
interface MonthState {
  day: string;
  usedEarlier: number;
}
const monthKey = Symbol.for("crypy.alchemyMonth");
const monthHolder = globalThis as unknown as Record<symbol, MonthState | undefined>;

/** Called by the usage store after reading the database. */
export function setAlchemyMonthUsage(day: string, usedEarlier: number): void {
  monthHolder[monthKey] = { day, usedEarlier };
}

/**
 * Today's Alchemy limit in compute units: a fixed ALCHEMY_DAILY_CU when set, otherwise what is left of the monthly
 * plan spread over the days left (alchemy-budget.ts).
 */
export function alchemyLimitToday(now = Date.now()): number {
  if (serverEnv.ALCHEMY_DAILY_CU) return serverEnv.ALCHEMY_DAILY_CU;
  const month = monthHolder[monthKey];
  const known = month && month.day === new Date(now).toISOString().slice(0, 10) ? month.usedEarlier : null;
  return alchemyDailyLimit({ monthly: serverEnv.ALCHEMY_MONTHLY_CU, usedEarlierThisMonth: known, now });
}

/**
 * Alchemy's daily budget is split in tiers, so what only Alchemy can do (full token lists, transfer history, old-block
 * reads) stays available for visitors all day:
 * - ordinary reads that other providers can also answer use Alchemy only for the first 30% of the day's units;
 * - background work (alerts worker, health checks, daily token checks, lock index) stops using Alchemy at 50%;
 * - the rest is kept for visitors' Alchemy-only requests.
 * Each tier falls back as before: ordinary reads to the next provider, Alchemy-only parts to "not available" notes.
 */
export const ALCHEMY_ORDINARY_SHARE = 0.3;
export const ALCHEMY_BACKGROUND_SHARE = 0.5;

/**
 * Whether this provider must not take the request. `ordinary` = a read inside the rotation that another provider can
 * also answer (as opposed to an Alchemy-only call).
 */
export function budgetExhausted(provider: Provider, ordinary = false): boolean {
  if (provider.kind === "public") return false;
  const used = usageFor(budgetKey(provider));
  if (provider.kind !== "alchemy") return used.requests >= serverEnv.RPC_DAILY_REQUESTS;
  const today = alchemyLimitToday();
  let limit = today;
  if (isBackground()) limit = Math.min(limit, today * ALCHEMY_BACKGROUND_SHARE);
  if (ordinary) limit = Math.min(limit, today * ALCHEMY_ORDINARY_SHARE);
  return used.units >= limit;
}

/** Requests this provider's account has taken today (the budget of extra providers is counted in requests). */
export function requestsToday(provider: Provider): number {
  return usageFor(budgetKey(provider)).requests;
}

export function recordUsage(provider: Provider, method: string): void {
  const used = usageFor(budgetKey(provider));
  used.requests += 1;
  if (provider.kind !== "alchemy") return;
  const units = alchemyUnits(method);
  used.units += units;
  used.byMethod.set(method, (used.byMethod.get(method) ?? 0) + units);
  if (isBackground()) used.backgroundUnits += units;
}

export class BudgetExhaustedError extends Error {
  constructor(provider: string) {
    super(`Daily budget used up for ${provider}`);
    this.name = "BudgetExhaustedError";
  }
}

export interface AlchemyBreakdown {
  /** Units spent by background work (the rest by visitors). */
  backgroundUnits: number;
  /** Methods by units spent today, largest first. */
  methods: { method: string; units: number }[];
  /** Where the tiers start, in units. */
  ordinaryLimit: number;
  backgroundLimit: number;
  /** The monthly plan, whether ALCHEMY_DAILY_CU fixes the day instead, and units spent before today (null: unknown). */
  monthly: number;
  fixedDaily: boolean;
  usedEarlierThisMonth: number | null;
}

/** Today's usage per provider, for the health page (names and numbers only). */
export function usageSnapshot(): {
  provider: string;
  requests: number;
  units?: number;
  limit: number | null;
  alchemy?: AlchemyBreakdown;
}[] {
  const day = today();
  return [...usage.entries()]
    .filter(([, value]) => value.day === day)
    .map(([provider, value]) =>
      provider === "alchemy"
        ? {
            provider,
            requests: value.requests,
            units: value.units,
            limit: alchemyLimitToday(),
            alchemy: {
              backgroundUnits: value.backgroundUnits,
              methods: [...value.byMethod.entries()]
                .map(([method, units]) => ({ method, units }))
                .sort((a, b) => b.units - a.units),
              ordinaryLimit: Math.round(alchemyLimitToday() * ALCHEMY_ORDINARY_SHARE),
              backgroundLimit: Math.round(alchemyLimitToday() * ALCHEMY_BACKGROUND_SHARE),
              monthly: serverEnv.ALCHEMY_MONTHLY_CU,
              fixedDaily: Boolean(serverEnv.ALCHEMY_DAILY_CU),
              usedEarlierThisMonth: monthHolder[monthKey]?.usedEarlier ?? null,
            },
          }
        : provider.startsWith("public:")
          ? { provider, requests: value.requests, limit: null }
          : { provider, requests: value.requests, limit: serverEnv.RPC_DAILY_REQUESTS },
    );
}

/** Test helper: forget all usage. */
export function resetUsage(): void {
  usage.clear();
  delete monthHolder[monthKey];
}

/** Today's counts per budget key, for saving (usage-store.ts). */
export function usageToSave(): {
  day: string;
  provider: string;
  requests: number;
  units: number;
  backgroundUnits: number;
}[] {
  const day = today();
  return [...usage.entries()]
    .filter(([, value]) => value.day === day)
    .map(([provider, value]) => ({
      day,
      provider,
      requests: value.requests,
      units: value.units,
      backgroundUnits: value.backgroundUnits,
    }));
}

/**
 * Adds today's saved counts from before a restart to this process's counts (once, when the usage store is first read).
 * Requests made by an earlier process after its last save (at most a minute) are not known.
 */
export function addSavedUsage(
  saved: { provider: string; requests: number; units: number; backgroundUnits: number }[],
): void {
  for (const row of saved) {
    const entry = usageFor(row.provider);
    entry.requests += row.requests;
    entry.units += row.units;
    entry.backgroundUnits += row.backgroundUnits;
  }
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

/**
 * A node answered without a result or an error (seen from free providers under load: a batch reply carrying only its
 * id). JSON-RPC always sends one of the two, so the answer is unusable: treated like an unreachable node, so the next
 * provider is asked and this one rests for a minute. Without this, viem passes `undefined` on as the result and the
 * caller fails with "Cannot convert undefined to a BigInt".
 */
export class MalformedAnswerError extends Error {
  constructor(name: string, method: string) {
    super(`Provider ${name} answered ${method} without a result`);
    this.name = "MalformedAnswerError";
  }
}

const malformedKey = Symbol.for("crypy.providerMalformed");
const malformedLogged: Map<string, number> = ((globalThis as Record<symbol, Map<string, number>>)[malformedKey] ??=
  new Map());

/** One server log line per provider and method per 10 minutes (host name only, never the URL with its key). */
function logMalformed(provider: Provider, method: string, now = Date.now()): void {
  const key = `${provider.name}|${method}`;
  const last = malformedLogged.get(key);
  if (last !== undefined && now - last < 10 * 60_000) return;
  malformedLogged.set(key, now);
  console.warn(`[crypy] provider ${provider.name} answered ${method} without a result; asking the next provider`);
}

/** Only connection problems count (timeouts, network errors, HTTP 5xx/429), never a node's answer such as a revert. */
export function isUnreachable(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "MalformedAnswerError") return true;
  if (name === "HttpRequestError") {
    const status = (error as { status?: number }).status;
    return status === undefined || status === 429 || status >= 500;
  }
  return false;
}

/**
 * Per-method rest (S3): a node that times out or fails on one kind of request (often heavy log or multicall reads)
 * usually still answers cheap ones, so only that method rests. Connection failures and "too many requests" rest the
 * whole provider, and so does a second method failing during the same minute: then the node itself is struggling.
 */
const methodKey = Symbol.for("crypy.providerMethodCoolDown");
const methodCoolDown: Health = ((globalThis as Record<symbol, Health>)[methodKey] ??= new Map());
const methodSlot = (provider: Provider, method: string) => `${provider.url}|${method}`;

/** No answer at all (refused connection, DNS, reset) or "too many requests": the whole provider is unavailable. */
export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "HttpRequestError") return false;
  const status = (error as { status?: number }).status;
  return status === undefined || status === 429;
}

/** Rest after an unreachable-type failure: just this method, or the whole provider (see above). */
export function restAfterFailure(provider: Provider, method: string, error: unknown, now = Date.now()): void {
  if (isConnectionFailure(error)) {
    coolDown.set(provider.url, now + COOL_DOWN_MS);
    return;
  }
  const prefix = `${provider.url}|`;
  const othersResting = [...methodCoolDown].some(
    ([slot, until]) => until > now && slot.startsWith(prefix) && slot !== methodSlot(provider, method),
  );
  if (othersResting) coolDown.set(provider.url, now + COOL_DOWN_MS);
  else methodCoolDown.set(methodSlot(provider, method), now + COOL_DOWN_MS);
}

/** When the provider (or, given a method, that method on it) may be asked again; 0 when it isn't resting. */
function restEnds(provider: Provider, method?: string): number {
  const whole = coolDown.get(provider.url) ?? 0;
  return method === undefined ? whole : Math.max(whole, methodCoolDown.get(methodSlot(provider, method)) ?? 0);
}

/** End a rest early (the whole provider and, given one, that method). */
function wake(provider: Provider, method?: string): void {
  coolDown.delete(provider.url);
  if (method !== undefined) methodCoolDown.delete(methodSlot(provider, method));
}

export function isCoolingDown(provider: Provider, now = Date.now(), method?: string): boolean {
  return restEnds(provider, method) > now;
}

/**
 * When every provider of a chain is resting at once (for example after a burst of heavy checks), failing every request
 * for up to a minute would make CRYPY look broken. Instead, the provider whose rest ends soonest gets another try now.
 * Providers over their daily budget stay off (zero-cost rule).
 */
export function wakeOneIfAllResting(providers: Provider[], now = Date.now(), method?: string): void {
  const withBudget = providers.filter((p) => !budgetExhausted(p, true));
  if (withBudget.length === 0 || withBudget.some((p) => !isCoolingDown(p, now, method))) return;
  const soonest = withBudget.reduce((x, y) => (restEnds(y, method) < restEnds(x, method) ? y : x));
  wake(soonest, method);
}

/** What is resting now, for the admin page: the whole provider (until when) and single methods. */
export function restingNow(provider: Provider, now = Date.now()): { until: number | null; methods: string[] } {
  const whole = coolDown.get(provider.url) ?? 0;
  const prefix = `${provider.url}|`;
  const methods = [...methodCoolDown]
    .filter(([slot, until]) => until > now && slot.startsWith(prefix))
    .map(([slot]) => slot.slice(prefix.length));
  return { until: whole > now ? whole : null, methods };
}

/** Test helper. */
export function coolDownFor(provider: Provider, ms: number): void {
  coolDown.set(provider.url, Date.now() + ms);
}

/** Test helper. */
export function resetCoolDown(): void {
  coolDown.clear();
  methodCoolDown.clear();
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
export function rankProviders(providers: Provider[], now = Date.now(), method?: string): Provider[] {
  const usable = (p: Provider) => !isCoolingDown(p, now, method) && !budgetExhausted(p, true);
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
  /archive|missing trie node|pruned|historical state|state (?:is )?not available|header not found|block range|range (?:is )?too (?:large|wide|big)|too many blocks|exceeds? (?:the )?(?:max(?:imum)? )?(?:block )?range|query returned more than|free tier/i;

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
    // With other providers to turn to, a read never waits for Alchemy's per-second budget; with Alchemy alone
    // (old-block reads), it waits its turn.
    const pace: AlchemyPace = providers.some((p) => p.kind !== "alchemy") ? "skip" : "wait";
    const transports = new Map(
      providers.map((provider) => [provider.url, meteredHttp(provider, 5_000, pace)(options)]),
    );
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
          wakeOneIfAllResting(providers, Date.now(), args.method);
          const ranked = rankProviders(providers, Date.now(), args.method);
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
              const resting = providers.filter(
                (p) => isCoolingDown(p, Date.now(), args.method) && !budgetExhausted(p, pace === "skip"),
              );
              if (resting.length > 0) {
                const soonest = resting.reduce((x, y) => (restEnds(y, args.method) < restEnds(x, args.method) ? y : x));
                wake(soonest, args.method);
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

/** How a request to Alchemy handles its per-second budget: go to another provider at once, or wait (up to 3 s). */
export type AlchemyPace = "skip" | "wait";
const ALCHEMY_MAX_WAIT_MS = 3_000;

export function isTooManyRequests(error: unknown): boolean {
  return error instanceof Error && error.name === "HttpRequestError" && (error as { status?: number }).status === 429;
}

export function meteredHttp(provider: Provider, timeout = 5_000, pace: AlchemyPace = "wait"): Transport {
  // Free plans often limit batches (dRPC free: 3 per call). Bigger rounds go out as a few parallel calls instead.
  const batchSize = provider.kind === "alchemy" ? 20 : 3;
  const inner = http(provider.url, {
    timeout,
    retryCount: 0,
    batch: { batchSize, wait: 10 },
    fetchFn: limitedFetch,
  });
  return (options) => {
    const transport = inner(options);
    return {
      ...transport,
      async request(args: { method: string; params?: unknown }, requestOptions?: unknown) {
        // Inside a rotation ("skip"), Alchemy takes ordinary reads only within its ordinary share.
        if (budgetExhausted(provider, pace === "skip")) throw new BudgetExhaustedError(provider.name);
        if (isCoolingDown(provider, Date.now(), args.method)) throw new ProviderCoolingDownError(provider.name);
        if (provider.kind === "alchemy") {
          const units = alchemyUnits(args.method);
          if (pace === "skip") {
            if (!takeAlchemyNow(units)) throw new AlchemyBusyError();
          } else await waitForAlchemy(units, ALCHEMY_MAX_WAIT_MS);
        }
        recordUsage(provider, args.method);
        const started = Date.now();
        try {
          const result = await (transport.request as (a: typeof args, o?: unknown) => Promise<unknown>)(
            args,
            requestOptions,
          );
          if (result === undefined) {
            logMalformed(provider, args.method);
            throw new MalformedAnswerError(provider.name, args.method);
          }
          recordLatency(provider, Date.now() - started);
          recordOutcome(provider.url, args.method, "ok", Date.now() - started);
          return result;
        } catch (error) {
          const ms = Date.now() - started;
          // Alchemy's "too many requests" is about this second, not an outage: pause it briefly instead of a minute.
          if (provider.kind === "alchemy" && isTooManyRequests(error)) {
            noteAlchemyLimited();
            recordOutcome(provider.url, args.method, "limited", ms);
          } else if (isUnreachable(error)) {
            restAfterFailure(provider, args.method, error);
            recordOutcome(provider.url, args.method, isTooManyRequests(error) ? "limited" : "failed", ms);
          } else {
            // A node's own error answer still tells us how fast it is.
            recordLatency(provider, ms);
            recordOutcome(provider.url, args.method, isRefusal(error) ? "refused" : "ok", ms);
          }
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

const logsClients = new Map<ChainKey, PublicClient>();

/**
 * A client for wide event searches (the alerts checker): every provider except Alchemy, whose free plan allows only
 * 10 blocks per eth_getLogs. Callers fall back to getEvmClient (Alchemy included) with 10-block steps when this fails.
 */
export function logsClient(chain: ChainConfig): PublicClient {
  const others = providersFor(chain).filter((provider) => provider.kind !== "alchemy");
  if (others.length === 0) return getEvmClient(chain);
  let client = logsClients.get(chain.key);
  if (!client) {
    client = createPublicClient({ chain: viemChains[chain.key], transport: rankedFallback(others) }) as PublicClient;
    logsClients.set(chain.key, client);
  }
  return client;
}

/** The Alchemy provider for Alchemy-only methods (token index), if configured and within budget. */
export function alchemyProvider(chain: ChainConfig): Provider | null {
  return providersFor(chain).find((provider) => provider.kind === "alchemy") ?? null;
}
