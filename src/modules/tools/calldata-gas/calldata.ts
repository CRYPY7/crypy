import { type Dec, type DecError, dec, div, mul, parseDec } from "@/lib/math/decimal";

/**
 * Calldata gas (U5): what the data of a transaction costs before any code runs. Each zero byte costs 4 gas and every
 * other byte 16 (EIP-2028). Since Ethereum's Pectra upgrade (EIP-7623), a transaction that carries a lot of data and
 * does little work pays a floor of 10 gas per "token" instead (a zero byte is 1 token, any other byte 4).
 * Contract creation adds 32,000 gas and 2 gas per 32-byte word of init code (EIP-3860). Exact integers only.
 */
export const BASE_GAS = 21_000n;
export const CREATE_GAS = 32_000n;
export const INITCODE_WORD_GAS = 2n;
export const STANDARD_TOKEN_GAS = 4n;
export const FLOOR_TOKEN_GAS = 10n;
export const MAX_BYTES = 1024 * 1024;

export type CalldataError = "format" | "odd" | "too-large";
export type PriceError = DecError;

export interface CalldataGas {
  bytes: number;
  zeroBytes: number;
  nonZeroBytes: number;
  /** zero bytes + 4 × non-zero bytes (EIP-7623). */
  tokens: bigint;
  /** 4 gas per zero byte + 16 per other byte. */
  dataGas: bigint;
  /** 32,000 + 2 per 32-byte word, when creating a contract. */
  createGas: bigint;
  /** 21,000 + data + creation: the least the transaction can use, before the floor. */
  intrinsic: bigint;
  /** 21,000 + 10 × tokens: since Pectra, the transaction is charged at least this. */
  floor: bigint;
  /** Below this much execution gas, the floor is what gets charged. */
  floorAppliesBelow: bigint;
  /** The first 4 bytes, when the data looks like a contract call. */
  selector: string | null;
}

export function readCalldata(text: string): { ok: true; bytes: Uint8Array } | { ok: false; error: CalldataError } {
  const clean = text.replace(/\s+/g, "").replace(/^0x/i, "");
  if (!/^[0-9a-f]*$/i.test(clean)) return { ok: false, error: "format" };
  if (clean.length % 2) return { ok: false, error: "odd" };
  if (clean.length / 2 > MAX_BYTES) return { ok: false, error: "too-large" };
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes };
}

export function calldataGas(bytes: Uint8Array, { create = false }: { create?: boolean } = {}): CalldataGas {
  let zeroBytes = 0;
  for (const b of bytes) if (b === 0) zeroBytes++;
  const nonZeroBytes = bytes.length - zeroBytes;
  const tokens = BigInt(zeroBytes) + 4n * BigInt(nonZeroBytes);
  const dataGas = STANDARD_TOKEN_GAS * tokens;
  const words = (BigInt(bytes.length) + 31n) / 32n;
  const createGas = create ? CREATE_GAS + INITCODE_WORD_GAS * words : 0n;
  const intrinsic = BASE_GAS + dataGas + createGas;
  const floor = BASE_GAS + FLOOR_TOKEN_GAS * tokens;
  const gap = floor - intrinsic;
  return {
    bytes: bytes.length,
    zeroBytes,
    nonZeroBytes,
    tokens,
    dataGas,
    createGas,
    intrinsic,
    floor,
    floorAppliesBelow: gap > 0n ? gap : 0n,
    selector:
      !create && bytes.length >= 4
        ? `0x${Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("")}`
        : null,
  };
}

export interface Cost {
  /** In the chain's coin (ETH, BNB…). */
  native: Dec;
  usd: Dec | null;
}

/** gas × gas price (gwei) → coin, and × coin price → USD. Exact. */
export function gasCost(
  gas: bigint,
  gwei: string,
  usdPrice: string,
): { ok: true; value: Cost } | { ok: false; field: "gwei" | "price"; error: PriceError } {
  const g = parseDec(gwei);
  if (!g.ok) return { ok: false, field: "gwei", error: g.error };
  const native = div(mul(dec(gas), g.value), dec(1_000_000_000n), 18);
  if (!usdPrice.trim()) return { ok: true, value: { native, usd: null } };
  const p = parseDec(usdPrice);
  if (!p.ok) return { ok: false, field: "price", error: p.error };
  return { ok: true, value: { native, usd: mul(native, p.value) } };
}
