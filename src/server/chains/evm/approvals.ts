import "server-only";
import { type PublicClient, erc20Abi, getAddress, pad, parseAbi } from "viem";
import type { ChainConfig } from "@/config/chains";
import { PERMIT2_CONTRACTS, knownContract, knownSpenders } from "@/config/known-contracts";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import { isUnlimited } from "@/lib/approvals/evaluate";
import type { ApprovalFact, ApprovalsFacts, SpenderFacts } from "@/lib/approvals/types";
import { type GoPlusApprovalLead, goPlusApprovals, sourcifyVerified } from "@/server/security/external";
import type { GoPlusPriority } from "@/server/security/goplus-budget";
import { accountTypes } from "./batch";
import { getOnchainPrices } from "./prices";
import { evmTokenDetails } from "./token-details";
import type { TokenDetails } from "@/server/tokens/registry";
import { pricesFor } from "@/server/tokens/prices";
import { getEvmClient } from "./providers";
import { dexDeployments } from "./security/dex-registry";

/**
 * A wallet's approvals on one EVM chain.
 *
 * Finding them. A complete list needs every Approval event the wallet ever emitted; free nodes only search a few
 * hours of history (Alchemy's free plan: 10 blocks), and Etherscan's free plan isn't licensed for a commercial site.
 * So CRYPY combines, at zero cost:
 *   - GoPlus's approval lists for the wallet (tokens and NFT collections), used only as places to look;
 *   - every token the wallet holds × the contracts people commonly approve (routers, aggregators, Permit2);
 *   - apps' allowances inside Permit2 for tokens approved to Permit2;
 *   - the wallet's Approval events of the last few hours for the tokens it holds (free nodes only search events by
 *     contract address, so events for other contracts come from GoPlus).
 * Then every allowance is read again on-chain at one block, and only non-zero ones are kept. The page says the list
 * may be incomplete.
 */
const APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
/** Recent-events window: about 2.5 hours on BNB Chain, 7 hours on Ethereum (free-node limits). */
const RECENT_BLOCKS: Record<string, bigint> = {
  bsc: 20_000n,
  ethereum: 2_000n,
  // A few hours: Base and Polygon make a block every ~2 s; Arbitrum every ~0.25 s (kept smaller: public nodes
  // there are slow to search long ranges).
  base: 10_000n,
  polygon: 10_000n,
  arbitrum: 40_000n,
};
const MAX_HELD = 60;
const MAX_PAIRS = 1_500;
const MAX_SOURCE_CHECKS = 8;
const OPTIONAL_MS = 7_000;
/** GoPlus needs 3–6 s for busy wallets; it has its own 15 s limit per request. */
const GOPLUS_MS = 16_000;
const GOPLUS_PORTFOLIO_MS = 40_000;
/** Recent Approval events: 0.1–2.5 s on most public nodes; some BNB Chain nodes take 5 s or more for big wallets. */
const RECENT_MS = 4_000;

const nftAbi = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);
const permit2Abi = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

interface Candidate {
  kind: "token" | "nft-all";
  token: string;
  spender: string;
  foundBy: Set<ApprovalFact["foundBy"][number]>;
  lead?: GoPlusApprovalLead;
  logAt?: { block: bigint; tx: string | null };
}

export async function getEvmApprovals(
  chain: ChainConfig,
  owner: string,
  heldTokensInput: string[] | Promise<string[]>,
  priority: GoPlusPriority = "page",
): Promise<ApprovalsFacts> {
  const client = getEvmClient(chain);
  const wallet = getAddress(owner);
  const chainId = Number(chain.caip2.split(":")[1]);
  // Outside lists don't need the block or the held tokens: start them first (they are the slowest part).
  // Portfolio calls may wait their turn in GoPlus's line first (goplus-budget.ts), so they get longer.
  const goplusMs = priority === "portfolio" ? GOPLUS_PORTFOLIO_MS : GOPLUS_MS;
  // R4: how long each step took (diagnostics; the speed script prints the slowest).
  const started = Date.now();
  const steps: Record<string, number> = {};
  const timed = <T>(name: string, p: Promise<T>): Promise<T> =>
    p.finally(() => {
      steps[name] = Date.now() - started;
    });
  const goplusRequest = timed(
    "goplus",
    withTimeout(goPlusApprovals(chainId, wallet, priority), goplusMs, { status: "unavailable" as const }),
  );
  const [block, heldTokens] = await Promise.all([
    client.getBlockNumber(),
    timed(
      "held",
      Promise.resolve(heldTokensInput).catch(() => [] as string[]),
    ),
  ]);
  const key = (kind: string, token: string, spender: string) =>
    `${kind}|${token.toLowerCase()}|${spender.toLowerCase()}`;
  const candidates = new Map<string, Candidate>();
  const add = (c: Omit<Candidate, "foundBy">, by: ApprovalFact["foundBy"][number]) => {
    const k = key(c.kind, c.token, c.spender);
    const existing = candidates.get(k);
    if (existing) {
      existing.foundBy.add(by);
      existing.lead ??= c.lead;
      existing.logAt ??= c.logAt;
    } else
      candidates.set(k, {
        ...c,
        token: c.token.toLowerCase(),
        spender: c.spender.toLowerCase(),
        foundBy: new Set([by]),
      });
  };

  // 1. Leads: GoPlus and recent events, side by side.
  const [goplus, recent] = await Promise.all([
    goplusRequest,
    // A supplementary source: a slow node must not hold the page up (the page then says events weren't searched).
    timed(
      "recent",
      withTimeout(recentApprovals(client, chain.key, wallet, block, heldTokens.slice(0, MAX_HELD)), RECENT_MS, {
        read: false,
        items: [],
      }),
    ),
  ]);
  if (goplus.status !== "unavailable") for (const lead of goplus.leads) add({ ...lead, lead }, "goplus");
  for (const r of recent.items) add(r, "recent-logs");

  // 2. Held tokens × common spenders (routers, aggregators, Permit2).
  const spenders = [
    ...new Set([
      ...knownSpenders(chain.key),
      ...(dexDeployments[chain.key as keyof typeof dexDeployments] ?? []).flatMap((d) =>
        d.router ? [d.router.toLowerCase()] : [],
      ),
    ]),
  ];
  const held = [...new Set(heldTokens.map((t) => t.toLowerCase()))].slice(0, MAX_HELD);
  for (const token of held)
    for (const spender of spenders) {
      if (candidates.size >= MAX_PAIRS) break;
      add({ kind: "token", token, spender }, "known-spenders");
    }

  // 3. Read every candidate on-chain at one block.
  const list = [...candidates.values()];
  const tokens = [...new Set(list.map((c) => c.token))];
  const [reads, meta, balances, blockHeader] = await timed(
    "reads",
    Promise.all([
      client.multicall({
        allowFailure: true,
        blockNumber: block,
        contracts: list.map((c) =>
          c.kind === "token"
            ? {
                address: getAddress(c.token),
                abi: erc20Abi,
                functionName: "allowance" as const,
                args: [wallet, getAddress(c.spender)] as const,
              }
            : {
                address: getAddress(c.token),
                abi: nftAbi,
                functionName: "isApprovedForAll" as const,
                args: [wallet, getAddress(c.spender)] as const,
              },
        ),
      }),
      // R4: names and decimals from the shared token registry (read from the chain only for tokens it doesn't know).
      evmTokenDetails(client, chain.key, tokens).catch(() => new Map<string, TokenDetails | null>()),
      client.multicall({
        allowFailure: true,
        blockNumber: block,
        contracts: tokens.map((t) => ({
          address: getAddress(t),
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [wallet] as const,
        })),
      }),
      client.getBlock({ blockNumber: block }),
    ]),
  );
  const tokenInfo = new Map<
    string,
    { symbol: string; name: string; decimals: number | null; balance: string | null }
  >();
  tokens.forEach((t, i) => {
    const details = meta.get(t.toLowerCase()) ?? null;
    const bal = balances[i];
    tokenInfo.set(t, {
      symbol: sanitizeTokenText(details?.symbol ?? "", 24) || "?",
      name: sanitizeTokenText(details?.name ?? "", 64),
      decimals: details ? details.decimals : null,
      balance: bal?.status === "success" ? String(bal.result) : null,
    });
  });
  // Prices for "at risk now" only need the token list: read them while the steps below run.
  // R4: stored prices first (refreshed every 3 minutes by the price job); only tokens without one are priced live.
  const pricesRequest = timed(
    "prices",
    withTimeout(
      pricesFor(
        chain.key,
        tokens.flatMap((t) => {
          const decimals = tokenInfo.get(t)?.decimals;
          return decimals === null || decimals === undefined ? [] : [{ address: t, decimals }];
        }),
        async (missing) => (await getOnchainPrices(client, chain, missing)).tokens,
      ),
      OPTIONAL_MS,
      null,
    ),
  );
  const live = list.flatMap((c, i): { c: Candidate; allowance: bigint | null }[] => {
    const r = reads[i];
    if (r?.status !== "success") return [];
    if (c.kind === "token") {
      const value = r.result as bigint;
      return value > 0n ? [{ c, allowance: value }] : [];
    }
    return r.result === true ? [{ c, allowance: null }] : [];
  });

  // 4. Apps' allowances inside Permit2, for tokens approved to Permit2.
  const isPermit2 = (a: string) => (PERMIT2_CONTRACTS as readonly string[]).includes(a);
  const viaPermit2 = live
    .filter((x) => x.c.kind === "token" && isPermit2(x.c.spender))
    .map((x) => ({ token: x.c.token, permit2: x.c.spender }));
  const permitSpenders = spenders.filter((s) => !isPermit2(s));
  const permitPairs = viaPermit2.flatMap(({ token, permit2 }) =>
    permitSpenders.map((spender) => ({ token, spender, permit2 })),
  );
  const permitReads = permitPairs.length
    ? await timed(
        "permit2",
        client.multicall({
          allowFailure: true,
          blockNumber: block,
          contracts: permitPairs.map((p) => ({
            address: getAddress(p.permit2),
            abi: permit2Abi,
            functionName: "allowance" as const,
            args: [wallet, getAddress(p.token), getAddress(p.spender)] as const,
          })),
        }),
      )
    : [];
  const blockTime = Number(blockHeader.timestamp);
  const permitLive = permitPairs.flatMap((p, i) => {
    const r = permitReads[i];
    if (r?.status !== "success") return [];
    const [amount, expiration] = r.result as readonly [bigint, number, number];
    return amount > 0n && expiration > blockTime ? [{ ...p, amount, expiration }] : [];
  });

  // 5. Who the spenders are.
  const spenderList = [...new Set([...live.map((x) => x.c.spender), ...permitLive.map((p) => p.spender)])];
  const types = spenderList.length
    ? await timed(
        "spenders",
        accountTypes(
          client,
          spenderList.map((s) => getAddress(s)),
          block,
        ),
      )
    : [];
  const unknownContracts = spenderList.filter((s, i) => types[i] === "contract" && !knownContract(chain.key, s));
  const verified = new Map<string, boolean | null>();
  await timed(
    "sourcify",
    Promise.all(
      unknownContracts.slice(0, MAX_SOURCE_CHECKS).map(async (s) => {
        const r = await withTimeout(sourcifyVerified(chainId, getAddress(s)), OPTIONAL_MS, null);
        verified.set(
          s,
          r ? (r.source.status === "verified" ? true : r.source.status === "not-found" ? false : null) : null,
        );
      }),
    ),
  );
  const leadFlags = new Map<string, GoPlusApprovalLead["flags"]>();
  const createdAt = new Map<string, number>();
  const goplusNames = new Map<string, string>();
  if (goplus.status !== "unavailable")
    for (const l of goplus.leads) {
      if (!leadFlags.has(l.spender)) leadFlags.set(l.spender, l.flags);
      if (l.spenderCreatedAt && !createdAt.has(l.spender)) createdAt.set(l.spender, l.spenderCreatedAt);
      if (l.spenderName && !goplusNames.has(l.spender)) goplusNames.set(l.spender, l.spenderName);
    }
  const spenderFacts = (s: string): SpenderFacts => {
    const i = spenderList.indexOf(s);
    const known = knownContract(chain.key, s);
    return {
      address: getAddress(s),
      type: types[i] ?? null,
      name: known?.name ?? null,
      sourceVerified: known ? true : (verified.get(s) ?? null),
      goplus: leadFlags.get(s) ?? null,
      createdAt: types[i] === "contract" ? (createdAt.get(s) ?? null) : null,
      goplusName: goplusNames.get(s) ?? null,
    };
  };

  // 6. Prices for "at risk now".
  const prices = await pricesRequest;
  const priceOf = (t: string) => prices?.get(t.toLowerCase())?.usd ?? null;
  const atRisk = (token: string, allowance: bigint) => {
    const info = tokenInfo.get(token);
    const price = priceOf(token);
    if (!info || info.balance === null || info.decimals === null || price === null) return null;
    const bal = BigInt(info.balance);
    const amount = allowance < bal ? allowance : bal;
    return (Number(amount) / 10 ** info.decimals) * price;
  };
  const lastChange = (c: Candidate) =>
    c.lead ? { at: c.lead.at, tx: c.lead.tx } : c.logAt ? { at: null, tx: c.logAt.tx } : null;

  const approvals: ApprovalFact[] = [
    ...live.map(({ c, allowance }): ApprovalFact => {
      const info = tokenInfo.get(c.token)!;
      return {
        kind: c.kind,
        token: { address: getAddress(c.token), symbol: info.symbol, name: info.name, decimals: info.decimals },
        spender: spenderFacts(c.spender),
        allowance: allowance === null ? null : allowance.toString(),
        unlimited: allowance === null ? true : isUnlimited(allowance, "token"),
        expiresAt: null,
        permit2: null,
        balance: info.balance,
        priceUsd: c.kind === "token" ? priceOf(c.token) : null,
        atRiskUsd: c.kind === "token" && allowance !== null ? atRisk(c.token, allowance) : null,
        lastChange: lastChange(c),
        foundBy: [...c.foundBy],
      };
    }),
    ...permitLive.map((p): ApprovalFact => {
      const info = tokenInfo.get(p.token)!;
      return {
        kind: "permit2",
        token: { address: getAddress(p.token), symbol: info.symbol, name: info.name, decimals: info.decimals },
        spender: spenderFacts(p.spender),
        allowance: p.amount.toString(),
        unlimited: isUnlimited(p.amount, "permit2"),
        expiresAt: p.expiration,
        permit2: getAddress(p.permit2),
        balance: info.balance,
        priceUsd: priceOf(p.token),
        atRiskUsd: atRisk(p.token, p.amount),
        lastChange: null,
        foundBy: ["permit2"],
      };
    }),
  ];

  return {
    chain: chain.key,
    owner: wallet,
    block: block.toString(),
    checkedAt: Date.now(),
    approvals,
    sources: { goplus: goplus.status, recentLogs: recent.read, knownSpenders: held.length > 0 },
    steps: { ...steps, total: Date.now() - started },
  };
}

/**
 * The wallet's Approval events of the last few hours for the given token contracts. Free nodes refuse event searches
 * without a contract address, so the search names the contracts (in groups of 20).
 */
async function recentApprovals(
  client: PublicClient,
  chainKey: string,
  owner: `0x${string}`,
  block: bigint,
  tokens: string[],
): Promise<{ read: boolean; items: Omit<Candidate, "foundBy">[] }> {
  if (tokens.length === 0) return { read: false, items: [] };
  const window = RECENT_BLOCKS[chainKey] ?? 2_000n;
  const groups: string[][] = [];
  for (let i = 0; i < tokens.length; i += 20) groups.push(tokens.slice(i, i + 20));
  const results = await Promise.all(
    groups.map((group) =>
      client
        .request({
          method: "eth_getLogs",
          params: [
            {
              address: group.map((t) => getAddress(t)),
              fromBlock: `0x${(block > window ? block - window : 0n).toString(16)}`,
              toBlock: `0x${block.toString(16)}`,
              topics: [APPROVAL, pad(owner)],
            },
          ],
        })
        .then((logs) => logs as { address: string; topics: string[]; transactionHash: string; blockNumber: string }[])
        .catch(() => null),
    ),
  );
  const items = results
    .flatMap((logs) => logs ?? [])
    .filter((l) => l.topics.length === 3)
    .slice(-200)
    .map((l) => ({
      kind: "token" as const,
      token: l.address,
      spender: `0x${l.topics[2]!.slice(26)}`,
      logAt: { block: BigInt(l.blockNumber), tx: l.transactionHash },
    }));
  return { read: results.some((r) => r !== null), items };
}
