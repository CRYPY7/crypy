/**
 * Liquidity holders, live (real nodes). Run with:  LIVE=1 pnpm test tests/unit/liquidity-live.test.ts
 * GoPlus leads are passed in by hand (its client uses Next.js caching); the engine still reads every share on-chain.
 * Real tokens picked on 2026-11-20 for the lock each one shows; their holders may change over time.
 */
import { describe, expect, it } from "vitest";
import { getAddress, parseAbi } from "viem";
import { type ChainKey, getChain } from "@/config/chains";
import type { PoolHolders } from "@/lib/security/types";
import { getEvmClient } from "@/server/chains/evm/providers";
import { dexDeployments } from "@/server/chains/evm/security/dex-registry";
import { farms, lockers, vaultFactories } from "@/server/chains/evm/security/lockers";
import { teamFinanceLocks } from "@/server/chains/evm/security/locker-index";
import { readPoolHolders } from "@/server/chains/evm/security/lp-holders";
import { findPools, readPools, verifyLeadPools } from "@/server/chains/evm/security/pools";

const live = process.env.LIVE === "1";
const now = () => Math.floor(Date.now() / 1000);

async function holdersOf(key: ChainKey, token: string, leads: string[] = [], owner: string | null = null) {
  const chain = getChain(key)!;
  const client = getEvmClient(chain);
  const t = getAddress(token);
  const readings = await readPools(client, t, await findPools(client, key, t));
  const block = await client.getBlockNumber();
  const map = await readPoolHolders(client, { chain: key, token: t, owner, leads, block, now: now() }, readings);
  const byPool = (address: string) => map.get(address.toLowerCase()) as PoolHolders;
  return { readings, byPool };
}

describe.skipIf(!live)("liquidity holders (live)", () => {
  it("GoPlus pool leads: an ApeSwap pair is confirmed with its factory; a non-pair is rejected", async () => {
    const chain = getChain("bsc")!;
    const client = getEvmClient(chain);
    const floki = "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E";
    const extra = await verifyLeadPools(
      client,
      "bsc",
      floki,
      ["0xacc22e0ff64e788e6ad569a57d130b9d957494dc", "0x17e98a24f992bb7bcd62d6722d714a3c74814b94"],
      [],
    );
    expect(extra.map((p) => [p.address.toLowerCase(), p.dex.name])).toEqual([
      ["0xacc22e0ff64e788e6ad569a57d130b9d957494dc", "ApeSwap"],
    ]);
  }, 60_000);

  it("registry: lockers answer their read methods, vault factories and farms have code, v3 managers match", async () => {
    const lockAbi = parseAbi([
      "function getNumLocksForToken(address) view returns (uint256)",
      "function totalLockCountForToken(address) view returns (uint256)",
      "function depositId() view returns (uint256)",
      "function NONCE() view returns (uint256)",
    ]);
    const call = {
      "uncx-v2": "getNumLocksForToken",
      "pinklock-v1": "totalLockCountForToken",
      "pinklock-v2": "totalLockCountForToken",
      "team-finance": "depositId",
      "uncx-v3": "NONCE",
    } as const;
    const one = "0x0000000000000000000000000000000000000001";
    for (const key of ["ethereum", "bsc"] as const) {
      const client = getEvmClient(getChain(key)!);
      for (const l of lockers[key]) {
        const fn = call[l.kind];
        const args = fn === "depositId" || fn === "NONCE" ? [] : [one];
        // @ts-expect-error one ABI for several read methods
        const r = await client.readContract({ address: getAddress(l.address), abi: lockAbi, functionName: fn, args });
        expect(typeof r, `${key} ${l.name}`).toBe("bigint");
      }
      for (const a of [...vaultFactories[key].map((f) => f.factory), ...farms[key].map((f) => f.address)]) {
        expect(((await client.getCode({ address: getAddress(a) })) ?? "0x").length, a).toBeGreaterThan(2);
      }
      const npmAbi = parseAbi(["function factory() view returns (address)"]);
      for (const d of dexDeployments[key].filter((x) => x.positionManager)) {
        const f = await client.readContract({
          address: getAddress(d.positionManager!),
          abi: npmAbi,
          functionName: "factory",
        });
        expect(f.toLowerCase(), d.name).toBe(d.factory.toLowerCase());
      }
      const pairsAbi = parseAbi(["function allPairsLength() view returns (uint256)"]);
      for (const d of dexDeployments[key].filter((x) => x.protocol === "uniswap-v2")) {
        const n = await client.readContract({
          address: getAddress(d.factory),
          abi: pairsAbi,
          functionName: "allPairsLength",
        });
        expect(n, d.name).toBeGreaterThan(0n);
      }
    }
  }, 120_000);

  it("FLOKI (BNB Chain): UNCX lock read, Safe multisig 3 of 5, OnlyMoons vault confirmed by its factory", async () => {
    const { byPool } = await holdersOf("bsc", "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E", [
      "0xc765bddb93b0d1c1a88282ba0fa6b2d00e3e0c83",
      "0x17e98a24f992bb7bcd62d6722d714a3c74814b94",
      "0x44277c73295149b7a28776d0de9d0ee1fafde6f8",
    ]);
    const main = byPool("0x231d9e7181E8479A8B40930961e93E7ed798542C");
    expect(main.found).toBeGreaterThan(0.99);
    const uncx = main.holders.find((h) => h.kind === "locker")!;
    expect(uncx).toMatchObject({ name: "UNCX (PancakeSwap locker)", lockRead: "read" });
    expect(uncx.locks[0]!.unlockAt).toBe(9_999_999_999);
    expect(main.holders.find((h) => h.kind === "multisig")).toMatchObject({ multisig: { threshold: 3, signers: 5 } });
    expect(main.holders.find((h) => h.kind === "vault")).toMatchObject({ name: "OnlyMoons vault", lockRead: "read" });
  }, 90_000);

  it("PinkLock v2 (BNB Chain): the pool's LP is in one PinkLock lock, read from the locker", async () => {
    const { byPool } = await holdersOf("bsc", "0x50f436ba32aA9c42D359aCa5dAeC2A8a32fB7d54");
    const pool = byPool("0x12448cE2AdADDb6fAc8A4ad84ac97c4b79fF7DB2");
    const pink = pool.holders.find((h) => h.name === "PinkLock v2")!;
    expect(pink.lockRead).toBe("read");
    expect(pink.share).toBeGreaterThan(0.99);
    expect(pink.locks).toHaveLength(1);
  }, 90_000);

  it("Team Finance (Ethereum): lock found through the deposit index and read live", async () => {
    // A running server builds this index in the background at start (about a minute); wait for it here.
    const client = getEvmClient(getChain("ethereum")!);
    const locker = lockers.ethereum.find((l) => l.kind === "team-finance")!;
    for (
      let i = 0;
      i < 30 && (await teamFinanceLocks(client, locker.address, "0x0000000000000000000000000000000000000001")) === null;
      i++
    );
    const { byPool } = await holdersOf("ethereum", "0x9B4a69dE6CA0deFDD02c0c4ce6Cb84de5202944E");
    const pool = byPool("0xAe65deB03bb02E7A66fB76ff9349968E185bBc38");
    const tf = pool.holders.find((h) => h.name === "Team Finance")!;
    expect(tf.lockRead).toBe("read");
    expect(tf.locks.reduce((s, l) => s + l.share, 0)).toBeCloseTo(tf.share, 3);
  }, 300_000);

  it("UNCX v3 (BNB Chain): locked PancakeSwap v3 positions found from the locker's list, valued by liquidity", async () => {
    const { byPool } = await holdersOf("bsc", "0x72885fBFA330d1a8fA95880A85b73d699943053B");
    const pool = byPool("0x2387635F538ae5BaD9F28B1a89F9ac216a189406");
    expect(pool.kind).toBe("positions");
    const locked = pool.holders.filter((h) => h.kind === "locker" && h.position);
    expect(locked.length).toBeGreaterThanOrEqual(2);
    expect(locked.every((h) => h.lockRead === "read" && h.locks[0]!.unlockAt! > now())).toBe(true);
    expect(pool.found).toBeGreaterThan(0.9);
  }, 90_000);

  it("CAKE (BNB Chain): LP staked in PancakeSwap farms; the exchange's fee collector is named", async () => {
    const { byPool } = await holdersOf("bsc", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82");
    const pool = byPool("0x0eD7e52944161450477ee417DE9Cd3a859b14fD0");
    expect(pool.holders.filter((h) => h.kind === "farm").reduce((s, h) => s + h.share, 0)).toBeGreaterThan(0.3);
    expect(pool.holders.some((h) => h.kind === "exchange" && h.name === "PancakeSwap v2")).toBe(true);
    expect(pool.found).toBeLessThan(1); // the rest is many LPs CRYPY can't list yet: reported as "not found"
  }, 90_000);
});
