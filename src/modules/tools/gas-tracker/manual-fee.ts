import { type Dec, type DecError, mul, parseDec } from "@/lib/math/decimal";
import { MAX_UINT256, type ParseError, formatExact, parseAmount } from "../unit-converter/units";

/**
 * Manual fee calculator on the Gas Tracker (U1): gas × price per unit of gas, exact in wei. Nothing is fetched; the
 * USD value appears only when the visitor types the coin's price.
 */
export type PriceUnit = "gwei" | "wei";
export interface ManualFeeInput {
  gas: string;
  price: string;
  priceUnit: PriceUnit;
  usd: string;
}
export type Field = "gas" | "price" | "usd";
export type ManualFeeError = ParseError | DecError | "whole-number" | "gas-too-large";

export interface ManualFee {
  wei: bigint;
  gwei: string;
  native: string;
  /** Fee × typed coin price; null without a price. */
  usd: Dec | null;
}
export type ManualFeeResult =
  { ok: true; value: ManualFee } | { ok: false; errors: Partial<Record<Field, ManualFeeError>> };

/** Far above any block's gas limit today (Ethereum ~36–45 million, others similar): a typo guard, not a rule. */
export const MAX_GAS = 1_000_000_000n;

export function manualFee(input: ManualFeeInput): ManualFeeResult {
  const errors: Partial<Record<Field, ManualFeeError>> = {};
  let gas: bigint | null = null;
  const gasParsed = parseAmount(input.gas, 0);
  if (!gasParsed.ok) errors.gas = gasParsed.error === "too-precise" ? "whole-number" : gasParsed.error;
  else if (gasParsed.wei > MAX_GAS) errors.gas = "gas-too-large";
  else gas = gasParsed.wei;

  let priceWei: bigint | null = null;
  const priceParsed = parseAmount(input.price, input.priceUnit === "gwei" ? 9 : 0);
  if (!priceParsed.ok)
    errors.price =
      priceParsed.error === "too-precise" && input.priceUnit === "wei" ? "whole-number" : priceParsed.error;
  else priceWei = priceParsed.wei;

  let usd: Dec | null = null;
  if (input.usd.trim()) {
    const parsed = parseDec(input.usd);
    if (!parsed.ok) errors.usd = parsed.error;
    else usd = parsed.value;
  }
  if (Object.keys(errors).length || gas === null || priceWei === null) return { ok: false, errors };

  const wei = gas * priceWei;
  if (wei > MAX_UINT256) return { ok: false, errors: { price: "too-large" } };
  const native = formatExact(wei, 18);
  const nativeDec = parseDec(native);
  return {
    ok: true,
    value: {
      wei,
      gwei: formatExact(wei, 9),
      native,
      usd: usd && nativeDec.ok ? mul(nativeDec.value, usd) : null,
    },
  };
}
