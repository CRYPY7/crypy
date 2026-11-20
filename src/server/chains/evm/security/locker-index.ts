import "server-only";
import { type PublicClient, getAddress, parseAbi } from "viem";
import { toUnlock, type RawLock } from "./lockers";

/**
 * In-memory index of lock contracts that can't list the locks of one token on-chain (Team Finance, UNCX v3).
 *
 * The index is built by reading every lock once (250 locks per request, one request at a time: about a minute for
 * 25,000 locks) and is then topped up with only the new locks on each check. It stores just "which locks belong to which token/pool";
 * the lock terms themselves are always read again live, so a withdrawn or changed lock is never shown from memory.
 * The index lives per server process (zero cost; no database needed). While it is being built for the first time a
 * check waits up to WAIT_MS, after which the lock's terms are reported as "not read" and the build continues.
 */
const CHUNK = 250;
const WAIT_MS = 8_000;
/**
 * Chunks read at the same time while building, and the pause between rounds. Kept gentle on purpose: free nodes
 * time out or rate-limit big bursts, and a node that does is skipped for a minute by every other check too.
 */
const PARALLEL = 1;
const PAUSE_MS = 150;
/** One node request per chunk instead of viem's default ~1 KB split. */
const BATCH_BYTES = 64_000;

interface Index {
  /** Next id to read. */
  next: number;
  /** token or pool (lowercase) → lock ids. */
  byKey: Map<string, number[]>;
  building: Promise<void> | null;
}
const indexes = new Map<string, Index>();

async function grow(
  key: string,
  total: () => Promise<number>,
  readChunk: (from: number, to: number) => Promise<(string | null)[]>,
): Promise<Index> {
  let index = indexes.get(key);
  if (!index) {
    index = { next: 0, byKey: new Map(), building: null };
    indexes.set(key, index);
  }
  const idx = index;
  if (!idx.building) {
    idx.building = (async () => {
      const end = await total();
      // Read several chunks at once; entries are stored in id order once all chunks of a round are in.
      while (idx.next <= end) {
        const starts: number[] = [];
        for (let from = idx.next; from <= end && starts.length < PARALLEL; from += CHUNK) starts.push(from);
        const results = await Promise.all(starts.map((from) => readChunk(from, Math.min(end, from + CHUNK - 1))));
        results.forEach((keys, c) => {
          keys.forEach((k, i) => {
            if (!k) return;
            const list = idx.byKey.get(k) ?? [];
            list.push(starts[c]! + i);
            idx.byKey.set(k, list);
          });
        });
        idx.next = Math.min(end, starts[starts.length - 1]! + CHUNK - 1) + 1;
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    })().finally(() => {
      idx.building = null;
    });
  }
  const done = await Promise.race([
    idx.building.then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), WAIT_MS)),
  ]);
  if (!done) throw new Error("index not ready");
  return idx;
}

const tfAbi = parseAbi([
  "function depositId() view returns (uint256)",
  "function lockedToken(uint256) view returns (address, address, uint256, uint256, bool)",
]);

/** Team Finance locks of one token, read live. null: the index isn't ready or the reads failed. */
export async function teamFinanceLocks(client: PublicClient, locker: string, token: string): Promise<RawLock[] | null> {
  const address = getAddress(locker);
  try {
    const index = await grow(
      `tf:${client.chain?.id}:${address}`,
      async () => Number(await client.readContract({ address, abi: tfAbi, functionName: "depositId" })),
      async (from, to) => {
        const rows = await client.multicall({
          allowFailure: true,
          batchSize: BATCH_BYTES,
          contracts: Array.from({ length: to - from + 1 }, (_, i) => ({
            address,
            abi: tfAbi,
            functionName: "lockedToken" as const,
            args: [BigInt(from + i)] as const,
          })),
        });
        // Withdrawn deposits can never come back, so they're left out of the index.
        return rows.map((r) => (r.status === "success" && !r.result[4] ? r.result[0].toLowerCase() : null));
      },
    );
    const ids = index.byKey.get(token.toLowerCase()) ?? [];
    if (ids.length === 0) return [];
    const rows = await client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({ address, abi: tfAbi, functionName: "lockedToken" as const, args: [BigInt(id)] })),
    });
    return rows
      .filter((r) => !r[4] && r[0].toLowerCase() === token.toLowerCase())
      .map((r) => ({ amount: r[2], unlockAt: toUnlock(r[3]), vesting: false }));
  } catch {
    return null;
  }
}

const uncxV3Abi = parseAbi([
  "function NONCE() view returns (uint256)",
  "function getLock(uint256) view returns ((uint256 lock_id, address nftPositionManager, address pool, uint256 nft_id, address owner, address pendingOwner, address additionalCollector, address collectAddress, uint256 unlockDate, uint16 countryCode, uint256 ucf))",
]);

export interface PositionLock {
  positionManager: string;
  nftId: bigint;
  unlockAt: number | null;
}

/** UNCX v3 locks of one pool, read live. null: the index isn't ready or the reads failed. */
export async function uncxV3Locks(client: PublicClient, locker: string, pool: string): Promise<PositionLock[] | null> {
  const address = getAddress(locker);
  try {
    const index = await grow(
      `uncx3:${client.chain?.id}:${address}`,
      async () => Number(await client.readContract({ address, abi: uncxV3Abi, functionName: "NONCE" })),
      async (from, to) => {
        const rows = await client.multicall({
          allowFailure: true,
          batchSize: BATCH_BYTES,
          contracts: Array.from({ length: to - from + 1 }, (_, i) => ({
            address,
            abi: uncxV3Abi,
            functionName: "getLock" as const,
            args: [BigInt(from + i)] as const,
          })),
        });
        return rows.map((r) =>
          r.status === "success" && !/^0x0{40}$/i.test(r.result.pool) ? r.result.pool.toLowerCase() : null,
        );
      },
    );
    const ids = index.byKey.get(pool.toLowerCase()) ?? [];
    if (ids.length === 0) return [];
    const rows = await client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({ address, abi: uncxV3Abi, functionName: "getLock" as const, args: [BigInt(id)] })),
    });
    return rows
      .filter((r) => r.pool.toLowerCase() === pool.toLowerCase())
      .map((r) => ({ positionManager: r.nftPositionManager, nftId: r.nft_id, unlockAt: toUnlock(r.unlockDate) }));
  } catch {
    return null;
  }
}

/** Tests only. */
export function resetLockerIndexes() {
  indexes.clear();
}

/** Starts building the indexes for a chain's lockers in the background (called once at server start). */
export function warmLockerIndexes(client: PublicClient, list: { address: string; kind: string }[]) {
  for (const l of list) {
    const probe = "0x0000000000000000000000000000000000000001";
    if (l.kind === "team-finance") void teamFinanceLocks(client, l.address, probe);
    if (l.kind === "uncx-v3") void uncxV3Locks(client, l.address, probe);
  }
}
