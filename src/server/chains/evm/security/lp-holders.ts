import "server-only";
import { type PublicClient, getAddress, parseAbi, parseAbiItem } from "viem";
import type { ChainKey } from "@/config/chains";
import type { LpHolder, LpHolderKind, PoolHolders } from "@/lib/security/types";
import { accountTypes } from "../batch";
import { teamFinanceLocks, uncxV3Locks } from "./locker-index";
import {
  type LockerDeployment,
  type RawLock,
  farmAt,
  farms,
  lockerAt,
  lockers,
  readTokenLocks,
  toUnlock,
  vaultFactories,
} from "./lockers";
import type { PoolReading } from "./pools";

/**
 * Who holds each pool's liquidity.
 *
 * Finding holders. A full list of LP holders needs the pool's whole transfer history, which free nodes can't serve
 * (they cap log searches at a few thousand blocks). Until CRYPY's own indexer exists (roadmap M5.5), candidates are:
 *   - known addresses: burn addresses, the token's owner, the token contract, the pool, every registered locker and farm;
 *   - leads from GoPlus (its list of the pool's largest LP holders), used only as addresses to check;
 *   - everyone in the pool's LP transfers of the last few hours;
 *   - for v3 pools, the registered lockers' own lists of locked positions.
 * Every share is then read on-chain. Whatever isn't accounted for is reported as "not found", never as safe.
 */
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";
const MAX_CANDIDATES = 80;
const MAX_POSITIONS_PER_OWNER = 30;
/** Recent LP-transfer window: about 2.5 hours on BNB Chain, 7 hours on Ethereum (within free-node limits). */
const RECENT_BLOCKS: Record<ChainKey, bigint> = {
  bsc: 20_000n,
  ethereum: 2_000n,
  base: 10_000n,
  arbitrum: 80_000n,
  polygon: 10_000n,
};

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const feeToAbi = parseAbi(["function feeTo() view returns (address)"]);
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const probeAbi = parseAbi([
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getMinDelay() view returns (uint256)",
  "function delay() view returns (uint256)",
  "function vaultFactoryContract() view returns (address)",
]);
const vaultAbi = parseAbi([
  "function vaultStatus(address) view returns (uint8)",
  "function unlockTimestamp() view returns (uint256)",
  "function isUnlocked() view returns (bool)",
]);

export interface HolderContext {
  chain: ChainKey;
  token: string;
  owner: string | null;
  /** Untrusted addresses from GoPlus: only checked, never believed. */
  leads: string[];
  block: bigint;
  now: number;
  /** Protocol-fee collectors (factory feeTo) → exchange name; filled by readPoolHolders. */
  feeCollectors?: Map<string, string>;
}

interface Classified {
  kind: LpHolderKind;
  name: string | null;
  multisig?: { threshold: number; signers: number };
  delay?: number;
  vault?: { unlockAt: number | null } | null;
  upgradeable?: boolean;
}

/** Classifies addresses: registry and context first, then code probes for unknown contracts. */
export async function classify(
  client: PublicClient,
  ctx: HolderContext,
  addresses: string[],
  pools: Set<string>,
): Promise<Map<string, Classified>> {
  const out = new Map<string, Classified>();
  const rest: string[] = [];
  for (const raw of addresses) {
    const a = raw.toLowerCase();
    if (a === DEAD || a === ZERO) out.set(a, { kind: "burn", name: null });
    else if (ctx.owner && a === ctx.owner.toLowerCase()) out.set(a, { kind: "owner", name: null });
    else if (a === ctx.token.toLowerCase()) out.set(a, { kind: "token", name: null });
    else if (pools.has(a)) out.set(a, { kind: "pool", name: null });
    else if (lockerAt(ctx.chain, a)) {
      const l = lockerAt(ctx.chain, a)!;
      out.set(a, { kind: "locker", name: l.name, upgradeable: l.upgradeable });
    } else if (farmAt(ctx.chain, a)) out.set(a, { kind: "farm", name: farmAt(ctx.chain, a)!.name });
    else if (ctx.feeCollectors?.has(a)) out.set(a, { kind: "exchange", name: ctx.feeCollectors.get(a)! });
    else rest.push(a);
  }
  if (rest.length === 0) return out;
  const types = await accountTypes(
    client,
    rest.map((a) => getAddress(a)),
    ctx.block,
  );
  const contracts = rest.filter((_, i) => types[i] === "contract" || types[i] === null);
  rest.forEach((a, i) => {
    if (types[i] === "wallet" || types[i] === "delegated") out.set(a, { kind: "wallet", name: null });
  });
  if (contracts.length === 0) return out;
  const probes = await client.multicall({
    allowFailure: true,
    contracts: contracts.flatMap((a) =>
      (["getThreshold", "getOwners", "getMinDelay", "delay", "vaultFactoryContract"] as const).map((functionName) => ({
        address: getAddress(a),
        abi: probeAbi,
        functionName,
      })),
    ),
  });
  const vaultChecks: { address: string; factory: { factory: string; name: string } }[] = [];
  contracts.forEach((a, i) => {
    const r = (j: number) => {
      const x = probes[i * 5 + j];
      return x?.status === "success" ? x.result : null;
    };
    const threshold = r(0) as bigint | null;
    const owners = r(1) as readonly string[] | null;
    const minDelay = (r(2) ?? r(3)) as bigint | null;
    const factory = r(4) as string | null;
    const registered = factory
      ? vaultFactories[ctx.chain].find((f) => f.factory.toLowerCase() === factory.toLowerCase())
      : undefined;
    if (registered) vaultChecks.push({ address: a, factory: registered });
    else if (threshold !== null && owners && owners.length > 0 && threshold > 0n && threshold <= BigInt(owners.length))
      out.set(a, { kind: "multisig", name: null, multisig: { threshold: Number(threshold), signers: owners.length } });
    else if (minDelay !== null && minDelay < 10n ** 9n)
      out.set(a, { kind: "timelock", name: null, delay: Number(minDelay) });
    else out.set(a, { kind: "contract", name: null });
  });
  if (vaultChecks.length) {
    const v = await client.multicall({
      allowFailure: true,
      contracts: vaultChecks.flatMap(({ address, factory }) => [
        {
          address: getAddress(factory.factory),
          abi: vaultAbi,
          functionName: "vaultStatus" as const,
          args: [getAddress(address)] as const,
        },
        { address: getAddress(address), abi: vaultAbi, functionName: "unlockTimestamp" as const },
        { address: getAddress(address), abi: vaultAbi, functionName: "isUnlocked" as const },
      ]),
    });
    vaultChecks.forEach(({ address, factory }, i) => {
      const [status, ts, unlocked] = [0, 1, 2].map((j) => v[i * 3 + j]);
      const confirmed = status?.status === "success" && Number(status.result) !== 0;
      if (!confirmed) return out.set(address, { kind: "contract", name: null });
      const readable = ts?.status === "success" && unlocked?.status === "success";
      out.set(address, {
        kind: "vault",
        name: factory.name,
        vault: readable
          ? {
              unlockAt: unlocked.result
                ? Math.min(ctx.now, toUnlock(ts.result as bigint) ?? ctx.now)
                : toUnlock(ts.result as bigint),
            }
          : null,
      });
    });
  }
  return out;
}

const fraction = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 1_000_000_000n) / whole) / 1e9 : 0);

function holderFrom(address: string, c: Classified | undefined, share: number): LpHolder {
  const kind = c?.kind ?? "contract";
  const holder: LpHolder = {
    address: getAddress(address),
    kind,
    name: c?.name ?? null,
    share,
    lockRead: kind === "locker" || kind === "vault" ? "unread" : null,
    locks: [],
  };
  if (c?.multisig) holder.multisig = c.multisig;
  if (c?.upgradeable) holder.upgradeable = true;
  if (c?.delay !== undefined) holder.delay = c.delay;
  if (kind === "vault" && c?.vault) {
    holder.lockRead = "read";
    holder.locks = [{ share, unlockAt: c.vault.unlockAt, vesting: false }];
  }
  return holder;
}

async function recentParticipants(
  client: PublicClient,
  ctx: HolderContext,
  pools: string[],
): Promise<{ read: boolean; addresses: string[] }> {
  const fromBlock = ctx.block > RECENT_BLOCKS[ctx.chain] ? ctx.block - RECENT_BLOCKS[ctx.chain] : 0n;
  const logs = await Promise.all(
    pools.map((address) =>
      client
        .getLogs({ address: getAddress(address), event: transferEvent, fromBlock, toBlock: ctx.block })
        .catch(() => null),
    ),
  );
  return {
    read: logs.some((l) => l !== null),
    addresses: logs.flatMap((l) => (l ?? []).flatMap((x) => [x.args.from ?? ZERO, x.args.to ?? ZERO])),
  };
}

/** v2-style pools: LP token holders. */
async function v2Holders(
  client: PublicClient,
  ctx: HolderContext,
  readings: PoolReading[],
  poolSet: Set<string>,
): Promise<Map<string, PoolHolders>> {
  const out = new Map<string, PoolHolders>();
  if (readings.length === 0) return out;
  const deepest = [...readings].sort((a, b) => (b.quoteReserve > a.quoteReserve ? 1 : -1)).slice(0, 3);
  const recent = await recentParticipants(
    client,
    ctx,
    deepest.map((r) => r.pool.address),
  );
  const known = [
    DEAD,
    ZERO,
    ctx.token,
    ...(ctx.owner ? [ctx.owner] : []),
    ...lockers[ctx.chain].map((l) => l.address),
    ...farms[ctx.chain].map((f) => f.address),
    ...(ctx.feeCollectors ? [...ctx.feeCollectors.keys()] : []),
    ...[...poolSet],
  ];
  const candidates = [...new Set([...known, ...ctx.leads, ...recent.addresses].map((a) => a.toLowerCase()))].slice(
    0,
    MAX_CANDIDATES,
  );
  const balances = await client.multicall({
    allowFailure: true,
    contracts: readings.flatMap((r) =>
      candidates.map((c) => ({
        address: getAddress(r.pool.address),
        abi: erc20,
        functionName: "balanceOf" as const,
        args: [getAddress(c)] as const,
      })),
    ),
  });
  const held = new Map<string, Map<string, bigint>>();
  readings.forEach((r, i) => {
    const m = new Map<string, bigint>();
    candidates.forEach((c, j) => {
      const b = balances[i * candidates.length + j];
      if (b?.status === "success" && (b.result as bigint) > 0n) m.set(c, b.result as bigint);
    });
    held.set(r.pool.address.toLowerCase(), m);
  });
  const everyone = [...new Set([...held.values()].flatMap((m) => [...m.keys()]))];
  const classes = await classify(client, ctx, everyone, poolSet);
  await Promise.all(
    readings.map(async (r) => {
      const supply = r.lpSupply ?? 0n;
      const m = held.get(r.pool.address.toLowerCase())!;
      if (supply === 0n) return;
      const heldLockers = [...m.keys()].map((a) => lockerAt(ctx.chain, a)).filter((l): l is LockerDeployment => !!l);
      const locks = await readTokenLocks(client, r.pool.address, heldLockers);
      await Promise.all(
        heldLockers
          .filter((l) => l.kind === "team-finance")
          .map(async (l) =>
            locks.set(l.address.toLowerCase(), await teamFinanceLocks(client, l.address, r.pool.address)),
          ),
      );
      const holders = [...m.entries()].map(([address, amount]) => {
        const h = holderFrom(address, classes.get(address), fraction(amount, supply));
        if (h.kind === "locker") {
          const list = locks.get(address);
          if (list) {
            h.lockRead = "read";
            h.locks = list
              .filter((x: RawLock) => x.amount > 0n)
              .map((x) => ({ share: fraction(x.amount, supply), unlockAt: x.unlockAt, vesting: x.vesting }));
          }
        }
        return h;
      });
      const found = Math.min(
        1,
        holders.reduce((s, h) => s + h.share, 0),
      );
      out.set(r.pool.address.toLowerCase(), {
        kind: "lp-token",
        found,
        holders: holders.filter((h) => h.share > 0).sort((a, b) => b.share - a.share),
        sources: [
          "known",
          ...(ctx.leads.length ? (["goplus"] as const) : []),
          ...(recent.read ? (["recent-transfers"] as const) : []),
          ...(heldLockers.length ? (["lock-contracts"] as const) : []),
        ],
      });
    }),
  );
  return out;
}

const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
]);
const npmAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function positions(uint256) view returns (uint96, address, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256, uint256, uint128, uint128)",
]);

/** Value of a v3 position in token1 units (raw), from its liquidity and range at the current price. */
export function positionValue(liquidity: bigint, tickLower: number, tickUpper: number, sqrtPriceX96: bigint): number {
  const L = Number(liquidity);
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const a = Math.pow(1.0001, tickLower / 2);
  const b = Math.pow(1.0001, tickUpper / 2);
  let amount0 = 0;
  let amount1 = 0;
  if (s <= a) amount0 = (L * (b - a)) / (a * b);
  else if (s < b) {
    amount0 = (L * (b - s)) / (s * b);
    amount1 = L * (s - a);
  } else amount1 = L * (b - a);
  return amount0 * s * s + amount1;
}

/** v3-style pools: positions (NFTs), shares by value. */
async function v3Holders(
  client: PublicClient,
  ctx: HolderContext,
  reading: PoolReading,
  poolSet: Set<string>,
): Promise<PoolHolders | null> {
  const npm = reading.pool.dex.positionManager;
  if (!npm) return null;
  const pool = getAddress(reading.pool.address);
  const manager = getAddress(npm);
  const v3Lockers = lockers[ctx.chain].filter((l) => l.kind === "uncx-v3");
  const owners = [
    ...new Set(
      [DEAD, ctx.token, ...(ctx.owner ? [ctx.owner] : []), ...ctx.leads]
        .map((a) => a.toLowerCase())
        .filter((a) => !lockerAt(ctx.chain, a) && !farmAt(ctx.chain, a)),
    ),
  ].slice(0, 20);
  const [info, counts, lockLists] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: (["slot0", "token0", "token1", "fee"] as const).map((functionName) => ({
        address: pool,
        abi: v3PoolAbi,
        functionName,
      })),
    }),
    client.multicall({
      allowFailure: true,
      contracts: owners.map((o) => ({
        address: manager,
        abi: npmAbi,
        functionName: "balanceOf" as const,
        args: [getAddress(o)] as const,
      })),
    }),
    Promise.all(v3Lockers.map((l) => uncxV3Locks(client, l.address, pool))),
  ]);
  const [slot0, token0, token1, fee] = info as [readonly [bigint, number, ...unknown[]], string, string, number];
  const sqrtPrice = slot0[0];
  const indexQueries = owners.flatMap((o, i) => {
    const c = counts[i];
    const n = c?.status === "success" ? Math.min(Number(c.result), MAX_POSITIONS_PER_OWNER) : 0;
    return Array.from({ length: n }, (_, j) => ({ owner: o, j }));
  });
  const ids = await client.multicall({
    allowFailure: true,
    contracts: indexQueries.map(({ owner, j }) => ({
      address: manager,
      abi: npmAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [getAddress(owner), BigInt(j)] as const,
    })),
  });
  const positions = new Map<string, { owner: string; unlockAt?: number | null; locker?: string }>();
  indexQueries.forEach(({ owner }, i) => {
    const r = ids[i];
    if (r?.status === "success") positions.set(String(r.result), { owner });
  });
  lockLists.forEach((list, i) => {
    for (const lock of list ?? []) {
      if (lock.positionManager.toLowerCase() !== manager.toLowerCase()) continue;
      positions.set(String(lock.nftId), {
        owner: v3Lockers[i]!.address.toLowerCase(),
        unlockAt: lock.unlockAt,
        locker: v3Lockers[i]!.address.toLowerCase(),
      });
    }
  });
  const idList = [...positions.keys()];
  const details = await client.multicall({
    allowFailure: true,
    contracts: idList.flatMap((id) => [
      { address: manager, abi: npmAbi, functionName: "positions" as const, args: [BigInt(id)] as const },
      { address: manager, abi: npmAbi, functionName: "ownerOf" as const, args: [BigInt(id)] as const },
    ]),
  });
  const tokenIs0 = token0.toLowerCase() === ctx.token.toLowerCase();
  const bal0 = tokenIs0 ? reading.tokenReserve : reading.quoteReserve;
  const bal1 = tokenIs0 ? reading.quoteReserve : reading.tokenReserve;
  const s = Number(sqrtPrice) / 2 ** 96;
  const total = Number(bal0) * s * s + Number(bal1);
  if (!(total > 0)) return { kind: "positions", found: 0, holders: [], sources: ["positions"] };
  const rows: { id: string; owner: string; share: number; unlockAt?: number | null; locker?: string }[] = [];
  idList.forEach((id, i) => {
    const p = details[i * 2];
    const o = details[i * 2 + 1];
    if (p?.status !== "success" || o?.status !== "success") return;
    const [, , t0, t1, f, lower, upper, liquidity] = p.result as readonly [
      bigint,
      string,
      string,
      string,
      number,
      number,
      number,
      bigint,
      ...unknown[],
    ];
    if (t0.toLowerCase() !== token0.toLowerCase() || t1.toLowerCase() !== token1.toLowerCase() || f !== fee) return;
    if (liquidity === 0n) return;
    const meta = positions.get(id)!;
    const owner = String(o.result).toLowerCase();
    // A locked position counts as locked only while the locker still holds the NFT.
    if (meta.locker && owner !== meta.locker) return;
    rows.push({ ...meta, id, owner, share: Math.min(1, positionValue(liquidity, lower, upper, sqrtPrice) / total) });
  });
  const classes = await classify(client, ctx, [...new Set(rows.map((r) => r.owner))], poolSet);
  const holders = rows.map((r) => {
    const h = holderFrom(r.owner, classes.get(r.owner), r.share);
    h.position = r.id;
    if (r.locker) {
      h.lockRead = "read";
      h.locks = [{ share: r.share, unlockAt: r.unlockAt ?? null, vesting: false }];
    }
    return h;
  });
  const v3LocksRead = lockLists.every((l) => l !== null);
  return {
    kind: "positions",
    found: Math.min(
      1,
      holders.reduce((sum, h) => sum + h.share, 0),
    ),
    holders: holders.sort((a, b) => b.share - a.share),
    sources: [
      "known",
      ...(ctx.leads.length ? (["goplus"] as const) : []),
      ...(v3LocksRead ? (["lock-contracts"] as const) : []),
      "positions",
    ],
  };
}

/** Holders of every pool, keyed by pool address (lowercase). A pool whose holders couldn't be read maps to null. */
export async function readPoolHolders(
  client: PublicClient,
  ctx: HolderContext,
  readings: PoolReading[],
): Promise<Map<string, PoolHolders | null>> {
  const poolSet = new Set(readings.map((r) => r.pool.address.toLowerCase()));
  // Each v2 exchange's protocol-fee collector earns LP tokens in every pool: read who it is, to name it.
  const factories = [
    ...new Map(
      readings
        .filter((r) => r.pool.dex.protocol === "uniswap-v2")
        .map((r) => [r.pool.dex.factory.toLowerCase(), r.pool.dex.name]),
    ),
  ];
  const feeTo = await client
    .multicall({
      allowFailure: true,
      contracts: factories.map(([f]) => ({ address: getAddress(f), abi: feeToAbi, functionName: "feeTo" as const })),
    })
    .catch(() => []);
  ctx = { ...ctx, feeCollectors: new Map() };
  factories.forEach(([, name], i) => {
    const r = feeTo[i];
    if (r?.status === "success" && !/^0x0{40}$/i.test(r.result)) ctx.feeCollectors!.set(r.result.toLowerCase(), name);
  });
  const v2 = readings.filter((r) => r.pool.dex.protocol === "uniswap-v2" && r.lpSupply && r.lpSupply > 0n);
  const v3 = readings.filter((r) => r.pool.dex.protocol === "uniswap-v3" && r.quoteReserve + r.tokenReserve > 0n);
  const [v2Map, v3List] = await Promise.all([
    v2Holders(client, ctx, v2, poolSet).catch(() => new Map<string, PoolHolders>()),
    Promise.all(v3.map((r) => v3Holders(client, ctx, r, poolSet).catch(() => null))),
  ]);
  const out = new Map<string, PoolHolders | null>();
  for (const r of readings) out.set(r.pool.address.toLowerCase(), v2Map.get(r.pool.address.toLowerCase()) ?? null);
  v3.forEach((r, i) => out.set(r.pool.address.toLowerCase(), v3List[i] ?? null));
  return out;
}
