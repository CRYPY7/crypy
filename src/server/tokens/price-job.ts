import "server-only";
import { liveChains } from "@/config/chains";
import { registry } from "@/server/chains/registry";
import { storePrices, tokensToReprice } from "./registry";

/**
 * Background price job (R1 part 2): every few minutes, re-prices the tokens people looked at in the last week whose
 * stored price is getting old, so pages almost always find a fresh stored price instead of searching pools live.
 * Runs in the worker at background priority. Tokens the engine can't price this round keep their older price (a
 * page prices them live once it is too old), so a node problem never turns a real price into "no price".
 */
export const PRICE_JOB_MS = 3 * 60_000;
const USED_WITHIN_MS = 7 * 24 * 3_600_000;
/** Refreshed a little before pages would consider the price old (prices.ts FRESH_MS = 3 min). */
const OLDER_THAN_MS = 2 * 60_000;
const PER_CHAIN = 300;

export async function runPriceJob(now = Date.now()): Promise<{ priced: number; chains: number }> {
  let priced = 0;
  let chains = 0;
  for (const chain of liveChains.filter((c) => c.capabilities.tokenBalances)) {
    const adapter = registry.adapters.find((a) => a.family === chain.family);
    if (!adapter?.getUsdPrices) continue;
    const due = await tokensToReprice(
      chain.key,
      { usedWithinMs: USED_WITHIN_MS, olderThanMs: OLDER_THAN_MS, limit: PER_CHAIN },
      now,
    );
    if (due.length === 0) continue;
    chains += 1;
    try {
      const prices = await adapter.getUsdPrices(chain, due);
      const found = new Map<string, number | null>();
      for (const token of due) {
        const price = prices.get(token.address.toLowerCase());
        if (price) found.set(token.address.toLowerCase(), price.usd);
      }
      await storePrices(chain.key, found, Date.now());
      priced += found.size;
    } catch {
      // This chain's nodes failed this round; its prices are refreshed next round or by a page.
    }
  }
  return { priced, chains };
}
