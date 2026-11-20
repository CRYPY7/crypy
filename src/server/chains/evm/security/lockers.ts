import "server-only";
import { type PublicClient, getAddress, parseAbi } from "viem";
import type { ChainKey } from "@/config/chains";

/**
 * Liquidity lock contracts, vault factories and farms CRYPY recognises, and how to read each lock's terms.
 *
 * A contract is added here only after its read methods were checked on-chain (tests/unit/liquidity-live.test.ts).
 * Anything else that holds liquidity is shown as an unidentified contract: a contract that only *calls itself* a
 * lock is never trusted.
 *
 * Lock terms are read from the lock contract itself:
 *   - uncx-v2, pinklock-v1, pinklock-v2, deeplock: the contract lists the locks of an LP token;
 *   - team-finance, uncx-v3: no per-token list on-chain, so CRYPY keeps an index of all their locks in memory, built
 *     once from the contract and topped up with new locks on each check (locker-index.ts).
 */
export type LockerKind = "uncx-v2" | "pinklock-v1" | "pinklock-v2" | "team-finance" | "uncx-v3" | "deeplock";

export interface LockerDeployment {
  address: string;
  name: string;
  kind: LockerKind;
  /**
   * The locker sits behind an upgradeable proxy: its operator can replace its code, so a lock is only as safe as that
   * operator. Checked against the proxy slots by the live test. (In May 2026 an old, admin-controlled DxSale locker
   * on BNB Chain had its locks reset and was drained; it is not in this list.)
   */
  upgradeable: boolean;
}

export const lockers: Record<ChainKey, LockerDeployment[]> = {
  ethereum: [
    {
      address: "0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214",
      name: "UNCX (Uniswap v2 locker)",
      upgradeable: false,
      kind: "uncx-v2",
    },
    {
      address: "0xED9180976c2a4742C7A57354FD39d8BEc6cbd8AB",
      name: "UNCX (SushiSwap locker)",
      upgradeable: false,
      kind: "uncx-v2",
    },
    {
      address: "0x71B5759d73262FBb223956913ecF4ecC51057641",
      name: "PinkLock v2",
      upgradeable: false,
      kind: "pinklock-v2",
    },
    {
      address: "0xE2fE530C047f2d85298b07D9333C05737f1435fB",
      name: "Team Finance",
      upgradeable: true,
      kind: "team-finance",
    },
    {
      address: "0xFD235968e65B0990584585763f837A5b5330e6DE",
      name: "UNCX (v3 locker)",
      upgradeable: false,
      kind: "uncx-v3",
    },
  ],
  bsc: [
    {
      address: "0xC765bddB93b0D1c1A88282BA0fa6B2d00E3e0c83",
      name: "UNCX (PancakeSwap locker)",
      upgradeable: false,
      kind: "uncx-v2",
    },
    {
      address: "0x407993575c91ce7643a4d4cCACc9A98c36eE1BBE",
      name: "PinkLock v2",
      upgradeable: false,
      kind: "pinklock-v2",
    },
    {
      address: "0x7ee058420e5937496F5a2096f04caA7721cF70cc",
      name: "PinkLock v1",
      upgradeable: true,
      kind: "pinklock-v1",
    },
    {
      address: "0x0C89C0407775dd89b12918B9c0aa42Bf96518820",
      name: "Team Finance",
      upgradeable: true,
      kind: "team-finance",
    },
    {
      address: "0xfe88DAB083964C56429baa01F37eC2265AbF1557",
      name: "UNCX (v3 locker)",
      upgradeable: false,
      kind: "uncx-v3",
    },
    { address: "0x3f4d6bf08cb7a003488ef082102c2e6418a4551e", name: "DeepLock", upgradeable: false, kind: "deeplock" },
  ],
};

/**
 * One-lock vaults: each lock is its own contract, made by a factory. A vault is trusted only when the factory
 * confirms it made it (vaultStatus ≠ 0), then its end date is read from the vault.
 */
export const vaultFactories: Record<ChainKey, { factory: string; name: string }[]> = {
  ethereum: [],
  bsc: [{ factory: "0x8b0185533313FCb4Cb94e4C4D000b5C7b4DEF9b8", name: "OnlyMoons vault" }],
};

/** Staking contracts: liquidity staked here belongs to many people, not one holder. */
export const farms: Record<ChainKey, { address: string; name: string }[]> = {
  ethereum: [
    { address: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd", name: "SushiSwap farm (MasterChef)" },
    { address: "0xe34139463bA50bD61336E0c446Bd8C0867c6fE65", name: "Uniswap v3 Staker" },
  ],
  bsc: [
    { address: "0x73feaa1eE314F8c655E354234017bE2193C9E24E", name: "PancakeSwap farm (MasterChef v1)" },
    { address: "0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652", name: "PancakeSwap farm (MasterChef v2)" },
    { address: "0x556B9306565093C855AEA9AE92A594704c2Cd59e", name: "PancakeSwap farm (MasterChef v3)" },
  ],
};

export const lockerAt = (chain: ChainKey, address: string) =>
  lockers[chain].find((l) => l.address.toLowerCase() === address.toLowerCase()) ?? null;
export const farmAt = (chain: ChainKey, address: string) =>
  farms[chain].find((f) => f.address.toLowerCase() === address.toLowerCase()) ?? null;

/** UNCX v3 marks a lock without end with this unlock date (type(uint256).max). */
const ETERNAL = 2n ** 256n - 1n;
/** Dates past year 9999 are shown as "no end date". */
const MAX_DATE = 253_402_300_799n;
export const toUnlock = (raw: bigint): number | null => (raw >= MAX_DATE || raw === ETERNAL ? null : Number(raw));

export interface RawLock {
  /** LP token amount (raw). */
  amount: bigint;
  unlockAt: number | null;
  vesting: boolean;
}

const MAX_LOCKS = 50;
const uncxV2Abi = parseAbi([
  "function getNumLocksForToken(address) view returns (uint256)",
  "function tokenLocks(address, uint256) view returns (uint256, uint256, uint256, uint256, uint256, address)",
]);
const pinkAbi = parseAbi([
  "function totalLockCountForToken(address) view returns (uint256)",
  "function getLocksForToken(address, uint256, uint256) view returns ((uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 tgeDate, uint256 tgeBps, uint256 cycle, uint256 cycleBps, uint256 unlockedAmount, string description)[])",
]);
const deepLockAbi = parseAbi([
  "function getDepositsByTokenAddress(address) view returns (uint256[])",
  "function lockedToken(uint256) view returns (address, address, uint256, uint256, bool)",
]);
const pinkV1Abi = parseAbi([
  "function totalLockCountForToken(address) view returns (uint256)",
  "function getLocksForToken(address, uint256, uint256) view returns ((uint256 id, address token, address owner, uint256 amount, uint256 lockDate, uint256 unlockDate)[])",
]);

/**
 * Locks of one LP token inside registry lockers that hold some of it (uncx-v2, pinklock-v1/v2). Team Finance goes
 * through locker-index.ts. Returns null for a locker whose locks couldn't be read.
 */
export async function readTokenLocks(
  client: PublicClient,
  lpToken: string,
  held: LockerDeployment[],
): Promise<Map<string, RawLock[] | null>> {
  const out = new Map<string, RawLock[] | null>();
  const lp = getAddress(lpToken);
  await Promise.all(
    held
      .filter((l) => l.kind === "deeplock")
      .map(async (l) => {
        try {
          const ids = await client.readContract({
            address: getAddress(l.address),
            abi: deepLockAbi,
            functionName: "getDepositsByTokenAddress",
            args: [lp],
          });
          if (ids.length > MAX_LOCKS) return out.set(l.address.toLowerCase(), null);
          const rows = await client.multicall({
            allowFailure: false,
            contracts: ids.map((id) => ({
              address: getAddress(l.address),
              abi: deepLockAbi,
              functionName: "lockedToken" as const,
              args: [id] as const,
            })),
          });
          // (token, withdrawal address, amount, unlock time, withdrawn)
          out.set(
            l.address.toLowerCase(),
            rows
              .filter((r) => !r[4] && r[0].toLowerCase() === lpToken.toLowerCase())
              .map((r) => ({ amount: r[2], unlockAt: toUnlock(r[3]), vesting: false })),
          );
        } catch {
          out.set(l.address.toLowerCase(), null);
        }
      }),
  );
  const list = held.filter((l) => l.kind === "uncx-v2" || l.kind === "pinklock-v1" || l.kind === "pinklock-v2");
  if (list.length === 0) return out;
  const counts = await client.multicall({
    allowFailure: true,
    contracts: list.map((l) =>
      l.kind === "uncx-v2"
        ? { address: getAddress(l.address), abi: uncxV2Abi, functionName: "getNumLocksForToken" as const, args: [lp] }
        : { address: getAddress(l.address), abi: pinkAbi, functionName: "totalLockCountForToken" as const, args: [lp] },
    ),
  });
  await Promise.all(
    list.map(async (l, i) => {
      const c = counts[i];
      if (c?.status !== "success") return out.set(l.address.toLowerCase(), null);
      const n = Number(c.result as bigint);
      if (n === 0) return out.set(l.address.toLowerCase(), []);
      if (n > MAX_LOCKS) return out.set(l.address.toLowerCase(), null);
      try {
        if (l.kind === "uncx-v2") {
          const rows = await client.multicall({
            allowFailure: false,
            contracts: Array.from({ length: n }, (_, j) => ({
              address: getAddress(l.address),
              abi: uncxV2Abi,
              functionName: "tokenLocks" as const,
              args: [lp, BigInt(j)] as const,
            })),
          });
          // (lockDate, amount, initialAmount, unlockDate, lockID, owner)
          out.set(
            l.address.toLowerCase(),
            rows.map((r) => ({ amount: r[1], unlockAt: toUnlock(r[3]), vesting: false })),
          );
        } else if (l.kind === "pinklock-v2") {
          const rows = await client.readContract({
            address: getAddress(l.address),
            abi: pinkAbi,
            functionName: "getLocksForToken",
            args: [lp, 0n, BigInt(n - 1)],
          });
          out.set(
            l.address.toLowerCase(),
            rows.map((r) => ({
              amount: r.amount > r.unlockedAmount ? r.amount - r.unlockedAmount : 0n,
              unlockAt: toUnlock(r.tgeDate),
              vesting: r.cycle > 0n && r.tgeBps < 10_000n,
            })),
          );
        } else {
          const rows = await client.readContract({
            address: getAddress(l.address),
            abi: pinkV1Abi,
            functionName: "getLocksForToken",
            args: [lp, 0n, BigInt(n - 1)],
          });
          out.set(
            l.address.toLowerCase(),
            rows.map((r) => ({ amount: r.amount, unlockAt: toUnlock(r.unlockDate), vesting: false })),
          );
        }
      } catch {
        out.set(l.address.toLowerCase(), null);
      }
    }),
  );
  return out;
}
