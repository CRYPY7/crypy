import { numberFormat } from "@/lib/format/intl";
/**
 * Gas Tracker maths (M7), pure and chain-family neutral. Input: a chain's fee history (eth_feeHistory shape, already
 * parsed to numbers in wei). Output: three speeds, the base fee, a trend line and the cost of common actions.
 * "Speed" describes what recent blocks paid, not a promise.
 */
export interface FeeHistory {
  /** Base fee per block, wei; the last entry is the next block's. Zero on chains without a base fee. */
  baseFees: number[];
  /** Per block: the tip paid at the 25th, 50th and 90th percentile of included transactions, wei. */
  rewards: [number, number, number][];
  /** Newest block number in the history. */
  newestBlock: number;
}

export interface GasSpeeds {
  /** gwei */
  low: number;
  average: number;
  high: number;
  /** Next block's base fee, gwei; null on chains without one. */
  baseFee: number | null;
}

/** Typical gas for common actions: estimates; the wallet shows the exact fee before confirming. */
export const TYPICAL_GAS = {
  sendCoin: 21_000,
  sendToken: 65_000,
  approve: 46_000,
  swap: 180_000,
  sendNft: 85_000,
} as const;
export type GasAction = keyof typeof TYPICAL_GAS;

/** Typical signed size of each action in bytes: rollups charge the Ethereum data fee by size. */
export const TYPICAL_BYTES: Record<GasAction, number> = {
  sendCoin: 110,
  sendToken: 180,
  approve: 180,
  swap: 400,
  sendNft: 250,
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const gwei = (wei: number) => wei / 1e9;

/** Speeds from the last `window` blocks: next base fee + the median tip at each percentile. */
export function speeds(history: FeeHistory, window = 20): GasSpeeds {
  const next = history.baseFees[history.baseFees.length - 1] ?? 0;
  const recent = history.rewards.slice(-window).filter((r) => r.every((v) => Number.isFinite(v)));
  const tip = (i: 0 | 1 | 2) => median(recent.map((r) => r[i]));
  const low = next + tip(0);
  // Never below the lower speed (percentiles can be equal or noisy).
  const average = Math.max(low, next + tip(1));
  const high = Math.max(average, next + tip(2));
  return { low: gwei(low), average: gwei(average), high: gwei(high), baseFee: next > 0 ? gwei(next) : null };
}

/**
 * Trend over the whole history, averaged into at most `points` buckets: the base fee where the chain has one,
 * otherwise the median tip (what transactions actually paid).
 */
export function trend(history: FeeHistory, points = 60): { values: number[]; measure: "baseFee" | "tip" } {
  const hasBase = history.baseFees.some((b) => b > 0);
  const series = hasBase ? history.baseFees.slice(0, -1) : history.rewards.map((r) => r[1]);
  const size = Math.max(1, Math.ceil(series.length / points));
  const values: number[] = [];
  for (let i = 0; i < series.length; i += size) {
    const bucket = series.slice(i, i + size);
    values.push(gwei(bucket.reduce((a, b) => a + b, 0) / bucket.length));
  }
  return { values, measure: hasBase ? "baseFee" : "tip" };
}

/**
 * Cost of an action at a price, in the chain's coin and in dollars (null without a coin price). On rollups,
 * `l1Wei` adds the estimated Ethereum data fee for the action.
 */
export function actionCost(action: GasAction, priceGwei: number, coinUsd: number | null, l1Wei?: number | null) {
  const coin = (TYPICAL_GAS[action] * priceGwei) / 1e9 + (l1Wei ?? 0) / 1e18;
  return { gas: TYPICAL_GAS[action], coin, usd: coinUsd === null ? null : coin * coinUsd };
}

/** "0.37", "8.3", "0.05", "12": readable gwei with a few significant digits. */
export function formatGwei(value: number, locale = "en"): string {
  const digits = value >= 10 ? 0 : value >= 1 ? 1 : value >= 0.01 ? 3 : 4;
  return numberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

/** What a chain-family adapter returns for the Gas Tracker. */
export interface GasFacts {
  chain: string;
  checkedAt: number;
  history: FeeHistory;
  /** Seconds covered by the history (oldest to newest block), when the block times could be read. */
  spanSeconds: number | null;
  /** The chain's coin in dollars (on-chain price), or null. */
  coinUsd: number | null;
  /** Rollups: estimated Ethereum data fee per action (wei), read from the chain; null on other chains. */
  l1Fees: Record<GasAction, number> | null;
}

/** Dollars for fees: small amounts keep two significant digits ("$0.00055") instead of rounding to $0.00. */
export function formatFeeUsd(usd: number, locale = "en"): string {
  const options: Intl.NumberFormatOptions =
    usd > 0 && usd < 1
      ? { style: "currency", currency: "USD", maximumSignificantDigits: 2 }
      : { style: "currency", currency: "USD" };
  return numberFormat(locale, options).format(usd);
}
