import "server-only";
import type { PublicClient } from "viem";
import type { ChainConfig } from "@/config/chains";
import { getEvmClient } from "./providers";

/**
 * Block ↔ time on an EVM chain, read from real block headers (block times aren't regular, so nothing is assumed).
 * Date → block: the first block at or after the time. B-014: the reads go out in rounds of a few blocks at once
 * instead of one after another (one round ≈ one network round trip):
 * 1. the newest block;
 * 2. block 1 and blocks 10, 100, 1,000 … back from the newest, which bracket the time within a factor of ten and give
 *    the local block time;
 * 3. then, each round, the block the bracket's times point to plus blocks spread around it (±1, ±8, ±64 steps), until
 *    the bracket is two neighbouring blocks.
 * About 5 rounds and 30–40 header reads per chain. A future time gives an estimate from the recent average block
 * time, labelled so.
 */
export interface BlockAtTime {
  chain: string;
  block: number;
  /** Unix seconds of that block (or the requested time, for an estimate). */
  time: number;
  estimate: boolean;
}

const MAX_ROUNDS = 24;

async function headers(client: PublicClient, cache: Map<number, number>, blocks: number[]): Promise<void> {
  const wanted = [...new Set(blocks)].filter((n) => !cache.has(n));
  const times = await Promise.all(
    wanted.map((n) => client.getBlock({ blockNumber: BigInt(n) }).then((b) => Number(b.timestamp))),
  );
  wanted.forEach((n, i) => cache.set(n, times[i]!));
}

/** The tightest bracket the known headers give: the last block before the time and the first at or after it. */
function bracket(cache: Map<number, number>, time: number): { lo: number; hi: number } {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [n, t] of cache) {
    if (t < time && n > lo) lo = n;
    if (t >= time && n < hi) hi = n;
  }
  return { lo, hi };
}

export async function evmBlockAtTime(chain: ChainConfig, time: number): Promise<BlockAtTime> {
  const client = getEvmClient(chain);
  const cache = new Map<number, number>();
  const latest = await client.getBlock({ blockTag: "latest" });
  const newest = Number(latest.number);
  const newestTime = Number(latest.timestamp);
  cache.set(newest, newestTime);
  if (time > newestTime) {
    const back = Math.min(newest - 1, 10_000);
    await headers(client, cache, [newest - back]);
    const avg = (newestTime - cache.get(newest - back)!) / back;
    return { chain: chain.key, block: newest + Math.ceil((time - newestTime) / avg), time, estimate: true };
  }
  // Block 0 of some chains has timestamp 0; start from block 1.
  const decades: number[] = [1];
  for (let back = 10; back < newest - 1; back *= 10) decades.push(newest - back);
  await headers(client, cache, decades);
  if (time <= cache.get(1)!) return { chain: chain.key, block: 1, time: cache.get(1)!, estimate: false };
  // Invariant from here: time(lo) < target <= time(hi).
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { lo, hi } = bracket(cache, time);
    if (hi - lo <= 1) break;
    const loTime = cache.get(lo)!;
    const hiTime = cache.get(hi)!;
    const guess = lo + Math.round(((time - loTime) / Math.max(1, hiTime - loTime)) * (hi - lo));
    const step = Math.max(1, Math.round((hi - lo) / 256));
    const probes = [0, -1, 1, -8, 8, -64, 64].map((k) => guess + k * step).filter((n) => n > lo && n < hi);
    // Never stuck: when every probe falls outside, bisect.
    await headers(client, cache, probes.length ? probes : [Math.floor((lo + hi) / 2)]);
  }
  const { hi } = bracket(cache, time);
  return { chain: chain.key, block: hi, time: cache.get(hi)!, estimate: false };
}

export async function evmBlockTime(
  chain: ChainConfig,
  block: number,
): Promise<{ chain: string; block: number; time: number } | null> {
  const client = getEvmClient(chain);
  const b = await client.getBlock({ blockNumber: BigInt(block) }).catch(() => null);
  return b ? { chain: chain.key, block, time: Number(b.timestamp) } : null;
}
