import "server-only";
import type { GoPlusPriority } from "@/server/security/goplus-budget";
import { type Hex, erc20Abi, getAddress, parseAbi } from "viem";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type { OwnerFacts, PoolFact, ProxyFacts, TokenSecurityFacts } from "@/lib/security/types";
import { type GoPlusResult, goPlusToken, sourcifyVerified } from "@/server/security/external";
import { getOnchainPrices } from "../prices";
import { getEvmClient } from "../providers";
import { HAS_ROLE_SELECTOR, PROXY_SLOTS, minimalProxyTarget, powersIn, selectorsIn } from "./bytecode";
import { readPoolHolders } from "./lp-holders";
import { findPools, poolUsd, readPools, verifyLeadPools } from "./pools";
import { type TokenBasics, isTokenAnswer } from "./token-basics";
import { recheckToken } from "./token-recheck";
import { runTradeTest } from "./trade";

/**
 * Token security facts for an EVM chain. Three rounds of node requests plus two cached outside sources, all in
 * parallel where possible:
 *   1. block, token code, name/symbol/decimals/supply, owner, proxy slots, pool discovery, native price;
 *   2. implementation and owner code, extra pools from GoPlus leads (verified on-chain), pool reserves;
 *   3. the trade simulation on the deepest supported pool, and who holds each pool's liquidity (lp-holders.ts).
 * Every optional part fails soft: the matching check becomes "not checked".
 */
const ownerAbi = parseAbi(["function owner() view returns (address)", "function getOwner() view returns (address)"]);
const beaconAbi = parseAbi(["function implementation() view returns (address)"]);
const DEAD = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
const OPTIONAL_MS = 6_000;
/** Liquidity holders: the first check on a server may wait for the Team Finance / UNCX v3 lock index (up to 8 s). */
const HOLDERS_MS = 14_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

function slotAddress(value: Hex | undefined | null): string | null {
  if (!value || /^0x0*$/.test(value)) return null;
  const address = `0x${value.slice(-40)}`;
  return /^0x0{40}$/.test(address) ? null : getAddress(address);
}

export async function getEvmTokenSecurity(
  chain: ChainConfig,
  address: string,
  /** "background" for the alerts checker, so token pages keep GoPlus first. */
  priority: GoPlusPriority = "page",
): Promise<TokenSecurityFacts | null> {
  const client = getEvmClient(chain);
  const token = getAddress(address.toLowerCase());
  const chainId = Number(chain.caip2.split(":")[1]);
  const goplusP: Promise<GoPlusResult> = withTimeout(goPlusToken(chainId, token, priority), OPTIONAL_MS, {
    status: "unavailable" as const,
  });
  const notRead = { source: { status: "unknown" as const, provider: "Sourcify" }, powers: null };
  const sourceP = withTimeout(sourcifyVerified(chainId, token), OPTIONAL_MS, notRead);

  // Round 1
  const [block, firstCode, firstMeta, owners, slots, found, prices] = await Promise.all([
    client.getBlockNumber(),
    client.getCode({ address: token }),
    client.multicall({
      allowFailure: true,
      contracts: (["name", "symbol", "decimals", "totalSupply"] as const).map((functionName) => ({
        address: token,
        abi: erc20Abi,
        functionName,
      })),
    }),
    client.multicall({
      allowFailure: true,
      contracts: [
        { address: token, abi: ownerAbi, functionName: "owner" as const },
        { address: token, abi: ownerAbi, functionName: "getOwner" as const },
      ],
    }),
    Promise.all(
      [
        PROXY_SLOTS.eip1967,
        PROXY_SLOTS.admin,
        PROXY_SLOTS.beacon,
        PROXY_SLOTS.eip1822,
        PROXY_SLOTS.zeppelinos,
        PROXY_SLOTS.zeppelinosAdmin,
      ].map((slot) => client.getStorageAt({ address: token, slot }).catch(() => null)),
    ),
    withTimeout(findPools(client, chain.key, token), OPTIONAL_MS, []),
    withTimeout(getOnchainPrices(client, chain, []), OPTIONAL_MS, null),
  ]);
  // A missing code or decimals/supply read may be one node's bad answer (B-010): ask other providers before
  // concluding "not a token".
  let basics: TokenBasics = {
    code: firstCode ?? null,
    meta: firstMeta,
  };
  if (!isTokenAnswer(basics)) {
    const second = await recheckToken(chain, token);
    if (!second) return null;
    basics = second;
  }
  const code = basics.code as Hex;
  const [name, symbol, decimals, supply] = basics.meta.map((r) => (r.status === "success" ? r.result : null));
  if (decimals === null || supply === null) return null;

  const ownerValue = owners.find((r) => r.status === "success")?.result as string | undefined;
  const owner = ownerValue ? getAddress(ownerValue) : null;
  const [impl1967, admin1967, beacon, impl1822, implZos, adminZos] = slots.map((v) => slotAddress(v));
  const admin = admin1967 ?? adminZos;
  const minimal = minimalProxyTarget(code);

  // Round 2
  const nativeUsd = prices?.native?.usd ?? null;
  const [beaconImpl, ownerCode, readings] = await Promise.all([
    beacon
      ? client
          .readContract({ address: getAddress(beacon), abi: beaconAbi, functionName: "implementation" })
          .catch(() => null)
      : null,
    owner && !DEAD.has(owner.toLowerCase()) ? client.getCode({ address: owner }).catch(() => null) : null,
    withTimeout(
      goplusP.then(async (g) => {
        // Pools GoPlus knows on exchanges the registry search didn't cover, verified on-chain first.
        const extra =
          g.status === "ok"
            ? await withTimeout(verifyLeadPools(client, chain.key, token, g.leads.pairs, found), OPTIONAL_MS, [])
            : [];
        return readPools(client, token, [...found, ...extra]);
      }),
      OPTIONAL_MS * 2,
      [],
    ),
  ]);
  const implementation =
    impl1967 ??
    impl1822 ??
    implZos ??
    (beaconImpl ? getAddress(beaconImpl) : null) ??
    (minimal ? getAddress(minimal) : null);
  const proxy: ProxyFacts = {
    kind: impl1967
      ? "eip1967"
      : impl1822
        ? "eip1822"
        : implZos
          ? "zeppelinos"
          : beacon
            ? "beacon"
            : minimal
              ? "minimal"
              : null,
    implementation,
    admin,
  };

  // Round 3: implementation code (for powers), the trade test and liquidity holders, side by side.
  const goplus = await goplusP;
  const liveOwner = owner && !DEAD.has(owner.toLowerCase()) ? owner : null;
  const [implCode, implSource, trade, holders] = await Promise.all([
    implementation ? client.getCode({ address: getAddress(implementation) }).catch(() => null) : null,
    implementation ? withTimeout(sourcifyVerified(chainId, getAddress(implementation)), OPTIONAL_MS, notRead) : null,
    withTimeout(
      runTradeTest(client, chain.key, token, readings, chain.nativeSymbol, nativeUsd, (a) =>
        stableSymbol(chain.key, a),
      ),
      12_000,
      {
        outcome: "error" as const,
        venue: null,
        amountIn: null,
        nativeSymbol: chain.nativeSymbol,
        buyTax: null,
        sellTax: null,
        transferTax: null,
        reason: null,
      },
    ),
    withTimeout(
      readPoolHolders(
        client,
        {
          chain: chain.key,
          token,
          owner: liveOwner,
          leads: goplus.status === "ok" ? goplus.leads.lpHolders : [],
          block,
          now: Math.floor(Date.now() / 1000),
        },
        readings,
      ),
      HOLDERS_MS,
      new Map(),
    ),
  ]);
  const codes = [code, ...(implCode && implCode !== "0x" ? [implCode] : [])];
  const roleBased = codes.some((c) => selectorsIn(c).has(HAS_ROLE_SELECTOR));
  const ownerFacts: OwnerFacts = {
    owner,
    renounced: owner !== null && DEAD.has(owner.toLowerCase()),
    ownerIsContract: ownerCode === null ? null : ownerCode !== undefined && ownerCode !== "0x",
    roleBased,
  };
  const pools: PoolFact[] = readings.map((r) => {
    const q = r.pool.quote;
    return {
      dex: r.pool.dex.name,
      protocol: r.pool.dex.protocol,
      address: r.pool.address,
      fee: r.pool.fee,
      listed: !r.pool.dex.unlisted,
      pairedWith: q.role === "wrapped-native" ? `W${chain.nativeSymbol}` : stableSymbol(chain.key, q.address),
      liquidityUsd: poolUsd(r, nativeUsd),
      holders: holders.get(r.pool.address.toLowerCase()) ?? null,
    };
  });

  const verified = await sourceP;
  const source = verified.source;
  // Powers: from the verified source of the contract that holds the logic (the implementation behind a proxy) when
  // there is one; otherwise from the compiled code. SELFDESTRUCT and the proxy's own upgrade functions always come
  // from the compiled code.
  const logicSource = implementation ? (implSource?.powers ?? null) : verified.powers;
  const codePowers = powersIn(codes);
  const powers = logicSource
    ? [
        ...logicSource,
        ...codePowers.filter(
          (p) =>
            p.power === "selfdestruct" || (p.power === "upgrade" && !logicSource.some((s) => s.power === "upgrade")),
        ),
      ]
    : codePowers.map((p) => ({ ...p, basis: "code" as const }));
  return {
    chain: chain.key,
    address: token,
    block: block.toString(),
    checkedAt: Date.now(),
    token: {
      name: sanitizeTokenText(name, 64),
      symbol: sanitizeTokenText(symbol, 24),
      decimals: Number(decimals),
      totalSupply: String(supply),
    },
    priceUsd: nativeUsd,
    trade,
    owner: ownerFacts,
    powers,
    proxy,
    pools,
    source,
    external: goplus.status === "ok" ? goplus.facts : null,
    externalStatus: goplus.status,
  };
}

const STABLES: Record<string, string> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  "0x55d398326f99059ff775485246999027b3197955": "USDT",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "USDC",
};
function stableSymbol(_chain: string, address: string): string {
  return STABLES[address.toLowerCase()] ?? "USD";
}
