import { type TypedDataDefinition, getAddress, hashTypedData, hexToBytes, isAddress, isHex } from "viem";
import { getChainByEvmId } from "@/config/chains";
import { PERMIT2_CONTRACTS, knownContract } from "@/config/known-contracts";

/**
 * Signature request decoder (U2): explains, in the browser, what a wallet is being asked to sign. Nothing is signed,
 * sent or looked up. Recognised requests (token permits, Permit2, NFT marketplace orders) are explained in plain
 * words; anything else is shown field by field. A request that isn't recognised is never called harmless.
 */
export type Severity = "critical" | "high" | "medium" | "info";
export interface Finding {
  severity: Severity;
  /** Key of a translated sentence; values fill its placeholders. */
  key: string;
  values?: Record<string, string>;
}

export type Party = { address: string; name: string | null };
export interface Allowance {
  token: Party;
  /** Raw amount in the token's smallest unit (decimals aren't known offline). */
  amount: string;
  unlimited: boolean;
}

export type Decoded =
  | {
      kind: "typed-data";
      /** What the request does, when recognised. */
      pattern: "permit" | "dai-permit" | "permit2-single" | "permit2-batch" | "permit2-transfer" | "seaport" | "other";
      primaryType: string;
      chain: { id: number | null; name: string | null };
      verifyingContract: Party | null;
      domainName: string | null;
      spender: Party | null;
      allowances: Allowance[];
      /** Unix seconds; null when there is none. */
      deadline: number | null;
      /** Seaport: what the signer gives and who receives payment. */
      offer: { token: Party; amount: string; itemType: string }[];
      consideration: { token: Party; amount: string; recipient: Party; itemType: string }[];
      fields: FieldRow[];
      hash: string | null;
      findings: Finding[];
    }
  | { kind: "message"; text: string; findings: Finding[] }
  | { kind: "hash"; hash: string; findings: Finding[] };

export interface FieldRow {
  path: string;
  value: string;
}

export type DecodeError = "empty" | "json" | "not-typed-data" | "too-large";

/** 2^255: amounts this big are treated as unlimited (approvals usually use 2^256 − 1 or 2^160 − 1). */
const UNLIMITED = 1n << 255n;
const MAX_UINT160 = (1n << 160n) - 1n;
/** A permission valid for more than a year is effectively open-ended. */
const YEAR = 365 * 24 * 3600;
const MAX_INPUT = 200_000;

export function decodeSignatureRequest(
  raw: string,
  now = Date.now(),
): { ok: true; value: Decoded } | { ok: false; error: DecodeError } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_INPUT) return { ok: false, error: "too-large" };

  if (text.startsWith("{") || text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "json" };
    }
    // eth_signTypedData_v4 params are [address, typedData]; typedData itself may be a JSON string.
    if (Array.isArray(parsed))
      parsed = parsed.find((p) => typeof p === "object" || (typeof p === "string" && p.trim().startsWith("{")));
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return { ok: false, error: "json" };
      }
    }
    if (!isTypedData(parsed)) return { ok: false, error: "not-typed-data" };
    return { ok: true, value: decodeTypedData(parsed, now) };
  }

  // personal_sign: hex bytes or plain text.
  if (isHex(text)) {
    const bytes = hexToBytes(text);
    if (bytes.length === 32)
      return { ok: true, value: { kind: "hash", hash: text, findings: [{ severity: "critical", key: "blindHash" }] } };
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const readable = !/[\u0000-\u0008\u000e-\u001f�]/.test(decoded);
    if (!readable)
      return {
        ok: true,
        value: { kind: "hash", hash: text, findings: [{ severity: "critical", key: "unreadableBytes" }] },
      };
    return { ok: true, value: { kind: "message", text: decoded, findings: messageFindings(decoded) } };
  }
  return { ok: true, value: { kind: "message", text, findings: messageFindings(text) } };
}

function messageFindings(text: string): Finding[] {
  const findings: Finding[] = [{ severity: "info", key: "plainMessage" }];
  if (/\b(sign[- ]?in|log ?in|nonce|issued at|uri:)/i.test(text))
    findings.push({ severity: "info", key: "signInMessage" });
  if (/\b(approve|permit|transfer|claim|airdrop|unlock|verify (your )?wallet)/i.test(text))
    findings.push({ severity: "medium", key: "messageMentionsFunds" });
  return findings;
}

interface TypedDataInput {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

function isTypedData(value: unknown): value is TypedDataInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.primaryType === "string" &&
    !!v.types &&
    typeof v.types === "object" &&
    !!v.message &&
    typeof v.message === "object" &&
    (v.domain === undefined || typeof v.domain === "object")
  );
}

function decodeTypedData(data: TypedDataInput, now: number): Extract<Decoded, { kind: "typed-data" }> {
  const domain = (data.domain ?? {}) as Record<string, unknown>;
  const message = data.message;
  const chainId = toNumber(domain.chainId);
  const chain = chainId !== null ? getChainByEvmId(chainId) : undefined;
  const chainKey = chain?.key ?? "ethereum";
  const party = (value: unknown): Party | null => {
    if (typeof value !== "string" || !isAddress(value, { strict: false })) return null;
    const address = getAddress(value);
    return { address, name: knownContract(chainKey, address)?.name ?? null };
  };
  const verifyingContract = party(domain.verifyingContract);
  const findings: Finding[] = [];
  const nowSec = Math.floor(now / 1000);
  let pattern: Extract<Decoded, { kind: "typed-data" }>["pattern"] = "other";
  let spender: Party | null = null;
  let deadline: number | null = null;
  const allowances: Allowance[] = [];
  const offer: Extract<Decoded, { kind: "typed-data" }>["offer"] = [];
  const consideration: Extract<Decoded, { kind: "typed-data" }>["consideration"] = [];
  const isPermit2 = !!verifyingContract && PERMIT2_CONTRACTS.includes(verifyingContract.address.toLowerCase() as never);
  const type = data.primaryType;

  if (type === "Permit" && "spender" in message && "value" in message && verifyingContract) {
    pattern = "permit";
    spender = party(message.spender);
    const amount = toBigInt(message.value);
    allowances.push({
      token: verifyingContract,
      amount: amount?.toString() ?? String(message.value),
      unlimited: amount !== null && amount >= UNLIMITED,
    });
    deadline = toNumber(message.deadline);
  } else if (type === "Permit" && "allowed" in message && verifyingContract) {
    // DAI-style permit: a yes/no approval of everything.
    pattern = "dai-permit";
    spender = party(message.spender);
    if (message.allowed === true || message.allowed === "true")
      allowances.push({ token: verifyingContract, amount: "", unlimited: true });
    deadline = toNumber(message.expiry);
  } else if (isPermit2 && (type === "PermitSingle" || type === "PermitBatch")) {
    pattern = type === "PermitSingle" ? "permit2-single" : "permit2-batch";
    spender = party(message.spender);
    const details = (Array.isArray(message.details) ? message.details : [message.details]) as Record<string, unknown>[];
    for (const d of details) {
      const token = party(d?.token);
      const amount = toBigInt(d?.amount);
      if (token)
        allowances.push({
          token,
          amount: amount?.toString() ?? String(d?.amount),
          unlimited: amount !== null && amount >= MAX_UINT160,
        });
      const expiration = toNumber(d?.expiration);
      if (expiration !== null && (deadline === null || expiration > deadline)) deadline = expiration;
    }
  } else if (isPermit2 && /^Permit(Batch)?(Witness)?TransferFrom$/.test(type)) {
    pattern = "permit2-transfer";
    spender = party(message.spender);
    const permitted = (Array.isArray(message.permitted) ? message.permitted : [message.permitted]) as Record<
      string,
      unknown
    >[];
    for (const p of permitted) {
      const token = party(p?.token);
      const amount = toBigInt(p?.amount);
      if (token)
        allowances.push({
          token,
          amount: amount?.toString() ?? String(p?.amount),
          unlimited: amount !== null && amount >= MAX_UINT160,
        });
    }
    deadline = toNumber(message.deadline);
  } else if (type === "OrderComponents" && Array.isArray(message.offer) && Array.isArray(message.consideration)) {
    pattern = "seaport";
    for (const item of message.offer as Record<string, unknown>[]) {
      const token = party(item.token);
      if (token)
        offer.push({
          token,
          amount: String(item.endAmount ?? item.startAmount ?? ""),
          itemType: itemType(item.itemType),
        });
    }
    for (const item of message.consideration as Record<string, unknown>[]) {
      const token = party(item.token) ?? { address: "0x0000000000000000000000000000000000000000", name: null };
      const recipient = party(item.recipient);
      if (recipient)
        consideration.push({
          token,
          amount: String(item.endAmount ?? item.startAmount ?? ""),
          recipient,
          itemType: itemType(item.itemType),
        });
    }
    deadline = toNumber(message.endTime);
  }

  // What it means, in order of danger.
  const offerer = party(message.offerer)?.address.toLowerCase();
  if (pattern === "seaport") {
    const paidToSigner = consideration.some((c) => c.recipient.address.toLowerCase() === offerer && c.amount !== "0");
    findings.push({ severity: "high", key: "seaportListing", values: { count: String(offer.length) } });
    if (!paidToSigner) findings.push({ severity: "critical", key: "seaportNoPayment" });
  }
  if (allowances.length > 0) {
    findings.push({
      severity: "high",
      key: pattern === "permit2-transfer" ? "permitTransfer" : "permitAllowance",
      values: { spender: spender?.name ?? spender?.address ?? "?" },
    });
    if (allowances.some((a) => a.unlimited)) findings.push({ severity: "critical", key: "unlimited" });
    if (spender && !spender.name) findings.push({ severity: "medium", key: "unknownSpender" });
    if (spender?.name) findings.push({ severity: "info", key: "knownSpender", values: { name: spender.name } });
  }
  if (pattern === "dai-permit" && deadline === 0) findings.push({ severity: "high", key: "noExpiry" });
  else if (deadline !== null) {
    if (deadline < nowSec) findings.push({ severity: "info", key: "expired" });
    else if (deadline - nowSec > YEAR) findings.push({ severity: "medium", key: "longDeadline" });
  }
  if (chainId !== null && !chain)
    findings.push({ severity: "medium", key: "unknownChain", values: { id: String(chainId) } });
  if (chainId === null) findings.push({ severity: "medium", key: "noChain" });
  if (pattern === "other") findings.push({ severity: "medium", key: "unrecognised", values: { type } });

  let hash: string | null = null;
  try {
    hash = hashTypedData(data as unknown as TypedDataDefinition);
  } catch {
    findings.push({ severity: "medium", key: "malformed" });
  }

  const fields: FieldRow[] = [];
  flatten(message, "", fields);
  return {
    kind: "typed-data",
    pattern,
    primaryType: type,
    chain: { id: chainId, name: chain?.name ?? null },
    verifyingContract,
    domainName: typeof domain.name === "string" ? domain.name : null,
    spender,
    allowances,
    deadline,
    offer,
    consideration,
    fields,
    hash,
    findings: findings.sort((a, b) => order[a.severity] - order[b.severity]),
  };
}

const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

function itemType(value: unknown): string {
  // Seaport ItemType: 0 native, 1 ERC-20, 2 ERC-721, 3 ERC-1155, 4/5 with criteria (any token of a collection).
  return ["native", "erc20", "erc721", "erc1155", "erc721-any", "erc1155-any"][Number(value)] ?? "other";
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^(0x[0-9a-f]+|\d+)$/i.test(value.trim())) return BigInt(value.trim());
  } catch {
    return null;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  const big = toBigInt(value);
  if (big === null) return null;
  return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
}

const MAX_ROWS = 200;
function flatten(value: unknown, path: string, rows: FieldRow[]) {
  if (rows.length >= MAX_ROWS) return;
  if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}[${i}]`, rows));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, rows);
  else rows.push({ path, value: String(value).slice(0, 300) });
}
