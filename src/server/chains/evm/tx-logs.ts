/**
 * Turns raw EVM event logs into asset movements and approvals. Pure (no network), unit-tested.
 * Only standard events are read; anything else is counted but not interpreted.
 */
import { type Hex, decodeAbiParameters, getAddress, parseAbiItem, toEventSelector } from "viem";
import type { TxApproval, TxTransfer } from "@/lib/chains/types";

export interface RawLog {
  address: string;
  topics: readonly string[];
  data: string;
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
  truncated: boolean;
  /** Logs that produced a transfer or approval (the rest are not standard token events). */
  usedLogs: number;
}

export function parseTxLogs(logs: readonly RawLog[], wrappedNative?: string): ParsedLogs {
  const transfers: TxTransfer[] = [];
  const approvals: TxApproval[] = [];
  const wrapped = wrappedNative?.toLowerCase();
  let truncated = logs.length > MAX_LOGS;
  let usedLogs = 0;

  for (const log of logs.slice(0, MAX_LOGS)) {
    if (transfers.length >= MAX_ROWS || approvals.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(log.address)) continue;
    const before = transfers.length + approvals.length;
    const token = getAddress(log.address);
    const [topic0, t1, t2, t3] = log.topics;
    const data = /^0x[0-9a-fA-F]*$/.test(log.data) ? log.data : "0x";

    if (topic0 === TOPIC.transfer) {
      const from = topicAddress(t1);
      const to = topicAddress(t2);
      if (!from || !to) continue;
      if (log.topics.length === 4) {
        // ERC-721: the token id is the 4th topic.
        transfers.push({ standard: "erc721", token, from, to, amount: "1", tokenId: BigInt(t3!).toString() });
      } else if (log.topics.length === 3) {
        const amount = word(data);
        if (amount !== null) transfers.push({ standard: "erc20", token, from, to, amount: amount.toString() });
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
      });
    } else if (topic0 === TOPIC.transferSingle) {
      const from = topicAddress(t2);
      const to = topicAddress(t3);
      const id = word(data, 0);
      const amount = word(data, 1);
      if (!from || !to || id === null || amount === null) continue;
      transfers.push({ standard: "erc1155", token, from, to, amount: amount.toString(), tokenId: id.toString() });
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
      });
    }
    if (transfers.length + approvals.length > before) usedLogs++;
  }
  return { transfers, approvals, truncated, usedLogs };
}

/** Exposed for tests. */
export const eventTopics = TOPIC;
