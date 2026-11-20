import "server-only";
import { type PublicClient, concat, erc20Abi, getAddress, hexToBigInt, pad, parseAbi, slice } from "viem";

/**
 * Batch balances for many addresses at one block (Batch Balance Scanner, M4.5).
 * Two reads per batch, both standard `eth_call`s that any node answers:
 *  1. one multicall: native balance (Multicall3.getEthBalance) + balanceOf for each token, per address;
 *  2. one "deployless" call that returns each address's code size, to tell wallets from contracts.
 * Nothing is deployed or sent; the server only reads.
 */

export const MAX_BATCH_ADDRESSES = 100;
export const MAX_BATCH_TOKENS = 5;

/**
 * 37-byte EVM program run as the init code of an eth_call (no `to`). It copies the 32-byte address words appended
 * after it into memory, replaces each with EXTCODESIZE(address) and returns them. Hand-assembled:
 *   PUSH2 0x25 DUP1 CODESIZE SUB DUP1 SWAP2 PUSH1 0 CODECOPY        ; mem[0..n) = appended words
 *   PUSH1 0 JUMPDEST(0d) DUP2 DUP2 LT ISZERO PUSH1 0x20 JUMPI       ; for i = 0; i < n; i += 32
 *   DUP1 MLOAD EXTCODESIZE DUP2 MSTORE PUSH1 0x20 ADD PUSH1 0x0d JUMP ;   mem[i] = extcodesize(mem[i])
 *   JUMPDEST(20) POP PUSH1 0 RETURN                                 ; return mem[0..n)
 * Tested in tests/unit/batch-live.test.ts against known contracts and wallets on both chains.
 */
export const CODE_SIZE_PROGRAM =
  "0x610025803803809160003960005b8181101560205780513b8152602001600d565b506000f3" as `0x${string}`;
const PROGRAM = CODE_SIZE_PROGRAM;

/** EIP-7702: a wallet that delegates to code has exactly 23 bytes of code starting with 0xef0100. */
const DELEGATION_SIZE = 23n;
const DELEGATION_PREFIX = "0xef0100";

const multicall3Abi = parseAbi(["function getEthBalance(address addr) view returns (uint256 balance)"]);

export type AccountType = "wallet" | "contract" | "delegated";

export interface BatchRow {
  address: string;
  /** null: the type couldn't be read. */
  type: AccountType | null;
  /** Raw integers as strings; null when that read failed. */
  native: string | null;
  tokens: (string | null)[];
}

export interface BatchResult {
  block: string;
  rows: BatchRow[];
}

export async function accountTypes(
  client: PublicClient,
  addresses: `0x${string}`[],
  blockNumber: bigint,
): Promise<(AccountType | null)[]> {
  try {
    const { data } = await client.call({ data: concat([PROGRAM, ...addresses.map((a) => pad(a))]), blockNumber });
    if (!data || (data.length - 2) / 64 !== addresses.length) return addresses.map(() => null);
    const sizes = addresses.map((_, i) => hexToBigInt(slice(data, i * 32, (i + 1) * 32)));
    // Confirm possible delegated wallets by their code (rare, so a few extra reads at most).
    const delegated = await Promise.all(
      sizes.map((size, i) =>
        size === DELEGATION_SIZE
          ? client
              .getCode({ address: addresses[i]!, blockNumber })
              .then((code) => (code ?? "").toLowerCase().startsWith(DELEGATION_PREFIX))
              .catch(() => false)
          : false,
      ),
    );
    return sizes.map((size, i) => (size === 0n ? "wallet" : delegated[i] ? "delegated" : "contract"));
  } catch {
    return addresses.map(() => null);
  }
}

async function readAt(
  client: PublicClient,
  addresses: `0x${string}`[],
  tokens: `0x${string}`[],
  blockNumber: bigint,
): Promise<BatchRow[]> {
  const multicall3 = client.chain?.contracts?.multicall3?.address;
  if (!multicall3) throw new Error("Multicall3 not configured for this chain");
  const per = 1 + tokens.length;
  const [results, types] = await Promise.all([
    client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: addresses.flatMap((address) => [
        { address: multicall3, abi: multicall3Abi, functionName: "getEthBalance" as const, args: [address] as const },
        ...tokens.map((token) => ({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address] as const,
        })),
      ]),
    }),
    accountTypes(client, addresses, blockNumber),
  ]);
  return addresses.map((address, i) => {
    const cell = (j: number) => {
      const r = results[i * per + j];
      return r?.status === "success" ? String(r.result) : null;
    };
    return {
      address,
      type: types[i] ?? null,
      native: cell(0),
      tokens: tokens.map((_, t) => cell(1 + t)),
    };
  });
}

/**
 * Reads one batch. `blockNumber` keeps every batch of a scan on the same block; if the node no longer has that
 * block's state, the batch is read at the latest block instead (the response says which block it used).
 */
export async function readBatchBalances(
  client: PublicClient,
  addresses: string[],
  tokens: string[],
  blockNumber?: bigint,
): Promise<BatchResult> {
  const list = addresses.slice(0, MAX_BATCH_ADDRESSES).map((a) => getAddress(a));
  const tokenList = tokens.slice(0, MAX_BATCH_TOKENS).map((a) => getAddress(a));
  if (blockNumber !== undefined) {
    try {
      return { block: blockNumber.toString(), rows: await readAt(client, list, tokenList, blockNumber) };
    } catch {
      // Fall through to the latest block.
    }
  }
  const latest = await client.getBlockNumber();
  return { block: latest.toString(), rows: await readAt(client, list, tokenList, latest) };
}
