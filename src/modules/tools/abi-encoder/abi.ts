import {
  type Abi,
  type AbiParameter,
  type Hex,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  parseAbi,
  toEventSelector,
  toEventSignature,
  toFunctionSelector,
  toFunctionSignature,
} from "viem";

/**
 * ABI tools (U3), in the browser with viem: read an ABI (JSON, a build artifact with an "abi" field, or human-readable
 * lines), list what it contains with selectors and topics, encode a call, and decode call data or an event log.
 * Encoding only builds bytes: nothing is signed or sent.
 */
export type AbiError = "empty" | "json" | "not-abi" | "invalid-item" | "too-large";
export interface AbiEntry {
  kind: "function" | "event" | "error" | "constructor" | "other";
  name: string;
  signature: string;
  /** Function or error: 4-byte selector. Event: topic 0. */
  id: Hex | null;
  mutability: string | null;
  inputs: readonly AbiParameter[];
  anonymous: boolean;
}

const MAX_INPUT = 500_000;

export function readAbi(
  raw: string,
): { ok: true; abi: Abi; entries: AbiEntry[] } | { ok: false; error: AbiError; detail?: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_INPUT) return { ok: false, error: "too-large" };
  let abi: Abi;
  if (text.startsWith("[") || text.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "json" };
    }
    if (
      parsed &&
      !Array.isArray(parsed) &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { abi?: unknown }).abi)
    )
      parsed = (parsed as { abi: unknown }).abi;
    if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item === "object" && "type" in item))
      return { ok: false, error: "not-abi" };
    abi = parsed as Abi;
  } else {
    try {
      abi = parseAbi(
        text
          .split("\n")
          .map((line) => line.trim().replace(/;$/, ""))
          .filter(Boolean),
      ) as Abi;
    } catch (error) {
      return { ok: false, error: "invalid-item", detail: shortDetail(error) };
    }
  }
  const entries: AbiEntry[] = [];
  for (const item of abi) {
    try {
      entries.push(describe(item));
    } catch (error) {
      return {
        ok: false,
        error: "invalid-item",
        detail: `${"name" in item ? String(item.name) : item.type}: ${shortDetail(error)}`,
      };
    }
  }
  return { ok: true, abi, entries };
}

/** Solidity ABI types: elementary types (with valid sizes), tuples and arrays of them. */
function validType(param: AbiParameter): boolean {
  const base = param.type.replace(/(\[\d*\])+$/, "");
  if (base === "tuple") return ((param as { components?: readonly AbiParameter[] }).components ?? []).every(validType);
  const int = /^u?int(\d*)$/.exec(base);
  if (int) return int[1] === "" || (Number(int[1]) % 8 === 0 && Number(int[1]) >= 8 && Number(int[1]) <= 256);
  const bytes = /^bytes(\d+)$/.exec(base);
  if (bytes) return Number(bytes[1]) >= 1 && Number(bytes[1]) <= 32;
  return ["address", "bool", "string", "bytes", "function"].includes(base);
}

function describe(item: Abi[number]): AbiEntry {
  const params = [...("inputs" in item ? item.inputs : []), ...("outputs" in item && item.outputs ? item.outputs : [])];
  const bad = params.find((p) => !validType(p));
  if (bad) throw new Error(`unknown type "${bad.type}"`);
  if (item.type === "function") {
    return {
      kind: "function",
      name: item.name,
      signature: toFunctionSignature(item).replace(/^function /, ""),
      id: toFunctionSelector(item),
      mutability: item.stateMutability ?? null,
      inputs: item.inputs,
      anonymous: false,
    };
  }
  if (item.type === "event") {
    return {
      kind: "event",
      name: item.name,
      signature: toEventSignature(item).replace(/^event /, ""),
      id: item.anonymous ? null : toEventSelector(item),
      mutability: null,
      inputs: item.inputs,
      anonymous: Boolean(item.anonymous),
    };
  }
  if (item.type === "error") {
    const fn = {
      type: "function",
      name: item.name,
      inputs: item.inputs,
      outputs: [],
      stateMutability: "nonpayable",
    } as const;
    return {
      kind: "error",
      name: item.name,
      signature: toFunctionSignature(fn).replace(/^function /, ""),
      id: toFunctionSelector(fn),
      mutability: null,
      inputs: item.inputs,
      anonymous: false,
    };
  }
  return {
    kind: item.type === "constructor" ? "constructor" : "other",
    name: item.type,
    signature: item.type,
    id: null,
    mutability: null,
    inputs: "inputs" in item ? item.inputs : [],
    anonymous: false,
  };
}

function shortDetail(error: unknown): string {
  const message =
    error instanceof Error ? ((error as { shortMessage?: string }).shortMessage ?? error.message) : String(error);
  return message.split("\n")[0]!.slice(0, 200);
}

// ---- Encoding ------------------------------------------------------------------------------------------------------

export type ArgError = {
  index: number;
  reason: "empty" | "address" | "number" | "bool" | "bytes" | "json" | "encode";
  detail?: string;
};

/** Turns typed text into the value viem expects for this parameter. Arrays and tuples are written as JSON. */
export function coerce(param: AbiParameter, value: unknown): unknown {
  const type = param.type;
  const array = /^(.*)\[(\d*)\]$/.exec(type);
  if (array) {
    const list = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(list)) throw new TypeError("json");
    const inner = { ...param, type: array[1]! } as AbiParameter;
    return list.map((v) => coerce(inner, v));
  }
  if (type === "tuple") {
    const obj = typeof value === "string" ? JSON.parse(value) : value;
    const components = (param as { components?: readonly AbiParameter[] }).components ?? [];
    if (Array.isArray(obj)) return components.map((c, i) => coerce(c, obj[i]));
    if (obj && typeof obj === "object")
      return Object.fromEntries(
        components.map((c, i) => [
          c.name ?? String(i),
          coerce(c, (obj as Record<string, unknown>)[c.name ?? String(i)]),
        ]),
      );
    throw new TypeError("json");
  }
  const text = typeof value === "string" ? value.trim() : value;
  if (type === "address") {
    if (typeof text !== "string" || !isAddress(text, { strict: false })) throw new TypeError("address");
    return getAddress(text);
  }
  if (/^u?int\d*$/.test(type)) {
    if (typeof text === "number" && Number.isSafeInteger(text)) return BigInt(text);
    if (typeof text !== "string" || !/^-?(0x[0-9a-f]+|\d+)$/i.test(text)) throw new TypeError("number");
    return text.startsWith("-") ? -BigInt(text.slice(1)) : BigInt(text);
  }
  if (type === "bool") {
    if (text === true || text === "true") return true;
    if (text === false || text === "false") return false;
    throw new TypeError("bool");
  }
  if (type === "bytes" || /^bytes\d+$/.test(type)) {
    if (typeof text !== "string" || !isHex(text)) throw new TypeError("bytes");
    return text;
  }
  return typeof value === "string" ? value : String(value);
}

export function encodeCall(
  abi: Abi,
  name: string,
  args: string[],
): { ok: true; data: Hex } | { ok: false; error: ArgError } {
  const fn = abi.find(
    (item) => item.type === "function" && toFunctionSignature(item).replace(/^function /, "") === name,
  );
  if (!fn || fn.type !== "function") return { ok: false, error: { index: -1, reason: "encode" } };
  const values: unknown[] = [];
  for (const [index, param] of fn.inputs.entries()) {
    const text = args[index] ?? "";
    if (!text.trim() && param.type !== "string") return { ok: false, error: { index, reason: "empty" } };
    try {
      values.push(coerce(param, text));
    } catch (error) {
      const reason = error instanceof SyntaxError ? "json" : ((error as Error).message as ArgError["reason"]);
      return {
        ok: false,
        error: { index, reason: ["address", "number", "bool", "bytes", "json"].includes(reason) ? reason : "json" },
      };
    }
  }
  try {
    return { ok: true, data: encodeFunctionData({ abi: [fn], functionName: fn.name, args: values }) };
  } catch (error) {
    return { ok: false, error: { index: -1, reason: "encode", detail: shortDetail(error) } };
  }
}

// ---- Decoding ------------------------------------------------------------------------------------------------------

export interface DecodedValue {
  name: string;
  type: string;
  value: string;
}
export type DecodeError = "empty" | "hex" | "no-match" | "failed";

export function decodeCall(
  abi: Abi,
  raw: string,
): { ok: true; signature: string; args: DecodedValue[] } | { ok: false; error: DecodeError; detail?: string } {
  const data = raw.trim();
  if (!data) return { ok: false, error: "empty" };
  if (!isHex(data) || data.length < 10) return { ok: false, error: "hex" };
  try {
    const { functionName, args } = decodeFunctionData({ abi, data: data as Hex });
    const selector = data.slice(0, 10).toLowerCase();
    const fn = abi.find(
      (item) => item.type === "function" && item.name === functionName && toFunctionSelector(item) === selector,
    );
    if (!fn || fn.type !== "function") return { ok: false, error: "no-match" };
    return {
      ok: true,
      signature: toFunctionSignature(fn).replace(/^function /, ""),
      args: fn.inputs.map((p, i) => ({ name: p.name || `#${i}`, type: p.type, value: show((args ?? [])[i]) })),
    };
  } catch (error) {
    const detail = shortDetail(error);
    return { ok: false, error: /not found on ABI|signature/i.test(detail) ? "no-match" : "failed", detail };
  }
}

export function decodeLog(
  abi: Abi,
  topicsText: string,
  dataText: string,
): { ok: true; signature: string; args: DecodedValue[] } | { ok: false; error: DecodeError; detail?: string } {
  const topics = topicsText
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (topics.length === 0) return { ok: false, error: "empty" };
  if (!topics.every((t) => isHex(t) && t.length === 66)) return { ok: false, error: "hex" };
  const data = (dataText.trim() || "0x") as Hex;
  if (!isHex(data)) return { ok: false, error: "hex" };
  try {
    const decoded = decodeEventLog({ abi, topics: topics as [Hex, ...Hex[]], data, strict: true });
    const ev = abi.find(
      (item) =>
        item.type === "event" && item.name === decoded.eventName && toEventSelector(item) === topics[0]!.toLowerCase(),
    );
    if (!ev || ev.type !== "event") return { ok: false, error: "no-match" };
    const args = decoded.args as unknown as Record<string, unknown> | unknown[];
    return {
      ok: true,
      signature: toEventSignature(ev).replace(/^event /, ""),
      args: ev.inputs.map((p, i) => ({
        name: p.name || `#${i}`,
        type: `${p.type}${p.indexed ? " indexed" : ""}`,
        value: show(Array.isArray(args) ? args[i] : args[p.name ?? String(i)]),
      })),
    };
  } catch (error) {
    const detail = shortDetail(error);
    return { ok: false, error: /not found|signature/i.test(detail) ? "no-match" : "failed", detail };
  }
}

/** Values as exact text: bigints in full, nested values as JSON. */
export function show(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}
