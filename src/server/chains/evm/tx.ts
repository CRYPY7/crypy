import "server-only";
import { type Hex, type PublicClient, decodeErrorResult, erc20Abi, getAddress, parseAbi } from "viem";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { TxDetails, TxToken } from "@/lib/chains/types";
import { decodeCallData } from "@/modules/tools/tx-decoder/decode";
import { chainDex } from "./dex";
import { getOnchainPrices } from "./prices";
import { parseTxLogs } from "./tx-logs";

/** Raw input shown on the page (hex characters); the full data is on the explorer. */
const INPUT_PREVIEW_CHARS = 4_096;
/** Token contracts read per transaction (name, symbol, decimals). */
const MAX_TOKENS = 40;
/** Tokens priced per transaction. */
const MAX_PRICED = 20;

const errorAbi = parseAbi(["error Error(string message)", "error Panic(uint256 code)"]);

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
        if (decoded.errorName === "Error") return sanitizeTokenText(decoded.args[0], 200) || "none";
        return `Panic 0x${(decoded.args[0] as bigint).toString(16)}`;
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

export async function getEvmTxDetails(client: PublicClient, chain: ChainConfig, hash: Hex): Promise<TxDetails | null> {
  const tx = await client.getTransaction({ hash }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "TransactionNotFoundError") return null;
    throw error;
  });
  if (!tx) return null;

  const pending = tx.blockNumber === null;
  const [receipt, block, head, toCode] = await Promise.all([
    pending ? null : client.getTransactionReceipt({ hash }),
    pending ? null : client.getBlock({ blockNumber: tx.blockNumber! }),
    client.getBlockNumber(),
    // viem returns undefined for "no code"; a failed read becomes null.
    tx.to ? client.getCode({ address: tx.to }).catch(() => null) : null,
  ]);

  const wrapped = chainDex[chain.key]?.quotes.find((q) => q.role === "wrapped-native")?.address;
  const logs = parseTxLogs(
    (receipt?.logs ?? []).map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
    wrapped,
  );
  // The called contract is looked up too, so the page can say "called transfer on USDC".
  const calledContract = tx.to && toCode ? [tx.to.toLowerCase()] : [];
  const tokenAddresses = [
    ...new Set([...calledContract, ...[...logs.transfers, ...logs.approvals].map((item) => item.token.toLowerCase())]),
  ];

  const status: TxDetails["status"] = pending ? "pending" : receipt!.status === "success" ? "success" : "reverted";
  const [tokens, revertReason] = await Promise.all([
    readTokens(client, tokenAddresses),
    status === "reverted"
      ? readRevertReason(client, { ...tx, input: tx.input }, tx.blockNumber!).catch(() => null)
      : Promise.resolve(null),
  ]);

  const priced = Object.values(tokens)
    .filter((token) => token.decimals !== null)
    .slice(0, MAX_PRICED)
    .map((token) => ({ address: token.address, decimals: token.decimals! }));
  const prices: Record<string, number> = {};
  try {
    const quotes = await getOnchainPrices(client, chain, priced);
    if (quotes.native) prices.native = quotes.native.usd;
    for (const [address, quote] of quotes.tokens) prices[address.toLowerCase()] = quote.usd;
  } catch {
    // Prices are optional: amounts are still shown.
  }

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
  };
}
