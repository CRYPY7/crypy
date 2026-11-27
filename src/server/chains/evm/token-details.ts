import "server-only";
import { type PublicClient, erc20Abi, getAddress } from "viem";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import { type TokenDetails, tokenDetails } from "@/server/tokens/registry";

/**
 * Token details for EVM chains through the shared registry (step R1): memory, then the database, then batched
 * multicalls for tokens nobody has read yet. Every EVM tool (balances, transactions, activity, alerts) uses this, so a
 * token is read from the chain once, not once per tool and visitor.
 */
const BATCH = 100;
/** Batches read at once. */
const PARALLEL = 4;

export async function evmTokenDetails(
  client: PublicClient,
  chainKey: string,
  addresses: readonly string[],
  given?: ReadonlyMap<string, TokenDetails>,
): Promise<Map<string, TokenDetails | null>> {
  return tokenDetails(chainKey, addresses, (missing) => readFromChain(client, missing), given);
}

/** The chain reader: batched multicalls, several at once. A failed batch is left out (not stored as "unreadable"). */
async function readFromChain(client: PublicClient, addresses: string[]): Promise<Map<string, TokenDetails | null>> {
  const found = new Map<string, TokenDetails | null>();
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += BATCH) batches.push(addresses.slice(i, i + BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      await readBatch(client, batch, found).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  return found;
}

async function readBatch(client: PublicClient, batch: string[], found: Map<string, TokenDetails | null>) {
  const results = await client.multicall({
    allowFailure: true,
    contracts: batch.flatMap((a) => {
      const address = getAddress(a);
      return [
        { address, abi: erc20Abi, functionName: "name" as const },
        { address, abi: erc20Abi, functionName: "symbol" as const },
        { address, abi: erc20Abi, functionName: "decimals" as const },
      ];
    }),
  });
  batch.forEach((address, j) => {
    const [name, symbol, decimals] = [results[j * 3], results[j * 3 + 1], results[j * 3 + 2]];
    const dec = decimals?.status === "success" ? Number(decimals.result) : NaN;
    const valid = Number.isInteger(dec) && dec >= 0 && dec <= 255;
    found.set(
      address.toLowerCase(),
      valid && symbol?.status === "success"
        ? {
            name: sanitizeTokenText(name?.status === "success" ? name.result : "", 64),
            symbol: sanitizeTokenText(symbol.result, 32),
            decimals: dec,
          }
        : null,
    );
  });
}
