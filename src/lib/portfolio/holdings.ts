/**
 * Turns raw balances + prices into what the address page shows: valued holdings, holdings without a
 * reliable price, and likely spam (hidden by default, never deleted). Pure and unit-tested.
 */
import type { ChainKey } from "@/config/chains";
import { looksLikeLink } from "@/lib/chains/sanitize";
import type { Amount, BalanceCoverage, ChainBalances } from "@/lib/chains/types";

/** Why a token is treated as likely spam. Heuristic: shown to the user as such. */
export type SpamReason = "link-in-name" | "bait-words" | "unreadable";

export interface Holding {
  chain: ChainKey;
  kind: "native" | "token";
  /** Contract address (tokens only). */
  address?: string;
  symbol: string;
  name: string;
  amount: Amount;
  priceUsd?: number;
  valueUsd?: number;
  spam?: SpamReason;
}

export interface ChainHoldings {
  chain: ChainKey;
  coverage: BalanceCoverage;
  /** Token-list entries read, when the list was cut off (for the "some may be missing" note). */
  checkedEntries?: number;
  /** B-035: the token list is still being read; the page looks again in a few seconds. */
  completing?: boolean;
  /** Native coin first, then tokens by value (highest first), then unpriced tokens by name. */
  visible: Holding[];
  /** Likely spam, hidden by default. */
  hidden: Holding[];
  /** Visible holdings without a reliable price (not counted in totals). */
  unpricedCount: number;
  totalUsd: number;
  /** False when this chain's prices couldn't be read (values missing). Set by the address overview. */
  pricesRead?: boolean;
}

const BAIT = /\b(claim|reward|rewards|airdrop|visit|voucher|bonus|gift|free|access|redeem)\b|\$\s?\d/i;

/** Decimal amount as a JS number for USD maths (display precision is enough; balances stay exact strings). */
export function amountToNumber(amount: Amount): number {
  const raw = amount.raw.replace(/^0+/, "") || "0";
  if (amount.decimals === 0) return Number(raw);
  const padded = raw.padStart(amount.decimals + 1, "0");
  return Number(`${padded.slice(0, -amount.decimals)}.${padded.slice(-amount.decimals)}`);
}

export function spamReason(name: string, symbol: string): SpamReason | undefined {
  if (looksLikeLink(name) || looksLikeLink(symbol)) return "link-in-name";
  if (BAIT.test(name) || BAIT.test(symbol)) return "bait-words";
  return undefined;
}

export function buildChainHoldings(
  balances: ChainBalances,
  native: { symbol: string; name: string; priceKey: string },
  prices: Map<string, { usd: number }> | null,
  tokenPriceKey: (address: string) => string,
): ChainHoldings {
  const priceOf = (key: string) => prices?.get(key.toLowerCase())?.usd;
  const valued = (amount: Amount, price: number | undefined) =>
    price === undefined ? {} : { priceUsd: price, valueUsd: amountToNumber(amount) * price };

  const nativeHolding: Holding = {
    chain: balances.chain,
    kind: "native",
    symbol: native.symbol,
    name: native.name,
    amount: balances.native,
    ...valued(balances.native, priceOf(native.priceKey)),
  };

  const visible: Holding[] = [];
  const hidden: Holding[] = [];
  for (const token of balances.tokens) {
    const base = {
      chain: balances.chain,
      kind: "token" as const,
      address: token.address,
      symbol: token.info?.symbol || "?",
      name: token.info?.name || "",
      amount: token.balance,
    };
    if (!token.info) {
      hidden.push({ ...base, spam: "unreadable" });
      continue;
    }
    const price = priceOf(tokenPriceKey(token.address));
    const reason = spamReason(token.info.name, token.info.symbol);
    // A known price outweighs bait-like wording; links in names are always suspicious.
    if (reason === "link-in-name" || (reason && price === undefined)) {
      hidden.push({ ...base, spam: reason, ...valued(token.balance, price) });
      continue;
    }
    visible.push({ ...base, ...valued(token.balance, price) });
  }

  visible.sort((a, b) => {
    if (a.valueUsd !== undefined && b.valueUsd !== undefined) return b.valueUsd - a.valueUsd;
    if (a.valueUsd !== undefined) return -1;
    if (b.valueUsd !== undefined) return 1;
    return a.symbol.localeCompare(b.symbol);
  });

  const all = [nativeHolding, ...visible];
  // The native coin always shows, even with a zero balance; zero tokens never reach here.
  return {
    chain: balances.chain,
    coverage: balances.coverage,
    ...(balances.checkedEntries !== undefined ? { checkedEntries: balances.checkedEntries } : {}),
    ...(balances.completing ? { completing: true } : {}),
    visible: all,
    hidden,
    unpricedCount: visible.filter((holding) => holding.valueUsd === undefined).length,
    totalUsd: all.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0),
  };
}
