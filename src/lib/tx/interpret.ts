/**
 * Transaction interpretation engine (deterministic, no network, no AI).
 *
 * Turns verified transaction data into a structured explanation: what kind of action it was, a headline
 * template with values, how sure we are (evidence), the sender's token changes and a simple flow.
 * It never produces English text: the page renders the template keys with translations.
 *
 * Rules: events (logs) are evidence of what happened; a decoded function name is only a clue, because
 * any contract can reuse a standard function name. When evidence is missing we say less, not more.
 */
import { type KnownContract, burnAddresses, knownContract } from "@/config/known-contracts";
import type { TxDetails, TxTransfer, TransferStandard } from "@/lib/chains/types";
import type { DecodeResult, DecodedParam } from "@/modules/tools/tx-decoder/decode";

export type ActionKind =
  | "native-send"
  | "token-send"
  | "nft-send"
  | "receive"
  | "swap"
  | "approval"
  | "revoke"
  | "mint"
  | "burn"
  | "wrap"
  | "unwrap"
  | "creation"
  | "self"
  | "contract-call"
  | "unknown-call";

/** confirmed: read from the chain (status, events); decoded: from call data; likely: a reasoned guess; unknown. */
export type Evidence = "confirmed" | "decoded" | "likely" | "unknown";

export interface AssetAmount {
  /** "native" or the token contract address. */
  token: string;
  standard: TransferStandard | "native";
  /** Absolute raw amount (integer string). */
  raw: string;
  decimals: number | null;
  symbol: string;
  tokenId?: string;
}

export interface Party {
  address: string;
  known: KnownContract | null;
  isContract: boolean | null;
}

export type FlowMode = "transfer" | "exchange" | "permission" | "creation" | "call" | "self";

export interface Flow {
  mode: FlowMode;
  left: Party;
  right: Party | null;
  /** Assets going left → right (or attempted, when the transaction failed or is pending). */
  out: AssetAmount[];
  /** Assets coming back right → left (exchanges). */
  back: AssetAmount[];
}

export type FailureCategory =
  | "balance"
  | "allowance"
  | "slippage"
  | "deadline"
  | "access"
  | "paused"
  | "token-transfer"
  | "math"
  | "out-of-gas"
  | "custom"
  | "message"
  | "no-message"
  | "unavailable";

export interface Failure {
  category: FailureCategory;
  /** The contract's own message or error name, exactly as read (null when not available). */
  raw: string | null;
  /** "explained": matched a known message; "likely": a reasoned guess (out of gas); "raw": shown as-is. */
  evidence: Evidence;
}

export interface Change {
  asset: AssetAmount;
  /** +1 received, −1 sent. */
  sign: 1 | -1;
}

export interface Interpretation {
  kind: ActionKind;
  evidence: Evidence;
  /** Values for the headline / intent templates. Amounts are formatted by the page. */
  values: {
    amount?: AssetAmount;
    amountIn?: AssetAmount;
    amountOut?: AssetAmount;
    outCount?: number;
    inCount?: number;
    from?: Party;
    to?: Party;
    spender?: Party;
    token?: string;
    unlimited?: boolean;
    fn?: string;
    movements?: number;
  };
  flow: Flow;
  /** The wallet that sent the transaction and what changed for it, as seen in standard token events. */
  focus: string;
  changes: Change[];
  failure: Failure | null;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const HALF_UINT = 1n << 255n;

function lower(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function party(tx: TxDetails, address: string, isContract?: boolean | null): Party {
  const known = knownContract(tx.chain, address);
  return {
    address,
    known,
    isContract: isContract ?? (known ? known.kind !== "burn" : null),
  };
}

function nativeAsset(raw: bigint, symbol: string): AssetAmount {
  return { token: "native", standard: "native", raw: raw.toString(), decimals: 18, symbol };
}

function assetOf(
  tx: TxDetails,
  token: string,
  standard: AssetAmount["standard"],
  raw: bigint,
  tokenId?: string,
): AssetAmount {
  const info = tx.tokens[lower(token)];
  return {
    token,
    standard,
    raw: (raw < 0n ? -raw : raw).toString(),
    decimals: standard === "erc721" ? 0 : (info?.decimals ?? null),
    symbol: info?.symbol || info?.name || "",
    ...(tokenId !== undefined ? { tokenId } : {}),
  };
}

export function functionName(call: DecodeResult | null): string | null {
  if (call?.status !== "decoded") return null;
  return /^(?:function\s+)?(\w+)\s*\(/.exec(call.signature)?.[1] ?? null;
}

function param(call: DecodeResult | null, name: string): DecodedParam["value"] | null {
  if (call?.status !== "decoded") return null;
  return call.params.find((p) => p.name === name)?.value ?? null;
}

function paramAddress(call: DecodeResult | null, name: string): string | null {
  const value = param(call, name);
  return value?.kind === "address" ? value.value : null;
}

function paramNumber(call: DecodeResult | null, name: string): bigint | null {
  const value = param(call, name);
  return value?.kind === "number" ? BigInt(value.value) : null;
}

/** Net token changes for one address from standard events (wrap/unwrap included), plus native coin it sent. */
export function changesFor(tx: TxDetails, address: string, nativeSymbol: string): Change[] {
  const who = lower(address);
  const totals = new Map<string, { asset: AssetAmount; net: bigint; transfer: TxTransfer }>();
  for (const transfer of tx.transfers) {
    const nft = transfer.standard === "erc721" || transfer.standard === "erc1155";
    const key = `${lower(transfer.token)}:${nft ? transfer.tokenId : ""}`;
    const amount = BigInt(transfer.amount);
    let delta = 0n;
    if (lower(transfer.from) === who) delta -= amount;
    if (lower(transfer.to) === who) delta += amount;
    if (delta === 0n) continue;
    const entry = totals.get(key);
    if (entry) entry.net += delta;
    else
      totals.set(key, {
        asset: assetOf(tx, transfer.token, transfer.standard, 0n, transfer.tokenId),
        net: delta,
        transfer,
      });
  }
  const changes: Change[] = [];
  const value = BigInt(tx.value);
  if (value > 0n && lower(tx.from) === who && lower(tx.to) !== who && tx.status === "success") {
    changes.push({ asset: nativeAsset(value, nativeSymbol), sign: -1 });
  }
  for (const { asset, net } of totals.values()) {
    if (net === 0n) continue;
    changes.push({ asset: { ...asset, raw: (net < 0n ? -net : net).toString() }, sign: net < 0n ? -1 : 1 });
  }
  return changes;
}

/** Plain-English failure category from the contract's message (or its absence). Never invents a reason. */
export function explainFailure(tx: TxDetails): Failure {
  const raw = tx.revertReason && tx.revertReason !== "none" ? tx.revertReason : null;
  const used = tx.gasUsed ? Number(tx.gasUsed) : 0;
  const limit = Number(tx.gasLimit);
  const nearLimit = limit > 0 && used / limit >= 0.97;

  if (raw) {
    const rules: [RegExp, FailureCategory][] = [
      [/insufficientbalance|exceeds balance|insufficient balance|insufficient funds|balance too low/i, "balance"],
      [/insufficientallowance|exceeds allowance|insufficient allowance|allowance/i, "allowance"],
      [
        /insufficient_output_amount|too little received|slippage|insufficient_input_amount|too much requested|excessive_input_amount|price impact/i,
        "slippage",
      ],
      [/expired|deadline|transaction too old/i, "deadline"],
      [
        /unauthorized|not the owner|caller is not|only owner|onlyowner|access ?control|forbidden|not allowed|permission/i,
        "access",
      ],
      [/paused|enforcedpause/i, "paused"],
      [/transfer_from_failed|transferhelper|\bstf\b|safeerc20|transfer failed/i, "token-transfer"],
      [/^panic 0x(11|12)$/i, "math"],
    ];
    for (const [pattern, category] of rules) if (pattern.test(raw)) return { category, raw, evidence: "decoded" };
    if (/^custom error 0x/i.test(raw)) return { category: "custom", raw, evidence: "unknown" };
    return { category: "message", raw, evidence: "unknown" };
  }
  // No message: running out of gas is a reasoned guess only when nearly all the allowed gas was used.
  if (nearLimit) return { category: "out-of-gas", raw: null, evidence: "likely" };
  if (tx.revertReason === "none") return { category: "no-message", raw: null, evidence: "confirmed" };
  return { category: "unavailable", raw: null, evidence: "unknown" };
}

/** What the transaction tried (or tries) to do, from its call data. Used for failed and pending transactions. */
function intended(tx: TxDetails, nativeSymbol: string): Pick<Interpretation, "kind" | "values" | "flow" | "evidence"> {
  const from = party(tx, tx.from, false);
  const value = BigInt(tx.value);
  if (!tx.to) {
    return {
      kind: "creation",
      evidence: "confirmed",
      values: { from },
      flow: { mode: "creation", left: from, right: null, out: [], back: [] },
    };
  }
  const to = party(tx, tx.to, tx.toIsContract);
  const call = tx.call;
  const fn = functionName(call) ?? undefined;
  if (!call) {
    const amount = nativeAsset(value, nativeSymbol);
    return {
      kind: "native-send",
      evidence: "confirmed",
      values: { amount, from, to },
      flow: { mode: "transfer", left: from, right: to, out: value > 0n ? [amount] : [], back: [] },
    };
  }
  if (call.status === "decoded") {
    if (call.key === "transfer" || call.key === "transfer-from") {
      const amountRaw = paramNumber(call, "amount");
      const recipient = paramAddress(call, "to");
      const sender = call.key === "transfer-from" ? paramAddress(call, "from") : tx.from;
      if (amountRaw !== null && recipient && sender) {
        const amount = assetOf(tx, tx.to, "erc20", amountRaw);
        const left = party(tx, sender);
        const right = party(tx, recipient);
        return {
          kind: "token-send",
          evidence: "decoded",
          values: { amount, from: left, to: right, fn },
          flow: { mode: "transfer", left, right, out: [amount], back: [] },
        };
      }
    }
    if (call.key === "approve" || call.key === "increase-allowance" || call.key === "permit2-approve") {
      const spender = paramAddress(call, "spender");
      const raw = paramNumber(call, "amount");
      if (spender && raw !== null) {
        const right = party(tx, spender);
        return {
          kind: raw === 0n ? "revoke" : "approval",
          evidence: "decoded",
          values: {
            spender: right,
            token: tx.to,
            unlimited: raw >= HALF_UINT,
            amount: assetOf(tx, tx.to, "erc20", raw),
            fn,
          },
          flow: { mode: "permission", left: from, right, out: [], back: [] },
        };
      }
    }
    if (call.key === "swap" || call.key === "router-execute") {
      return {
        kind: "swap",
        evidence: "decoded",
        values: { to, fn },
        flow: {
          mode: "exchange",
          left: from,
          right: to,
          out: value > 0n ? [nativeAsset(value, nativeSymbol)] : [],
          back: [],
        },
      };
    }
  }
  return {
    kind: fn ? "contract-call" : "unknown-call",
    evidence: fn ? "decoded" : "unknown",
    values: { to, fn },
    flow: { mode: "call", left: from, right: to, out: value > 0n ? [nativeAsset(value, nativeSymbol)] : [], back: [] },
  };
}

export function interpret(tx: TxDetails, nativeSymbol: string): Interpretation {
  const focus = tx.from;
  const base = { focus, failure: null as Failure | null };

  if (tx.status !== "success") {
    const attempt = intended(tx, nativeSymbol);
    return {
      ...base,
      ...attempt,
      // A failed transaction is a confirmed failure; what it tried to do is only as sure as its decoding.
      changes: [],
      failure: tx.status === "reverted" ? explainFailure(tx) : null,
    };
  }

  const from = party(tx, tx.from, false);
  const value = BigInt(tx.value);
  const changes = changesFor(tx, focus, nativeSymbol);
  const result = (partial: Omit<Interpretation, "focus" | "changes" | "failure">): Interpretation => ({
    ...base,
    changes,
    ...partial,
  });

  if (!tx.to) {
    const created = tx.createdContract ? party(tx, tx.createdContract, true) : null;
    return result({
      kind: "creation",
      evidence: "confirmed",
      values: { from, to: created ?? undefined },
      flow: { mode: "creation", left: from, right: created, out: [], back: [] },
    });
  }
  const to = party(tx, tx.to, tx.toIsContract);
  const fn = functionName(tx.call) ?? undefined;

  if (!tx.call && lower(tx.to) === lower(tx.from) && value === 0n) {
    return result({
      kind: "self",
      evidence: "likely",
      values: { from },
      flow: { mode: "self", left: from, right: null, out: [], back: [] },
    });
  }
  if (!tx.call && tx.transfers.length === 0 && tx.approvals.length === 0) {
    const amount = nativeAsset(value, nativeSymbol);
    return result({
      kind: "native-send",
      evidence: "confirmed",
      values: { amount, from, to },
      flow: { mode: "transfer", left: from, right: to, out: [amount], back: [] },
    });
  }

  // Permissions only (no assets moved).
  if (tx.transfers.length === 0 && tx.approvals.length > 0) {
    const granted = tx.approvals.find((a) => !a.revoke);
    const main = granted ?? tx.approvals[0]!;
    const spender = party(tx, main.spender);
    return result({
      kind: granted ? "approval" : "revoke",
      evidence: "confirmed",
      values: {
        spender,
        token: main.token,
        unlimited: main.unlimited,
        amount: main.kind === "amount" ? assetOf(tx, main.token, "erc20", BigInt(main.amount)) : undefined,
        fn,
      },
      flow: {
        mode: "permission",
        left: party(tx, main.owner, lower(main.owner) === lower(tx.from) ? false : null),
        right: spender,
        out: [],
        back: [],
      },
    });
  }

  if (tx.transfers.length > 0) {
    const outs = changes.filter((c) => c.sign < 0);
    const ins = changes.filter((c) => c.sign > 0);
    const tokenOuts = outs.filter((c) => c.asset.standard !== "native");
    const all = tx.transfers;

    // Wrapping: the only movement is the wrapped coin appearing / disappearing for the sender.
    if (all.every((t) => t.standard === "wrap" || t.standard === "unwrap")) {
      const first = all[0]!;
      const amount = assetOf(tx, first.token, first.standard, BigInt(first.amount));
      return result({
        kind: first.standard === "wrap" ? "wrap" : "unwrap",
        evidence: "confirmed",
        values: { amount, from, to },
        flow: {
          mode: "exchange",
          left: from,
          right: to,
          out: first.standard === "wrap" ? [nativeAsset(value, nativeSymbol)] : [amount],
          back: first.standard === "wrap" ? [amount] : [],
        },
      });
    }

    // Mint: something arrived from the null address and the sender gave no tokens.
    const minted = all.filter((t) => lower(t.from) === ZERO && lower(t.to) === lower(focus));
    if (minted.length > 0 && tokenOuts.length === 0) {
      const m = minted[0]!;
      const amount = assetOf(tx, m.token, m.standard, BigInt(m.amount), m.tokenId);
      return result({
        kind: "mint",
        evidence: "confirmed",
        values: { amount, from, to, movements: minted.length },
        flow: { mode: "transfer", left: party(tx, ZERO), right: from, out: [amount], back: [] },
      });
    }

    // Burn: the sender's tokens went to a burn address and nothing came back.
    const burnt = all.filter((t) => lower(t.from) === lower(focus) && burnAddresses[lower(t.to)]);
    if (burnt.length > 0 && ins.length === 0 && burnt.length === all.length) {
      const b = burnt[0]!;
      const amount = assetOf(tx, b.token, b.standard, BigInt(b.amount), b.tokenId);
      return result({
        kind: "burn",
        evidence: "confirmed",
        values: { amount, from, to: party(tx, b.to) },
        flow: { mode: "transfer", left: from, right: party(tx, b.to), out: [amount], back: [] },
      });
    }

    // Exchange: the sender gave something and got something else back in the same transaction.
    if (outs.length > 0 && ins.length > 0) {
      const decodedSwap = tx.call?.status === "decoded" && (tx.call.key === "swap" || tx.call.key === "router-execute");
      const knownExchange = to.known?.kind === "router" || to.known?.kind === "aggregator";
      return result({
        kind: "swap",
        evidence: decodedSwap || knownExchange ? "decoded" : "likely",
        values: {
          amountOut: outs[0]!.asset,
          amountIn: ins[0]!.asset,
          outCount: outs.length,
          inCount: ins.length,
          from,
          to,
          fn,
        },
        flow: { mode: "exchange", left: from, right: to, out: outs.map((c) => c.asset), back: ins.map((c) => c.asset) },
      });
    }

    // One movement in total: a send (by the sender or by someone allowed to move it).
    if (all.length === 1) {
      const t = all[0]!;
      const nft = t.standard === "erc721" || t.standard === "erc1155";
      const amount = assetOf(tx, t.token, t.standard, BigInt(t.amount), t.tokenId);
      const left = party(tx, t.from, lower(t.from) === lower(focus) ? false : null);
      const right = party(tx, t.to);
      if (lower(t.to) === lower(focus) && lower(t.from) !== lower(focus)) {
        return result({
          kind: "receive",
          evidence: "confirmed",
          values: { amount, from: left, to: from, fn },
          flow: { mode: "transfer", left, right: from, out: [amount], back: [] },
        });
      }
      return result({
        kind: nft ? "nft-send" : "token-send",
        evidence: "confirmed",
        values: { amount, from: left, to: right, fn },
        flow: { mode: "transfer", left, right, out: [amount], back: [] },
      });
    }

    // Only received (e.g. a claim): the sender got tokens and gave none.
    if (ins.length > 0 && outs.filter((c) => c.asset.standard !== "native").length === 0 && ins.length === 1) {
      const amount = ins[0]!.asset;
      return result({
        kind: "receive",
        evidence: "confirmed",
        values: { amount, from: to, to: from, fn },
        flow: { mode: "transfer", left: to, right: from, out: [amount], back: [] },
      });
    }

    return result({
      kind: fn ? "contract-call" : "unknown-call",
      evidence: fn ? "decoded" : "unknown",
      values: { to, fn, movements: all.length },
      flow: { mode: "call", left: from, right: to, out: outs.map((c) => c.asset), back: ins.map((c) => c.asset) },
    });
  }

  // A call with no standard events: say only what the call data supports.
  return result({
    kind: fn ? "contract-call" : "unknown-call",
    evidence: fn ? "decoded" : "unknown",
    values: { to, fn, movements: 0 },
    flow: { mode: "call", left: from, right: to, out: value > 0n ? [nativeAsset(value, nativeSymbol)] : [], back: [] },
  });
}
