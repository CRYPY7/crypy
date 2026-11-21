import "server-only";
import type { PublicClient } from "viem";
import type { ChainConfig } from "@/config/chains";
import { getEvmClient } from "./providers";

/**
 * Block ↔ time on an EVM chain, read from real block headers (block times aren't regular, so nothing is assumed).
 * Date → block: the first block at or after the time, found by interpolation then bisection (about 15–30 header
 * reads, each block read once). A future time gives an estimate from the recent average block time, labelled so.
 */
export interface BlockAtTime {
  chain: string;
  block: number;
  /** Unix seconds of that block (or the requested time, for an estimate). */
  time: number;
  estimate: boolean;
}

const MAX_PROBES = 48;

async function header(client: PublicClient, cache: Map<number, number>, n: number): Promise<number> {
  const hit = cache.get(n);
  if (hit !== undefined) return hit;
  const block = await client.getBlock({ blockNumber: BigInt(n) });
  const time = Number(block.timestamp);
  cache.set(n, time);
  return time;
}

export async function evmBlockAtTime(chain: ChainConfig, time: number): Promise<BlockAtTime> {
  const client = getEvmClient(chain);
  const cache = new Map<number, number>();
  const latest = await client.getBlock({ blockTag: "latest" });
  let hi = Number(latest.number);
  let hiTime = Number(latest.timestamp);
  cache.set(hi, hiTime);
  if (time > hiTime) {
    const back = Math.min(hi - 1, 10_000);
    const pastTime = await header(client, cache, hi - back);
    const avg = (hiTime - pastTime) / back;
    return { chain: chain.key, block: hi + Math.ceil((time - hiTime) / avg), time, estimate: true };
  }
  // Block 0 of some chains has timestamp 0; start from block 1.
  let lo = 1;
  let loTime = await header(client, cache, lo);
  if (time <= loTime) return { chain: chain.key, block: lo, time: loTime, estimate: false };
  // Invariant: time(lo) < target <= time(hi).
  for (let probes = 0; hi - lo > 1 && probes < MAX_PROBES; probes++) {
    const span = hiTime - loTime;
    const guess = span > 0 ? lo + Math.round(((time - loTime) / span) * (hi - lo)) : lo + 1;
    // Interpolate first, bisect when it stops narrowing fast.
    const mid = probes < 8 ? Math.min(hi - 1, Math.max(lo + 1, guess)) : Math.floor((lo + hi) / 2);
    const midTime = await header(client, cache, mid);
    if (midTime < time) {
      lo = mid;
      loTime = midTime;
    } else {
      hi = mid;
      hiTime = midTime;
    }
  }
  return { chain: chain.key, block: hi, time: hiTime, estimate: false };
}

export async function evmBlockTime(
  chain: ChainConfig,
  block: number,
): Promise<{ chain: string; block: number; time: number } | null> {
  const client = getEvmClient(chain);
  const b = await client.getBlock({ blockNumber: BigInt(block) }).catch(() => null);
  return b ? { chain: chain.key, block, time: Number(b.timestamp) } : null;
}
