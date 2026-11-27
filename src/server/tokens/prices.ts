import "server-only";
import { type StoredPrice, storePrices, storedPrices } from "./registry";

/**
 * Prices for a page (INFRASTRUCTURE_DESIGN.md §5.3, R1 part 2). Pricing a token means searching every exchange, pair
 * and fee tier for a pool — dozens of on-chain reads per token, and spam tokens never have one. So:
 *  - a stored price younger than FRESH_MS is used as it is;
 *  - "no reliable price" is remembered for NO_PRICE_MS, so spam isn't searched again on every visit;
 *  - only the rest is priced live (CRYPY's own DEX engine, through the caller), and the result is stored;
 *  - if the live pricing fails, stored prices up to STALE_MS old are used rather than none.
 * The background price job (`price-job.ts`) keeps prices of tokens people look at fresh, so pages rarely price live.
 * The native coin's price is kept in memory for NATIVE_MS (one price per chain, asked by every page).
 */
export const FRESH_MS = 3 * 60_000;
export const NO_PRICE_MS = 6 * 3_600_000;
export const STALE_MS = 60 * 60_000;
const NATIVE_MS = 60_000;

export type LivePricer = (
  tokens: { address: string; decimals: number }[],
) => Promise<Map<string, { usd: number }> | null>;

const nativeMemory: Map<string, { usd: number; at: number }> = ((
  globalThis as { __crypyNativePrices?: Map<string, { usd: number; at: number }> }
).__crypyNativePrices ??= new Map());

/**
 * Prices keyed like the engine's ("native" and lower-case token addresses). null only when nothing at all could be
 * priced (the page then says prices are missing), as before.
 * `keepTokens`: tokens never marked "no reliable price" (each chain's well-known tokens: a failed search for them is
 * more likely a node problem than a missing pool).
 */
export async function pricesFor(
  chain: string,
  tokens: { address: string; decimals: number }[],
  live: LivePricer,
  { keepTokens = new Set<string>(), now = Date.now() }: { keepTokens?: ReadonlySet<string>; now?: number } = {},
): Promise<Map<string, { usd: number }> | null> {
  const out = new Map<string, { usd: number }>();
  const stored = tokens.length
    ? await storedPrices(
        chain,
        tokens.map((t) => t.address),
      )
    : new Map<string, StoredPrice>();
  const toPrice: { address: string; decimals: number }[] = [];
  for (const token of tokens) {
    const key = token.address.toLowerCase();
    const hit = stored.get(key);
    const age = hit ? now - hit.at : Infinity;
    if (hit && hit.usd !== null && age < FRESH_MS) out.set(key, { usd: hit.usd });
    else if (hit && hit.usd === null && age < NO_PRICE_MS && !keepTokens.has(key)) continue;
    else toPrice.push(token);
  }

  const native = nativeMemory.get(chain);
  const needNative = !native || now - native.at >= NATIVE_MS;
  if (native && !needNative) out.set("native", { usd: native.usd });
  if (toPrice.length === 0 && !needNative) return out;

  let fresh: Map<string, { usd: number }> | null = null;
  try {
    fresh = await live(toPrice);
  } catch {
    fresh = null;
  }
  if (!fresh) {
    // Live pricing failed: fall back to older stored prices, so a node problem doesn't blank every value.
    for (const token of toPrice) {
      const hit = stored.get(token.address.toLowerCase());
      if (hit && hit.usd !== null && now - hit.at < STALE_MS) out.set(token.address.toLowerCase(), { usd: hit.usd });
    }
    if (native) out.set("native", { usd: native.usd });
    return out.size ? out : null;
  }

  const nativeFresh = fresh.get("native");
  if (nativeFresh) {
    nativeMemory.set(chain, { usd: nativeFresh.usd, at: now });
    out.set("native", nativeFresh);
  } else if (native) out.set("native", { usd: native.usd });
  const toStore = new Map<string, number | null>();
  for (const token of toPrice) {
    const key = token.address.toLowerCase();
    const price = fresh.get(key);
    if (price) {
      out.set(key, price);
      toStore.set(key, price.usd);
    } else if (!keepTokens.has(key)) toStore.set(key, null);
  }
  void storePrices(chain, toStore, now);
  return out;
}

/** Tests only. */
export function resetNativePrices() {
  nativeMemory.clear();
}
