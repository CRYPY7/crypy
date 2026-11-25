/**
 * Bitcoin fee calculator (U4), in the browser: transaction size in virtual bytes from the number and kind of inputs
 * and outputs, and the fee at a fee rate in sat/vB. Sizes are the usual estimates for standard single-signature
 * spends (signatures vary by a byte, multisig inputs are bigger), so the result is an estimate and says so.
 */
export const inputKinds = ["p2pkh", "p2sh-p2wpkh", "p2wpkh", "p2tr"] as const;
export const outputKinds = ["p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr"] as const;
export type InputKind = (typeof inputKinds)[number];
export type OutputKind = (typeof outputKinds)[number];

/** Virtual bytes per input (signature and public key included) and per output. */
export const INPUT_VBYTES: Record<InputKind, number> = { p2pkh: 148, "p2sh-p2wpkh": 91, p2wpkh: 68, p2tr: 57.5 };
export const OUTPUT_VBYTES: Record<OutputKind, number> = { p2pkh: 34, p2sh: 32, p2wpkh: 31, p2wsh: 43, p2tr: 43 };
/** Version, locktime and counts; SegWit adds the marker and flag (half a vbyte). */
const OVERHEAD_LEGACY = 10;
const OVERHEAD_SEGWIT = 10.5;

export type FeeError = "no-inputs" | "no-outputs" | "count" | "rate" | "price";

export interface FeeResult {
  vbytes: number;
  feeSats: bigint;
  /** BTC with 8 decimals, as text. */
  feeBtc: string;
  /** Only when a price was typed. */
  feeUsd: string | null;
  segwit: boolean;
}

export function bitcoinFee(input: {
  inputs: Partial<Record<InputKind, string>>;
  outputs: Partial<Record<OutputKind, string>>;
  rate: string;
  price: string;
}): { ok: true; value: FeeResult } | { ok: false; error: FeeError } {
  const count = (v: string | undefined) => {
    const t = (v ?? "").trim();
    if (!t) return 0;
    return /^\d{1,4}$/.test(t) ? Number(t) : NaN;
  };
  const ins = inputKinds.map((k) => [k, count(input.inputs[k])] as const);
  const outs = outputKinds.map((k) => [k, count(input.outputs[k])] as const);
  if ([...ins, ...outs].some(([, n]) => Number.isNaN(n))) return { ok: false, error: "count" };
  if (ins.every(([, n]) => n === 0)) return { ok: false, error: "no-inputs" };
  if (outs.every(([, n]) => n === 0)) return { ok: false, error: "no-outputs" };
  const rateText = input.rate.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(rateText) || Number(rateText) <= 0 || Number(rateText) > 10_000)
    return { ok: false, error: "rate" };
  const priceText = input.price.trim().replace(/,/g, "");
  if (priceText && (!/^\d+(\.\d{1,2})?$/.test(priceText) || Number(priceText) <= 0))
    return { ok: false, error: "price" };

  const segwit = ins.some(([k, n]) => n > 0 && k !== "p2pkh");
  const raw =
    (segwit ? OVERHEAD_SEGWIT : OVERHEAD_LEGACY) +
    ins.reduce((s, [k, n]) => s + INPUT_VBYTES[k] * n, 0) +
    outs.reduce((s, [k, n]) => s + OUTPUT_VBYTES[k] * n, 0);
  const vbytes = Math.ceil(raw);
  // Fee rate has at most 3 decimals: work in thousandths of a sat to stay exact, then round up to whole sats.
  const [whole, frac = ""] = rateText.split(".");
  const milli = BigInt(whole!) * 1000n + BigInt(frac.padEnd(3, "0"));
  const feeSats = (milli * BigInt(vbytes) + 999n) / 1000n;
  const feeBtc = `${feeSats / 100_000_000n}.${(feeSats % 100_000_000n).toString().padStart(8, "0")}`;
  let feeUsd: string | null = null;
  if (priceText) {
    const [pw, pf = ""] = priceText.split(".");
    const cents = BigInt(pw!) * 100n + BigInt(pf.padEnd(2, "0"));
    // fee in cents = sats × cents per BTC ÷ 1e8, rounded to the nearest cent.
    const feeCents = (feeSats * cents + 50_000_000n) / 100_000_000n;
    feeUsd = `${feeCents / 100n}.${(feeCents % 100n).toString().padStart(2, "0")}`;
  }
  return { ok: true, value: { vbytes, feeSats, feeBtc, feeUsd, segwit } };
}
