import "server-only";
import { type Hex, type PublicClient, decodeErrorResult, erc20Abi, getAddress, parseAbi } from "viem";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { TxDetails, TxToken } from "@/lib/chains/types";
import { decodeCallData } from "@/modules/tools/tx-decoder/decode";
import { chainDex } from "./dex";
import { getOnchainPrices } from "./prices";
import { archiveClient } from "./providers";
import { parseTxLogs } from "./tx-logs";

/** Raw input shown on the page (hex characters); the full data is on the explorer. */
const INPUT_PREVIEW_CHARS = 4_096;
/** Token contracts read per transaction (name, symbol, decimals). */
const MAX_TOKENS = 40;
/** Tokens priced per transaction. */
const MAX_PRICED = 20;

/** Standard errors we can name. Custom errors outside this list are shown by their 4-byte ID only. */
const errorAbi = parseAbi([
  "error Error(string message)",
  "error Panic(uint256 code)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC721InsufficientApproval(address operator, uint256 tokenId)",
  "error OwnableUnauthorizedAccount(address account)",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error EnforcedPause()",
]);
const MAX_EVENTS = 400;
const EVENT_DATA_CHARS = 2 + 512;

const typeNames: Record<string, string> = {
  legacy: "legacy",
  eip2930: "eip2930",
  eip1559: "eip1559",
  eip4844: "eip4844",
  eip7702: "eip7702",
};

async function readTokens(client: PublicClient, addresses: string[]): Promise<Record<string, TxToken>> {
  const list = addresses.slice(0, MAX_TOKENS).map((a) => getAddress(a));
  if (list.length === 0) return {};
  const results = await client
    .multicall({
      allowFailure: true,
      contracts: list.flatMap((address) => [
        { address, abi: erc20Abi, functionName: "name" as const },
        { address, abi: erc20Abi, functionName: "symbol" as const },
        { address, abi: erc20Abi, functionName: "decimals" as const },
      ]),
    })
    .catch(() => null);
  const out: Record<string, TxToken> = {};
  list.forEach((address, i) => {
    const [name, symbol, decimals] = results ? [results[i * 3], results[i * 3 + 1], results[i * 3 + 2]] : [];
    const dec = decimals?.status === "success" ? Number(decimals.result) : NaN;
    out[address.toLowerCase()] = {
      address,
      name: sanitizeTokenText(name?.status === "success" ? name.result : "", 64),
      symbol: sanitizeTokenText(symbol?.status === "success" ? symbol.result : "", 32),
      decimals: Number.isInteger(dec) && dec >= 0 && dec <= 255 ? dec : null,
    };
  });
  return out;
}

/** Finds revert data (hex) anywhere in a viem error chain. */
function revertData(error: unknown): Hex | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    const data = (current as { data?: unknown }).data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]*$/.test(data) && data.length > 2) return data as Hex;
    if (data && typeof data === "object" && typeof (data as { data?: unknown }).data === "string") {
      const inner = (data as { data: string }).data;
      if (/^0x[0-9a-fA-F]+$/.test(inner)) return inner as Hex;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Best effort: replays a failed transaction one block earlier to read the contract's error message.
 * Needs the node to still have that block's state (recent blocks on public nodes); otherwise null.
 */
async function readRevertReason(
  client: PublicClient,
  tx: { from: string; to: string | null; input: Hex; value: bigint; gas: bigint },
  blockNumber: bigint,
): Promise<string | null> {
  if (!tx.to) return null;
  try {
    await client.call({
      account: getAddress(tx.from),
      to: getAddress(tx.to),
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
      blockNumber: blockNumber - 1n,
    });
    // It succeeded on the earlier state, so the failure depended on something in the same block.
    return null;
  } catch (error) {
    const data = revertData(error);
    if (data) {
      try {
        const decoded = decodeErrorResult({ abi: errorAbi, data });
        if (decoded.errorName === "Error") return sanitizeTokenText(decoded.args[0] as string, 200) || "none";
        if (decoded.errorName === "Panic") return `Panic 0x${(decoded.args![0] as bigint).toString(16)}`;
        // Standard named error, e.g. "ERC20InsufficientBalance".
        return decoded.errorName;
      } catch {
        // Custom error: show its 4-byte selector, never a guessed name.
        return `Custom error ${data.slice(0, 10)}`;
      }
    }
    const message = error instanceof Error ? error.message : "";
    const match = /execution reverted(?::\s*([^\n]+))?/i.exec(message);
    if (match) return match[1] ? sanitizeTokenText(match[1], 200) : "none";
    // e.g. "missing trie node" / "header not found": the node no longer has that state.
    return null;
  }
}

/** Optional extras (failure reason, past prices) must never hold the page up: null after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

const OPTIONAL_MS = 2_500;
/** Blocks for which free public nodes still keep state (they keep ~128; a margin for slow nodes). */
const RECENT_BLOCKS = 100n;
const PRICES_MS = 4_000;

/**
 * Three network rounds in total (each round is one batched request where the provider allows):
 * 1. transaction + receipt + latest block number;
 * 2. block, called contract's code, sender nonce (pending), token names, failure reason, price pools (+ decimals);
 * 3. price pool readings (today and at the transaction's block, in parallel).
 */
export async function getEvmTxDetails(client: PublicClient, chain: ChainConfig, hash: Hex): Promise<TxDetails | null> {
  // Round 1
  const [tx, receiptOrNull, head] = await Promise.all([
    client.getTransaction({ hash }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TransactionNotFoundError") return null;
      throw error;
    }),
    client.getTransactionReceipt({ hash }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return null;
      throw error;
    }),
    client.getBlockNumber(),
  ]);
  if (!tx) return null;
  const pending = tx.blockNumber === null;
  // Mined between the two reads of round 1: fetch the receipt once more.
  const receipt = pending ? null : (receiptOrNull ?? (await client.getTransactionReceipt({ hash })));

  const wrapped = chainDex[chain.key]?.quotes.find((q) => q.role === "wrapped-native")?.address;
  const logs = parseTxLogs(
    (receipt?.logs ?? []).map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
    wrapped,
  );
  const logTokens = [...new Set([...logs.transfers, ...logs.approvals].map((item) => item.token.toLowerCase()))];
  const status: TxDetails["status"] = pending ? "pending" : receipt!.status === "success" ? "success" : "reverted";
  // Replaying the failure and reading past prices need the state of an earlier block. Free public nodes keep only
  // recent blocks (about 128), so for older transactions this is tried only with an archive-capable provider.
  // Recent blocks: any node. Older blocks: only an archive-capable provider (Alchemy); none → skip.
  const pastClient = pending ? null : head - tx.blockNumber! <= RECENT_BLOCKS ? client : archiveClient(chain);
  // Prices: token decimals are read inside the price engine's first round, so prices don't wait for names.
  const priced = logTokens.slice(0, MAX_PRICED).map((address) => ({ address, decimals: null }));

  // Rounds 2 and 3 (prices take both; everything else finishes in round 2).
  const [block, toCode, latestNonce, tokensRaw, revertReason, nowQuotes, thenQuotes] = await Promise.all([
    pending ? null : client.getBlock({ blockNumber: tx.blockNumber! }),
    // viem returns undefined for "no code"; a failed read becomes null.
    tx.to ? client.getCode({ address: tx.to }).catch(() => null) : null,
    // Pending only: has the sender already used this nonce elsewhere? (evidence of replacement / cancellation)
    pending ? client.getTransactionCount({ address: tx.from, blockTag: "latest" }).catch(() => null) : null,
    // The called contract is read too, so the page can say "called transfer on USDC".
    readTokens(client, [...new Set([...(tx.to ? [tx.to.toLowerCase()] : []), ...logTokens])]),
    status === "reverted" && pastClient
      ? withTimeout(readRevertReason(pastClient, { ...tx, input: tx.input }, tx.blockNumber!), OPTIONAL_MS)
      : null,
    withTimeout(getOnchainPrices(client, chain, priced), PRICES_MS),
    // Prices at the transaction's block, when the node still keeps that state (recent blocks on public nodes;
    // any block with an archive provider). Optional; never mixed with today's prices.
    pastClient ? withTimeout(getOnchainPrices(pastClient, chain, priced, tx.blockNumber!), OPTIONAL_MS) : null,
  ]);

  // Drop the called contract's entry when it isn't a token (nothing readable).
  const tokens = Object.fromEntries(
    Object.entries(tokensRaw).filter(
      ([key, token]) => logTokens.includes(key) || token.symbol || token.name || token.decimals !== null,
    ),
  );
  const toRecord = (quotes: Awaited<ReturnType<typeof getOnchainPrices>>) => {
    const out: Record<string, number> = {};
    if (quotes.native) out.native = quotes.native.usd;
    for (const [address, quote] of quotes.tokens) out[address.toLowerCase()] = quote.usd;
    return out;
  };
  const prices = nowQuotes ? toRecord(nowQuotes) : {};
  const pricesAtTx = thenQuotes && thenQuotes.native ? toRecord(thenQuotes) : null;

  const gasUsed = receipt?.gasUsed ?? null;
  const gasPrice = receipt?.effectiveGasPrice ?? (pending ? (tx.maxFeePerGas ?? tx.gasPrice ?? null) : null);
  const baseFee = block?.baseFeePerGas ?? null;
  const input = tx.input ?? "0x";
  const isCreation = !tx.to;
  const call = isCreation || input === "0x" ? null : decodeCallData(input);

  return {
    chain: chain.key,
    hash: tx.hash,
    status,
    blockNumber: tx.blockNumber?.toString() ?? null,
    from: getAddress(tx.from),
    to: tx.to ? getAddress(tx.to) : null,
    timestamp: block ? Number(block.timestamp) : null,
    confirmations: tx.blockNumber !== null ? Math.max(1, Number(head - tx.blockNumber + 1n)) : null,
    nonce: tx.nonce,
    type: typeNames[tx.type] ?? String(tx.type),
    value: tx.value.toString(),
    gasLimit: tx.gas.toString(),
    gasUsed: gasUsed?.toString() ?? null,
    gasPrice: gasPrice?.toString() ?? null,
    fee: gasUsed !== null && gasPrice !== null ? (gasUsed * gasPrice).toString() : null,
    burnt: gasUsed !== null && baseFee !== null && baseFee > 0n ? (gasUsed * baseFee).toString() : null,
    createdContract: receipt?.contractAddress ? getAddress(receipt.contractAddress) : null,
    toIsContract: !tx.to || toCode === null ? null : toCode !== undefined && toCode !== "0x",
    input: {
      bytes: (input.length - 2) / 2,
      preview: input.slice(0, 2 + INPUT_PREVIEW_CHARS),
      truncated: input.length > 2 + INPUT_PREVIEW_CHARS,
    },
    call,
    logCount: receipt?.logs.length ?? 0,
    otherEvents: Math.max(0, (receipt?.logs.length ?? 0) - logs.usedLogs),
    transfers: logs.transfers,
    approvals: logs.approvals,
    logsTruncated: logs.truncated,
    tokens,
    revertReason: status === "reverted" ? revertReason : null,
    prices,
    pricesAtTx,
    technical: {
      chainId: chain.evmChainId,
      blockHash: tx.blockHash ?? null,
      index: tx.transactionIndex ?? null,
      baseFee: baseFee !== null && baseFee > 0n ? baseFee.toString() : null,
      priorityFee:
        gasPrice !== null && baseFee !== null && baseFee > 0n && !pending && gasPrice >= baseFee
          ? (gasPrice - baseFee).toString()
          : null,
      maxFeePerGas: tx.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null,
    },
    events: (receipt?.logs ?? []).slice(0, MAX_EVENTS).map((log, i) => ({
      index: log.logIndex ?? i,
      address: getAddress(log.address),
      topics: [...log.topics],
      data: log.data.slice(0, EVENT_DATA_CHARS),
      dataBytes: (log.data.length - 2) / 2,
    })),
    nonceUsed: pending && latestNonce !== null ? latestNonce > tx.nonce : null,
    checkedAt: Date.now(),
  };
}
