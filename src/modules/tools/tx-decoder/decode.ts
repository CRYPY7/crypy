/**
 * Decodes raw EVM transaction input data (call data) against a curated list of well-known functions.
 * Unknown functions are shown as raw 32-byte words. We never guess a function name.
 * Security-relevant calls (approvals, NFT operator approvals, ownership changes) get heuristic warnings.
 */
import { type AbiFunction, type Hex, decodeFunctionData, getAddress, parseAbiItem, toFunctionSelector } from "viem";

/** i18n keys under `utilities.tx-decoder.functions`. */
export type FunctionKey =
  | "transfer"
  | "approve"
  | "transfer-from"
  | "increase-allowance"
  | "decrease-allowance"
  | "permit"
  | "set-approval-for-all"
  | "nft-safe-transfer"
  | "multi-token-transfer"
  | "multi-token-batch-transfer"
  | "wrap"
  | "unwrap"
  | "permit2-approve"
  | "multicall"
  | "swap"
  | "add-liquidity"
  | "remove-liquidity"
  | "transfer-ownership"
  | "renounce-ownership"
  | "router-execute";

/** i18n keys under `utilities.tx-decoder.warnings`. */
export type WarningCode =
  "unlimited-approval" | "approval" | "approval-for-all" | "revoke" | "ownership-transfer" | "ownership-renounce";

type Rule = "approval-amount" | "approval-for-all" | "ownership-transfer" | "ownership-renounce" | "nested";

interface KnownFunction {
  key: FunctionKey;
  /** Standard or contract family (technical name, not translated). */
  standard: string;
  signature: string;
  rule?: Rule;
  /** Name of the amount parameter checked by "approval-amount". */
  amountParam?: string;
}

const ROUTER = "Uniswap V2 / PancakeSwap router";

const known: KnownFunction[] = [
  { key: "transfer", standard: "ERC-20 / BEP-20", signature: "function transfer(address to, uint256 amount)" },
  {
    key: "approve",
    standard: "ERC-20 / BEP-20 (or ERC-721)",
    signature: "function approve(address spender, uint256 amount)",
    rule: "approval-amount",
    amountParam: "amount",
  },
  {
    key: "transfer-from",
    standard: "ERC-20 / BEP-20 (or ERC-721)",
    signature: "function transferFrom(address from, address to, uint256 amount)",
  },
  {
    key: "increase-allowance",
    standard: "ERC-20 / BEP-20",
    signature: "function increaseAllowance(address spender, uint256 addedValue)",
    rule: "approval-amount",
    amountParam: "addedValue",
  },
  {
    key: "decrease-allowance",
    standard: "ERC-20 / BEP-20",
    signature: "function decreaseAllowance(address spender, uint256 subtractedValue)",
  },
  {
    key: "permit",
    standard: "EIP-2612",
    signature:
      "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    rule: "approval-amount",
    amountParam: "value",
  },
  {
    key: "set-approval-for-all",
    standard: "ERC-721 / ERC-1155",
    signature: "function setApprovalForAll(address operator, bool approved)",
    rule: "approval-for-all",
  },
  {
    key: "nft-safe-transfer",
    standard: "ERC-721",
    signature: "function safeTransferFrom(address from, address to, uint256 tokenId)",
  },
  {
    key: "nft-safe-transfer",
    standard: "ERC-721",
    signature: "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  },
  {
    key: "multi-token-transfer",
    standard: "ERC-1155",
    signature: "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  },
  {
    key: "multi-token-batch-transfer",
    standard: "ERC-1155",
    signature: "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
  },
  { key: "wrap", standard: "WETH / WBNB", signature: "function deposit()" },
  { key: "unwrap", standard: "WETH / WBNB", signature: "function withdraw(uint256 amount)" },
  {
    key: "permit2-approve",
    standard: "Uniswap Permit2",
    signature: "function approve(address token, address spender, uint160 amount, uint48 expiration)",
    rule: "approval-amount",
    amountParam: "amount",
  },
  {
    key: "router-execute",
    standard: "Universal Router (Uniswap / PancakeSwap)",
    signature: "function execute(bytes commands, bytes[] inputs, uint256 deadline)",
  },
  {
    key: "router-execute",
    standard: "Universal Router (Uniswap / PancakeSwap)",
    signature: "function execute(bytes commands, bytes[] inputs)",
  },
  { key: "multicall", standard: "Multicall", signature: "function multicall(bytes[] data)", rule: "nested" },
  {
    key: "multicall",
    standard: "Multicall",
    signature: "function multicall(uint256 deadline, bytes[] data)",
    rule: "nested",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature: "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature: "function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "swap",
    standard: ROUTER,
    signature:
      "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  },
  {
    key: "add-liquidity",
    standard: ROUTER,
    signature:
      "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)",
  },
  {
    key: "add-liquidity",
    standard: ROUTER,
    signature:
      "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline)",
  },
  {
    key: "remove-liquidity",
    standard: ROUTER,
    signature:
      "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)",
  },
  {
    key: "remove-liquidity",
    standard: ROUTER,
    signature:
      "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline)",
  },
  {
    key: "transfer-ownership",
    standard: "Ownable",
    signature: "function transferOwnership(address newOwner)",
    rule: "ownership-transfer",
  },
  {
    key: "renounce-ownership",
    standard: "Ownable",
    signature: "function renounceOwnership()",
    rule: "ownership-renounce",
  },
];

interface Entry extends KnownFunction {
  abi: AbiFunction;
  selector: Hex;
}

const bySelector = new Map<string, Entry[]>();
for (const fn of known) {
  const abi = parseAbiItem(fn.signature) as AbiFunction;
  const selector = toFunctionSelector(abi);
  bySelector.set(selector, [...(bySelector.get(selector) ?? []), { ...fn, abi, selector }]);
}

/** Number of distinct function signatures the decoder knows (shown on the page). */
export const knownSignatureCount = known.length;

export type DecodedValue =
  | { kind: "address"; value: string }
  | { kind: "number"; value: string; unlimited?: boolean; time?: string }
  | { kind: "bool"; value: boolean }
  | { kind: "bytes"; value: string }
  | { kind: "list"; items: DecodedValue[] }
  | { kind: "call"; result: DecodeResult };

export interface DecodedParam {
  name: string;
  type: string;
  value: DecodedValue;
}

export type DecodeResult =
  | { status: "native-transfer" }
  | { status: "invalid"; error: "format" | "odd-length" | "too-short" | "too-long" | "tx-hash" }
  | {
      status: "decoded";
      selector: string;
      key: FunctionKey;
      standard: string;
      signature: string;
      params: DecodedParam[];
      warnings: WarningCode[];
    }
  /** Known selector, but the data doesn't match its parameters. */
  | { status: "mismatch"; selector: string; signature: string }
  | { status: "unknown"; selector: string; words: string[]; totalWords: number; extraBytes: number };

export const MAX_INPUT_HEX = 200_000;
const MAX_DEPTH = 3;

function isTimeParam(name: string) {
  return name === "deadline" || name === "expiration";
}

function toValue(type: string, name: string, raw: unknown, depth: number, nested: boolean): DecodedValue {
  if (type.endsWith("[]")) {
    const itemType = type.slice(0, -2);
    return { kind: "list", items: (raw as unknown[]).map((item) => toValue(itemType, name, item, depth, nested)) };
  }
  if (type === "address") return { kind: "address", value: getAddress(raw as string) };
  if (type === "bool") return { kind: "bool", value: raw as boolean };
  if (type.startsWith("uint") || type.startsWith("int")) {
    const value = (raw as bigint | number).toString();
    if (isTimeParam(name)) {
      const seconds = BigInt(value);
      // Only show a date for realistic timestamps (year 2001 to 2286); huge values mean "never expires".
      if (seconds >= 1_000_000_000n && seconds < 10_000_000_000n) {
        return { kind: "number", value, time: new Date(Number(seconds) * 1000).toISOString() };
      }
    }
    return { kind: "number", value };
  }
  // Only functions that really carry calls (multicall) get their bytes decoded as calls; router inputs are not calls.
  if (type === "bytes" && nested && depth < MAX_DEPTH) {
    // Nested call data (e.g. inside multicall) is decoded too.
    const nested = decodeCallData(raw as string, depth + 1);
    if (nested.status === "decoded" || nested.status === "unknown") return { kind: "call", result: nested };
  }
  return { kind: "bytes", value: raw as string };
}

function bitSize(type: string): number {
  return Number(/(\d+)$/.exec(type)?.[1] ?? 256);
}

function warningsFor(entry: Entry, args: readonly unknown[]): { warnings: WarningCode[]; unlimitedParam?: string } {
  const named = Object.fromEntries(entry.abi.inputs.map((input, i) => [input.name ?? "", args[i]]));
  switch (entry.rule) {
    case "approval-amount": {
      const name = entry.amountParam!;
      const amount = named[name] as bigint;
      const type = entry.abi.inputs.find((input) => input.name === name)?.type ?? "uint256";
      if (amount === 0n) return { warnings: entry.key === "approve" ? ["revoke"] : [] };
      // Any amount at or above half the type's range is an "unlimited" approval in practice.
      if (amount >= 1n << BigInt(bitSize(type) - 1)) return { warnings: ["unlimited-approval"], unlimitedParam: name };
      return { warnings: ["approval"] };
    }
    case "approval-for-all":
      return { warnings: [named.approved ? "approval-for-all" : "revoke"] };
    case "ownership-transfer":
      return { warnings: ["ownership-transfer"] };
    case "ownership-renounce":
      return { warnings: ["ownership-renounce"] };
    default:
      return { warnings: [] };
  }
}

/** Normalises user input: optional 0x, whitespace and line breaks removed. */
export function normaliseHex(raw: string): string {
  const value = raw.replace(/\s+/g, "");
  return /^0x/i.test(value) ? `0x${value.slice(2)}` : `0x${value}`;
}

export function decodeCallData(raw: string, depth = 0): DecodeResult {
  const data = normaliseHex(raw);
  const digits = data.slice(2);
  if (digits.length === 0) return { status: "native-transfer" };
  if (!/^[0-9a-fA-F]+$/.test(digits)) return { status: "invalid", error: "format" };
  if (digits.length > MAX_INPUT_HEX) return { status: "invalid", error: "too-long" };
  if (digits.length % 2 !== 0) return { status: "invalid", error: "odd-length" };
  if (depth === 0 && digits.length === 64) return { status: "invalid", error: "tx-hash" };
  if (digits.length < 8) return { status: "invalid", error: "too-short" };

  const hex = data.toLowerCase() as Hex;
  const selector = hex.slice(0, 10);
  const candidates = bySelector.get(selector);
  if (candidates) {
    for (const entry of candidates) {
      try {
        const { args = [] } = decodeFunctionData({ abi: [entry.abi], data: hex });
        // Reject leftovers that don't fit the signature (a sign of a different function with the same selector).
        if (entry.abi.inputs.length === 0 && digits.length > 8) continue;
        const { warnings, unlimitedParam } = warningsFor(entry, args);
        const params = entry.abi.inputs.map((input, i) => {
          const name = input.name ?? `arg${i}`;
          const value = toValue(input.type, name, args[i], depth, entry.rule === "nested");
          if (name === unlimitedParam && value.kind === "number") value.unlimited = true;
          return { name, type: input.type, value };
        });
        return {
          status: "decoded",
          selector,
          key: entry.key,
          standard: entry.standard,
          signature: entry.signature.replace(/^function /, ""),
          params,
          warnings,
        };
      } catch {
        // Try the next function with this selector.
      }
    }
    return { status: "mismatch", selector, signature: candidates[0]!.signature.replace(/^function /, "") };
  }

  const body = digits.slice(8);
  const words: string[] = [];
  for (let i = 0; i + 64 <= body.length && words.length < 64; i += 64) words.push(`0x${body.slice(i, i + 64)}`);
  return {
    status: "unknown",
    selector,
    words,
    totalWords: Math.floor(body.length / 64),
    extraBytes: (body.length % 64) / 2,
  };
}
