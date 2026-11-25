import { base58 } from "@scure/base";
import { type Hex, bytesToHex, getAddress, hexToBytes, keccak256 } from "viem";

/**
 * Contract bytecode comparer (U5): are two pieces of EVM bytecode the same program? The Solidity compiler appends a
 * CBOR "metadata" block (source hash, compiler version) to the code; two builds of the same code with a different
 * file path or comment differ only there. Everything runs in the browser; nothing is fetched.
 */
export type CodeError = "format" | "odd" | "too-large";
export const MAX_BYTES = 128 * 1024;
/** EIP-170: the most runtime code a contract may have on Ethereum. */
export const RUNTIME_LIMIT = 24_576;

export interface Metadata {
  /** Where the metadata block starts (byte offset); the code before it is the program itself. */
  start: number;
  length: number;
  ipfs: string | null;
  swarm: string | null;
  solc: string | null;
  experimental: boolean;
}

export type CodeKind =
  | { kind: "empty" }
  | { kind: "minimal-proxy"; implementation: string }
  | { kind: "delegation"; target: string }
  | { kind: "creation" }
  | { kind: "code" };

export interface CodeInfo {
  bytes: number;
  /** Keccak-256 of the whole code: for runtime code, the contract's code hash (EXTCODEHASH). */
  hash: Hex;
  /** Keccak-256 of the code without the metadata block. */
  hashWithoutMetadata: Hex;
  metadata: Metadata | null;
  kind: CodeKind;
  overLimit: boolean;
}

export type Verdict = "identical" | "same-code" | "same-length" | "different";
export interface Comparison {
  a: CodeInfo;
  b: CodeInfo;
  verdict: Verdict;
  /** Byte offset of the first difference in the code before the metadata, or null. */
  firstDifference: number | null;
  /** For same-length code: the separate runs of differing bytes and whether each fits in one 32-byte word. */
  regions: number;
  allWordSized: boolean;
}

export function readCode(text: string): { ok: true; bytes: Uint8Array } | { ok: false; error: CodeError } {
  const clean = text.replace(/\s+/g, "").replace(/^0x/i, "");
  if (!/^[0-9a-f]*$/i.test(clean)) return { ok: false, error: "format" };
  if (clean.length % 2) return { ok: false, error: "odd" };
  if (clean.length / 2 > MAX_BYTES) return { ok: false, error: "too-large" };
  return { ok: true, bytes: clean ? hexToBytes(`0x${clean}`) : new Uint8Array() };
}

// ---- A small CBOR reader: just what the Solidity metadata map uses. ----
type Cbor = string | Uint8Array | boolean | number | Map<string, Cbor>;

function readCbor(b: Uint8Array, at: { i: number }, depth = 0): Cbor {
  if (at.i >= b.length || depth > 2) throw new Error("cbor");
  const head = b[at.i++]!;
  const major = head >> 5;
  const info = head & 31;
  if (major === 7) {
    if (info === 20) return false;
    if (info === 21) return true;
    throw new Error("cbor");
  }
  let n: number;
  if (info < 24) n = info;
  else if (info === 24) n = b[at.i++] ?? Number.NaN;
  else if (info === 25) {
    n = ((b[at.i] ?? 0) << 8) | (b[at.i + 1] ?? 0);
    at.i += 2;
  } else throw new Error("cbor");
  if (Number.isNaN(n)) throw new Error("cbor");
  if (major === 0) return n;
  if (major === 2 || major === 3) {
    if (at.i + n > b.length) throw new Error("cbor");
    const chunk = b.slice(at.i, at.i + n);
    at.i += n;
    return major === 2 ? chunk : new TextDecoder("utf-8", { fatal: true }).decode(chunk);
  }
  if (major === 5) {
    const map = new Map<string, Cbor>();
    for (let k = 0; k < n; k++) {
      const key = readCbor(b, at, depth + 1);
      if (typeof key !== "string") throw new Error("cbor");
      map.set(key, readCbor(b, at, depth + 1));
    }
    return map;
  }
  throw new Error("cbor");
}

/** The Solidity metadata block at the end of the code, if there is one. */
export function findMetadata(code: Uint8Array): Metadata | null {
  const n = code.length;
  if (n < 4) return null;
  const length = (code[n - 2]! << 8) | code[n - 1]!;
  if (length < 4 || length + 2 > n) return null;
  const start = n - 2 - length;
  const block = code.slice(start, n - 2);
  try {
    const at = { i: 0 };
    const map = readCbor(block, at);
    if (!(map instanceof Map) || at.i !== block.length) return null;
    const known = ["ipfs", "bzzr0", "bzzr1", "solc"].some((key) => map.has(key));
    if (!known) return null;
    const ipfs = map.get("ipfs");
    const swarm = map.get("bzzr1") ?? map.get("bzzr0");
    const solc = map.get("solc");
    return {
      start,
      length: length + 2,
      ipfs: ipfs instanceof Uint8Array ? base58.encode(ipfs) : null,
      swarm: swarm instanceof Uint8Array ? bytesToHex(swarm).slice(2) : null,
      solc:
        solc instanceof Uint8Array && solc.length === 3
          ? `${solc[0]}.${solc[1]}.${solc[2]}`
          : typeof solc === "string"
            ? solc
            : null,
      experimental: map.get("experimental") === true,
    };
  } catch {
    return null;
  }
}

const PROXY_HEAD = "363d3d373d3d3d363d73";
const PROXY_TAIL = "5af43d82803e903d91602b57fd5bf3";

export function codeKind(code: Uint8Array): CodeKind {
  if (!code.length) return { kind: "empty" };
  const hex = bytesToHex(code).slice(2);
  if (hex.length === 90 && hex.startsWith(PROXY_HEAD) && hex.endsWith(PROXY_TAIL))
    return { kind: "minimal-proxy", implementation: getAddress(`0x${hex.slice(20, 60)}`) };
  if (hex.length === 46 && hex.startsWith("ef0100"))
    return { kind: "delegation", target: getAddress(`0x${hex.slice(6)}`) };
  // Creation code starts the Solidity way, returns the runtime code, and the runtime code starts the same way again.
  const solidityStart = "6080604052";
  if (hex.startsWith(solidityStart) && hex.indexOf(`f3fe${solidityStart}`) > 0) return { kind: "creation" };
  return { kind: "code" };
}

export function codeInfo(code: Uint8Array): CodeInfo {
  const metadata = findMetadata(code);
  const program = metadata ? code.slice(0, metadata.start) : code;
  const kind = codeKind(code);
  return {
    bytes: code.length,
    hash: keccak256(code),
    hashWithoutMetadata: keccak256(program),
    metadata,
    kind,
    overLimit: kind.kind !== "creation" && code.length > RUNTIME_LIMIT,
  };
}

export function compareCode(a: Uint8Array, b: Uint8Array): Comparison {
  const ia = codeInfo(a);
  const ib = codeInfo(b);
  const pa = ia.metadata ? a.slice(0, ia.metadata.start) : a;
  const pb = ib.metadata ? b.slice(0, ib.metadata.start) : b;
  let firstDifference: number | null = null;
  const shortest = Math.min(pa.length, pb.length);
  for (let i = 0; i < shortest; i++)
    if (pa[i] !== pb[i]) {
      firstDifference = i;
      break;
    }
  if (firstDifference === null && pa.length !== pb.length) firstDifference = shortest;

  let regions = 0;
  let allWordSized = true;
  if (pa.length === pb.length && firstDifference !== null) {
    let runStart = -1;
    for (let i = 0; i <= pa.length; i++) {
      const differs = i < pa.length && pa[i] !== pb[i];
      if (differs && runStart < 0) runStart = i;
      if (!differs && runStart >= 0) {
        regions += 1;
        if (i - runStart > 32) allWordSized = false;
        runStart = -1;
      }
    }
  }
  const verdict: Verdict =
    ia.hash === ib.hash
      ? "identical"
      : ia.hashWithoutMetadata === ib.hashWithoutMetadata
        ? "same-code"
        : pa.length === pb.length
          ? "same-length"
          : "different";
  return { a: ia, b: ib, verdict, firstDifference, regions, allWordSized };
}
