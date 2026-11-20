/**
 * Turns raw EVM event logs into asset movements and approvals. Pure (no network), unit-tested.
 * Only standard events are read; anything else is counted but not interpreted.
 */
import { type Hex, decodeAbiParameters, getAddress, hexToString, parseAbiItem, toEventSelector } from "viem";
import type { TxApproval, TxProtocolEvent, TxTransfer } from "@/lib/chains/types";
import { sanitizeTokenText } from "@/lib/chains/sanitize";

export interface RawLog {
  address: string;
  topics: readonly string[];
  data: string;
  /** Log index in the receipt; the position in the list is used when missing. */
  logIndex?: number | null;
}

const TOPIC = {
  transfer: toEventSelector(parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")),
  approval: toEventSelector(
    parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)"),
  ),
  approvalForAll: toEventSelector(
    parseAbiItem("event ApprovalForAll(address indexed owner, address indexed operator, bool approved)"),
  ),
  transferSingle: toEventSelector(
    parseAbiItem(
      "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    ),
  ),
  transferBatch: toEventSelector(
    parseAbiItem(
      "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
    ),
  ),
  deposit: toEventSelector(parseAbiItem("event Deposit(address indexed dst, uint256 wad)")),
  withdrawal: toEventSelector(parseAbiItem("event Withdrawal(address indexed src, uint256 wad)")),
};

/** Non-token events recognised by their exact signature. Emitters are checked later (pools, known routers). */
const PROTOCOL = {
  v2Swap: toEventSelector(
    parseAbiItem(
      "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    ),
  ),
  v2Sync: toEventSelector(parseAbiItem("event Sync(uint112 reserve0, uint112 reserve1)")),
  v2Mint: toEventSelector(parseAbiItem("event Mint(address indexed sender, uint256 amount0, uint256 amount1)")),
  v2Burn: toEventSelector(
    parseAbiItem("event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)"),
  ),
  v3Swap: toEventSelector(
    parseAbiItem(
      "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    ),
  ),
  // PancakeSwap v3 adds the protocol fees to the same event.
  pancakeV3Swap: toEventSelector(
    parseAbiItem(
      "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
    ),
  ),
  // KyberSwap MetaAggregationRouterV2.
  kyberSwapped: toEventSelector(
    parseAbiItem(
      "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)",
    ),
  ),
  kyberExchange: toEventSelector(parseAbiItem("event Exchange(address pair, uint256 amountOut, address output)")),
  kyberClientData: toEventSelector(parseAbiItem("event ClientData(bytes clientData)")),
  // Safe (Gnosis Safe) results.
  safeSuccess: toEventSelector(parseAbiItem("event ExecutionSuccess(bytes32 txHash, uint256 payment)")),
  safeFailure: toEventSelector(parseAbiItem("event ExecutionFailure(bytes32 txHash, uint256 payment)")),
  // ERC-4337 EntryPoint.
  userOperation: toEventSelector(
    parseAbiItem(
      "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
    ),
  ),
};

/** The address routers use for "the native coin" (ETH, BNB). */
const NATIVE_PLACEHOLDER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const INT256_SIGN = 1n << 255n;

function wordAddress(data: string, index: number): string | null {
  const value = word(data, index);
  if (value === null || value >> 160n !== 0n) return null;
  return getAddress(`0x${value.toString(16).padStart(40, "0")}`);
}

function signed(value: bigint): bigint {
  return value >= INT256_SIGN ? value - (1n << 256n) : value;
}

/** KyberSwap ClientData is JSON; only the app name ("Source") is kept, as plain sanitized text. */
function clientSource(data: string): string | null {
  try {
    const [bytes] = decodeAbiParameters([{ type: "bytes" }], data as Hex);
    if (bytes.length > 2 + 4_000) return null;
    const text = hexToString(bytes);
    const parsed = JSON.parse(text) as { Source?: unknown };
    return typeof parsed.Source === "string" ? sanitizeTokenText(parsed.Source, 40) || null : null;
  } catch {
    return null;
  }
}

/** Decodes one non-token event by its exact signature; null when it isn't one we know. */
function protocolEvent(log: RawLog, logIndex: number, data: string): TxProtocolEvent | null {
  const emitter = getAddress(log.address);
  const [topic0, t1, t2, t3] = log.topics;
  switch (topic0) {
    case PROTOCOL.v2Swap: {
      const sender = topicAddress(t1);
      const recipient = topicAddress(t2);
      const values = [0, 1, 2, 3].map((i) => word(data, i));
      if (!sender || !recipient || values.some((v) => v === null)) return null;
      const [a0i, a1i, a0o, a1o] = values as bigint[];
      return {
        type: "pool-swap",
        logIndex,
        pool: emitter,
        version: "v2",
        sender,
        recipient,
        amount0In: a0i!.toString(),
        amount1In: a1i!.toString(),
        amount0Out: a0o!.toString(),
        amount1Out: a1o!.toString(),
      };
    }
    case PROTOCOL.v3Swap:
    case PROTOCOL.pancakeV3Swap: {
      const sender = topicAddress(t1);
      const recipient = topicAddress(t2);
      const a0 = word(data, 0);
      const a1 = word(data, 1);
      if (!sender || !recipient || a0 === null || a1 === null) return null;
      const s0 = signed(a0);
      const s1 = signed(a1);
      // Positive: paid into the pool. Negative: paid out of it.
      return {
        type: "pool-swap",
        logIndex,
        pool: emitter,
        version: "v3",
        sender,
        recipient,
        amount0In: (s0 > 0n ? s0 : 0n).toString(),
        amount1In: (s1 > 0n ? s1 : 0n).toString(),
        amount0Out: (s0 < 0n ? -s0 : 0n).toString(),
        amount1Out: (s1 < 0n ? -s1 : 0n).toString(),
      };
    }
    case PROTOCOL.v2Sync:
      return log.topics.length === 1 && word(data, 1) !== null ? { type: "pool-sync", logIndex, pool: emitter } : null;
    case PROTOCOL.v2Mint: {
      const sender = topicAddress(t1);
      const a0 = word(data, 0);
      const a1 = word(data, 1);
      if (!sender || a0 === null || a1 === null || log.topics.length !== 2) return null;
      return { type: "pool-mint", logIndex, pool: emitter, sender, amount0: a0.toString(), amount1: a1.toString() };
    }
    case PROTOCOL.v2Burn: {
      const sender = topicAddress(t1);
      const recipient = topicAddress(t2);
      const a0 = word(data, 0);
      const a1 = word(data, 1);
      if (!sender || !recipient || a0 === null || a1 === null) return null;
      return {
        type: "pool-burn",
        logIndex,
        pool: emitter,
        sender,
        recipient,
        amount0: a0.toString(),
        amount1: a1.toString(),
      };
    }
    case PROTOCOL.kyberSwapped: {
      const [sender, src, dst, receiver] = [0, 1, 2, 3].map((i) => wordAddress(data, i));
      const spent = word(data, 4);
      const returned = word(data, 5);
      if (!sender || !src || !dst || !receiver || spent === null || returned === null) return null;
      const token = (a: string) => (a.toLowerCase() === NATIVE_PLACEHOLDER ? "native" : a);
      return {
        type: "router-swapped",
        logIndex,
        emitter,
        sender,
        tokenIn: token(src),
        tokenOut: token(dst),
        recipient: receiver,
        amountIn: spent.toString(),
        amountOut: returned.toString(),
      };
    }
    case PROTOCOL.kyberExchange: {
      const pair = wordAddress(data, 0);
      const amountOut = word(data, 1);
      const output = wordAddress(data, 2);
      if (!pair || amountOut === null || !output) return null;
      return { type: "router-exchange", logIndex, emitter, pair, amountOut: amountOut.toString(), output };
    }
    case PROTOCOL.kyberClientData:
      return { type: "router-client", logIndex, emitter, source: clientSource(data) };
    case PROTOCOL.safeSuccess:
    case PROTOCOL.safeFailure:
      if (log.topics.length !== 1 || word(data, 1) === null) return null;
      return { type: "safe-exec", logIndex, emitter, success: topic0 === PROTOCOL.safeSuccess };
    case PROTOCOL.userOperation: {
      const sender = topicAddress(t2);
      const paymaster = topicAddress(t3);
      const success = word(data, 1);
      if (!sender || !paymaster || success === null) return null;
      return { type: "user-op", logIndex, emitter, sender, paymaster, success: success === 1n };
    }
    default:
      return null;
  }
}

/** Logs read per transaction and rows kept; big batch transactions are cut and flagged. */
export const MAX_LOGS = 400;
export const MAX_ROWS = 200;
const HALF_UINT256 = 1n << 255n;

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return getAddress(`0x${topic.slice(26)}`);
}

function word(data: string, index = 0): bigint | null {
  const hex = data.slice(2 + index * 64, 2 + (index + 1) * 64);
  return hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex) ? BigInt(`0x${hex}`) : null;
}

export interface ParsedLogs {
  transfers: TxTransfer[];
  approvals: TxApproval[];
  protocolEvents: TxProtocolEvent[];
  truncated: boolean;
  /** Logs that produced a transfer or approval (the rest are not standard token events). */
  usedLogs: number;
}

export function parseTxLogs(logs: readonly RawLog[], wrappedNative?: string): ParsedLogs {
  const transfers: TxTransfer[] = [];
  const approvals: TxApproval[] = [];
  const protocolEvents: TxProtocolEvent[] = [];
  const wrapped = wrappedNative?.toLowerCase();
  let truncated = logs.length > MAX_LOGS;
  let usedLogs = 0;

  for (const [position, log] of logs.slice(0, MAX_LOGS).entries()) {
    if (transfers.length >= MAX_ROWS || approvals.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(log.address)) continue;
    const before = transfers.length + approvals.length;
    const token = getAddress(log.address);
    const [topic0, t1, t2, t3] = log.topics;
    const data = /^0x[0-9a-fA-F]*$/.test(log.data) ? log.data : "0x";
    const logIndex = typeof log.logIndex === "number" ? log.logIndex : position;

    if (topic0 === TOPIC.transfer) {
      const from = topicAddress(t1);
      const to = topicAddress(t2);
      if (!from || !to) continue;
      if (log.topics.length === 4) {
        // ERC-721: the token id is the 4th topic.
        transfers.push({
          standard: "erc721",
          token,
          from,
          to,
          amount: "1",
          tokenId: BigInt(t3!).toString(),
          logIndex,
        });
      } else if (log.topics.length === 3) {
        const amount = word(data);
        if (amount !== null)
          transfers.push({ standard: "erc20", token, from, to, amount: amount.toString(), logIndex });
      }
    } else if (topic0 === TOPIC.approval) {
      const owner = topicAddress(t1);
      const spender = topicAddress(t2);
      if (!owner || !spender) continue;
      if (log.topics.length === 4) {
        approvals.push({
          kind: "nft",
          token,
          owner,
          spender,
          amount: BigInt(t3!).toString(),
          unlimited: false,
          revoke: BigInt(spender) === 0n,
          logIndex,
        });
      } else {
        const amount = word(data);
        if (amount === null) continue;
        approvals.push({
          kind: "amount",
          token,
          owner,
          spender,
          amount: amount.toString(),
          unlimited: amount >= HALF_UINT256,
          revoke: amount === 0n,
          logIndex,
        });
      }
    } else if (topic0 === TOPIC.approvalForAll) {
      const owner = topicAddress(t1);
      const spender = topicAddress(t2);
      const approved = word(data);
      if (!owner || !spender || approved === null) continue;
      approvals.push({
        kind: "all",
        token,
        owner,
        spender,
        amount: approved === 0n ? "0" : "1",
        unlimited: approved !== 0n,
        revoke: approved === 0n,
        logIndex,
      });
    } else if (topic0 === TOPIC.transferSingle) {
      const from = topicAddress(t2);
      const to = topicAddress(t3);
      const id = word(data, 0);
      const amount = word(data, 1);
      if (!from || !to || id === null || amount === null) continue;
      transfers.push({
        standard: "erc1155",
        token,
        from,
        to,
        amount: amount.toString(),
        tokenId: id.toString(),
        logIndex,
      });
    } else if (topic0 === TOPIC.transferBatch) {
      const from = topicAddress(t2);
      const to = topicAddress(t3);
      if (!from || !to) continue;
      try {
        const [ids, values] = decodeAbiParameters([{ type: "uint256[]" }, { type: "uint256[]" }], data as Hex);
        ids.slice(0, MAX_ROWS).forEach((id, i) =>
          transfers.push({
            standard: "erc1155",
            token,
            from,
            to,
            amount: (values[i] ?? 0n).toString(),
            tokenId: id.toString(),
            logIndex,
          }),
        );
      } catch {
        // Malformed batch event: counted in logCount, not shown.
      }
    } else if (
      wrapped &&
      token.toLowerCase() === wrapped &&
      (topic0 === TOPIC.deposit || topic0 === TOPIC.withdrawal)
    ) {
      const who = topicAddress(t1);
      const amount = word(data);
      if (!who || amount === null) continue;
      const wrap = topic0 === TOPIC.deposit;
      // Shown as the wrapped token appearing (wrap) or disappearing (unwrap) for that address.
      transfers.push({
        standard: wrap ? "wrap" : "unwrap",
        token,
        from: wrap ? token : who,
        to: wrap ? who : token,
        amount: amount.toString(),
        logIndex,
      });
    } else {
      const event = protocolEvent(log, logIndex, data);
      if (event && protocolEvents.length < MAX_ROWS) protocolEvents.push(event);
    }
    if (transfers.length + approvals.length > before) usedLogs++;
  }
  return { transfers, approvals, protocolEvents, truncated, usedLogs };
}

/** Exposed for tests and for naming events in the Advanced view. */
export const eventTopics = TOPIC;
export const protocolTopics = PROTOCOL;
