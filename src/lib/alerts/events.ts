import { keccak256, toBytes } from "viem";
import { isUnlimited } from "@/lib/approvals/evaluate";

/**
 * Turning raw event logs into transfers and approvals for watched wallets. Pure (no network), so it is tested with
 * real event shapes. One search per chain per round covers every watched wallet at once: the wallet addresses go into
 * the topic filter as a list.
 */

const sig = (text: string) => keccak256(toBytes(text));

export const TOPICS = {
  /** ERC-20 and ERC-721 share this signature; ERC-721 indexes the token id (4 topics). */
  transfer: sig("Transfer(address,address,uint256)"),
  /** ERC-20 and ERC-721 single-token approvals share it too. */
  approval: sig("Approval(address,address,uint256)"),
  approvalForAll: sig("ApprovalForAll(address,address,bool)"),
  /** Permit2: owner, token, spender indexed; amount (uint160) and expiration (uint48) in data. */
  permit2Approval: sig("Approval(address,address,address,uint160,uint48)"),
} as const;

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string | bigint | null;
  transactionHash: string | null;
  logIndex: string | number | null;
}

export const topicFor = (address: string) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
const addressFrom = (topic: string | undefined) =>
  topic && /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(26).toLowerCase()}` : null;
const word = (data: string, index: number): bigint | null => {
  const hex = data.replace(/^0x/, "").slice(index * 64, index * 64 + 64);
  return hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex) ? BigInt(`0x${hex}`) : null;
};
const num = (value: string | number | bigint | null): number =>
  value === null
    ? 0
    : typeof value === "bigint"
      ? Number(value)
      : typeof value === "number"
        ? value
        : Number(BigInt(value));

const ZERO = "0x0000000000000000000000000000000000000000";

export interface Movement {
  txHash: string;
  logIndex: number;
  block: number;
  /** Token contract (lower case). */
  token: string;
  standard: "erc20" | "nft";
  from: string;
  to: string;
  /** ERC-20 raw amount; null for NFTs. */
  amount: bigint | null;
  tokenId: bigint | null;
}

export function decodeTransfer(log: RawLog): Movement | null {
  if (log.topics[0]?.toLowerCase() !== TOPICS.transfer || !log.transactionHash) return null;
  const from = addressFrom(log.topics[1]);
  const to = addressFrom(log.topics[2]);
  if (!from || !to) return null;
  const base = {
    txHash: log.transactionHash.toLowerCase(),
    logIndex: num(log.logIndex),
    block: num(log.blockNumber),
    token: log.address.toLowerCase(),
    from,
    to,
  };
  if (log.topics.length === 4) {
    const id = log.topics[3] ? BigInt(log.topics[3]) : null;
    return { ...base, standard: "nft", amount: null, tokenId: id };
  }
  if (log.topics.length !== 3) return null;
  const amount = word(log.data, 0);
  return amount === null ? null : { ...base, standard: "erc20", amount, tokenId: null };
}

export interface ApprovalEvent {
  txHash: string;
  logIndex: number;
  block: number;
  /** The contract that emitted the event (for Permit2: must be a real Permit2 deployment). */
  emitter: string;
  owner: string;
  /** The token the approval is for (for Permit2: the token named in the event). */
  token: string;
  spender: string;
  kind: "token" | "nft-one" | "nft-all" | "permit2";
  /** Raw amount for token and Permit2 approvals. */
  amount: bigint | null;
  unlimited: boolean;
  /** Permit2: unix seconds when it expires. */
  expiration: number | null;
}

/** New permissions only: revokes (amount 0, operator turned off, approval to nobody) return null. */
export function decodeApproval(log: RawLog): ApprovalEvent | null {
  const topic0 = log.topics[0]?.toLowerCase();
  if (!log.transactionHash || !topic0) return null;
  const owner = addressFrom(log.topics[1]);
  if (!owner) return null;
  const base = {
    txHash: log.transactionHash.toLowerCase(),
    logIndex: num(log.logIndex),
    block: num(log.blockNumber),
    emitter: log.address.toLowerCase(),
    owner,
  };
  if (topic0 === TOPICS.approval) {
    const spender = addressFrom(log.topics[2]);
    if (!spender || spender === ZERO) return null;
    if (log.topics.length === 4)
      return {
        ...base,
        token: log.address.toLowerCase(),
        spender,
        kind: "nft-one",
        amount: null,
        unlimited: false,
        expiration: null,
      };
    const amount = word(log.data, 0);
    if (amount === null || amount === 0n) return null;
    return {
      ...base,
      token: log.address.toLowerCase(),
      spender,
      kind: "token",
      amount,
      unlimited: isUnlimited(amount, "token"),
      expiration: null,
    };
  }
  if (topic0 === TOPICS.approvalForAll) {
    const operator = addressFrom(log.topics[2]);
    if (!operator || word(log.data, 0) !== 1n) return null;
    return {
      ...base,
      token: log.address.toLowerCase(),
      spender: operator,
      kind: "nft-all",
      amount: null,
      unlimited: true,
      expiration: null,
    };
  }
  if (topic0 === TOPICS.permit2Approval) {
    const token = addressFrom(log.topics[2]);
    const spender = addressFrom(log.topics[3]);
    const amount = word(log.data, 0);
    const expiration = word(log.data, 1);
    if (!token || !spender || amount === null || amount === 0n) return null;
    return {
      ...base,
      token,
      spender,
      kind: "permit2",
      amount,
      unlimited: isUnlimited(amount, "permit2"),
      expiration: expiration === null ? null : Number(expiration),
    };
  }
  return null;
}
