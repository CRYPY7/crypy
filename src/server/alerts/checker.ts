import "server-only";
import { eq } from "drizzle-orm";
import { erc20Abi, parseAbi, type PublicClient } from "viem";
import { type ChainConfig, liveChains } from "@/config/chains";
import { PERMIT2_CONTRACTS, knownContract } from "@/config/known-contracts";
import messages from "../../../messages/en.json";
import {
  type AlertDraft,
  type ChainInfo,
  type ConfirmedApproval,
  type LiquiditySnapshot,
  type PricedMovement,
  type SecuritySnapshot,
  type ValuePoint,
  type WatchTarget,
  addValuePoint,
  approvalAlerts,
  liquidityChanges,
  securityChanges,
  tokenAlert,
  transferAlerts,
  valueDrop,
  valueDropAlert,
} from "@/lib/alerts/build";
import {
  type ApprovalEvent,
  type Movement,
  type RawLog,
  TOPICS,
  decodeApproval,
  decodeTransfer,
  topicFor,
} from "@/lib/alerts/events";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import { liquiditySummary } from "@/lib/security/liquidity";
import type { SecurityReport } from "@/lib/security/types";
import type { AddressRules, TokenRules } from "@/lib/watchlist/rules";
import { coinTransfersInRange } from "@/server/chains/evm/activity";
import { getOnchainPrices } from "@/server/chains/evm/prices";
import { evmTokenDetails } from "@/server/chains/evm/token-details";
import { getEvmClient, logsClient } from "@/server/chains/evm/providers";
import { getDb, type Db } from "@/server/db/client";
import { checkerCursors, users, watchItems } from "@/server/db/schema";
import { addressOverview } from "@/server/services/overview";
import { tokenSecurityReport } from "@/server/services/lookups";
import { enqueueAlerts } from "./store";

/**
 * The background checker (approved board 39: "Checked about every minute").
 *
 * Each round, per chain: the new blocks since last time (a few blocks behind the tip, so short reorganisations don't
 * produce false alerts), searched once for every watched wallet together:
 *   1. token transfers from a watched wallet, 2. token transfers to one, 3. new approvals by one,
 * plus one read of every watched wallet's coin balance (coins don't emit events). What is found is checked before it
 * alerts (prices, on-chain allowances, who sent the transaction); see lib/alerts/build.ts for the spam rules.
 *
 * Event searches go to the free providers that allow wide block ranges (not Alchemy: 10 blocks on its free plan). The
 * step size adapts: it halves when providers refuse, and grows again after successful rounds.
 *
 * Hourly, a few items per round: wallet values (big drop in a day) and token security and liquidity changes.
 */

/** Blocks behind the tip before the checker reads them (reorganisation margin). */
const CONFIRMATIONS: Record<string, bigint> = { ethereum: 2n, bsc: 3n, base: 5n, arbitrum: 10n, polygon: 16n };
/** Approximate block times, for how far back to look after the server was off. */
const BLOCK_MS: Record<string, number> = { ethereum: 12_000, bsc: 750, base: 2_000, arbitrum: 250, polygon: 2_000 };
/** After a pause, look back at most this far; older events are not alerted (they'd be stale). */
const MAX_LOOKBACK_MS = 15 * 60_000;
const ADDRESS_BATCH = 100;
/** dRPC's free plan allows 100 blocks per search (checked 2026-11-22); other free providers allow more. */
const MIN_STEP = 25n;
const MAX_STEP = 100n;
const HOURLY_MS = 60 * 60_000;
/** Heavy hourly checks per round (spreads them out so a round stays short). */
const HOURLY_PER_ROUND = 4;

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const multicallAbi = parseAbi(["function getEthBalance(address addr) view returns (uint256 balance)"]);
const nftAbi = parseAbi([
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function name() view returns (string)",
]);
const permit2Abi = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

interface ChainMemory {
  step: bigint;
  /** Last coin balance seen per watched wallet, and the block it was read at. */
  coin: Map<string, { balance: bigint; block: bigint }>;
}
const memoryKey = Symbol.for("crypy.alertChecker");
const memory = ((globalThis as typeof globalThis & { [memoryKey]?: Map<string, ChainMemory> })[memoryKey] ??=
  new Map());
function chainMemory(chain: string): ChainMemory {
  let m = memory.get(chain);
  if (!m) memory.set(chain, (m = { step: MAX_STEP, coin: new Map() }));
  return m;
}

/** Per chain: whether the last round could search it (shown on the page and logged when it changes). */
export interface ChainCheck {
  ok: boolean;
  at: number;
}
const statusKey = Symbol.for("crypy.alertCheckerStatus");
const status = ((globalThis as typeof globalThis & { [statusKey]?: Map<string, ChainCheck> })[statusKey] ??= new Map());

export function checkerStatus(): Record<string, ChainCheck> {
  return Object.fromEntries(status);
}

function noteStatus(chain: string, ok: boolean): void {
  const before = status.get(chain);
  status.set(chain, { ok, at: Date.now() });
  if (before?.ok !== ok)
    console.warn(
      ok
        ? `[crypy] alerts: ${chain} is being checked again`
        : `[crypy] alerts: ${chain} can't be checked right now: no provider accepts wallet-wide event searches. ` +
            `Add a free provider (dRPC, Ankr, Infura, Chainstack, NodeReal) to its *_RPC_URLS in .env.local.`,
    );
}

/** Test helper. */
export function resetCheckerMemory(): void {
  memory.clear();
}

const chainInfo = (chain: ChainConfig): ChainInfo => ({
  key: chain.key,
  name: chain.name,
  nativeSymbol: chain.nativeSymbol,
});

// ---- Who watches what --------------------------------------------------------------------------------------------

interface Watched {
  addresses: Map<string, WatchTarget[]>;
  tokens: {
    itemId: string;
    userId: string;
    label: string;
    chain: string;
    address: string;
    rules: TokenRules;
    state: ItemState;
    checkedAt: number;
  }[];
  addressItems: { target: WatchTarget; state: ItemState }[];
}

interface ItemState {
  values?: ValuePoint[];
  security?: SecuritySnapshot;
  liquidity?: LiquiditySnapshot;
  checkedAt?: number;
}

export async function loadWatched(db: Db): Promise<Watched> {
  const rows = await db
    .select({ item: watchItems })
    .from(watchItems)
    .innerJoin(users, eq(watchItems.userId, users.id))
    .where(eq(watchItems.muted, false));
  const watched: Watched = { addresses: new Map(), tokens: [], addressItems: [] };
  for (const { item } of rows) {
    const state = (item.state ?? {}) as ItemState;
    if (item.kind === "address") {
      const target: WatchTarget = {
        itemId: item.id,
        userId: item.userId,
        label: item.label,
        address: item.target.toLowerCase(),
        rules: item.rules as AddressRules,
      };
      watched.addresses.set(target.address, [...(watched.addresses.get(target.address) ?? []), target]);
      watched.addressItems.push({ target, state });
    } else if (item.kind === "token") {
      watched.tokens.push({
        itemId: item.id,
        userId: item.userId,
        label: item.label,
        chain: item.chain,
        address: item.target.toLowerCase(),
        rules: item.rules as TokenRules,
        state,
        checkedAt: state.checkedAt ?? 0,
      });
    }
  }
  return watched;
}

// ---- Token details -----------------------------------------------------------------------------------------------

/** Symbols and decimals from the shared token registry (R1): each token is read from the chain once. */
async function tokenInfo(
  client: PublicClient,
  chain: string,
  tokens: string[],
): Promise<Map<string, { symbol: string; decimals: number } | null>> {
  const details = await evmTokenDetails(client, chain, tokens).catch(() => null);
  const out = new Map<string, { symbol: string; decimals: number } | null>();
  for (const address of tokens) {
    const d = details?.get(address.toLowerCase());
    // A failed read (details null) is not "not a token": it stays unknown for this round.
    if (!details) continue;
    out.set(address, d && d.decimals <= 36 ? { symbol: d.symbol.slice(0, 16) || "?", decimals: d.decimals } : null);
  }
  return out;
}

// ---- Event search with an adapting step ------------------------------------------------------------------------

type Topic = string | string[] | null;

async function searchLogs(
  chain: ChainConfig,
  mem: ChainMemory,
  from: bigint,
  to: bigint,
  queries: Topic[][],
): Promise<{ logs: RawLog[]; reached: bigint }> {
  // Never Alchemy: its free plan allows 10 blocks per search, which would use up its daily budget in hours.
  const client = logsClient(chain);
  const logs: RawLog[] = [];
  let start = from;
  while (start <= to) {
    const step = mem.step;
    const end = start + step - 1n > to ? to : start + step - 1n;
    try {
      const results = await Promise.all(
        queries.map(
          (topics) =>
            client.request({
              method: "eth_getLogs",
              params: [{ fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}`, topics }],
            } as never) as Promise<RawLog[]>,
        ),
      );
      for (const list of results) if (Array.isArray(list)) logs.push(...list);
      start = end + 1n;
    } catch {
      // Smaller steps first; when even those fail, stop here and continue from this block next round.
      if (step <= MIN_STEP) return { logs, reached: start - 1n };
      mem.step = step / 2n < MIN_STEP ? MIN_STEP : step / 2n;
    }
  }
  if (mem.step < MAX_STEP) mem.step = mem.step * 2n > MAX_STEP ? MAX_STEP : mem.step * 2n;
  return { logs, reached: to };
}

// ---- One chain, one round ------------------------------------------------------------------------------------------

export async function scanChain(chain: ChainConfig, watched: Watched, db: Db): Promise<AlertDraft[]> {
  const addresses = [...watched.addresses.keys()];
  const client = getEvmClient(chain);
  const head = await client.getBlockNumber();
  const to = head - (CONFIRMATIONS[chain.key] ?? 5n);
  const [cursor] = await db.select().from(checkerCursors).where(eq(checkerCursors.chain, chain.key));
  const saveCursor = (block: bigint) =>
    db
      .insert(checkerCursors)
      .values({ chain: chain.key, lastBlock: block, updatedAt: new Date() })
      .onConflictDoUpdate({ target: checkerCursors.chain, set: { lastBlock: block, updatedAt: new Date() } });
  const mem = chainMemory(chain.key);

  if (!cursor || addresses.length === 0) {
    // First round (or nothing to watch): start from now; nothing older is alerted.
    if (addresses.length === 0) status.delete(chain.key);
    await saveCursor(to);
    if (addresses.length) await readCoinBalances(client, chain, addresses, to, mem);
    return [];
  }
  let from = cursor.lastBlock + 1n;
  if (from > to) return [];
  const maxSpan = BigInt(Math.ceil(MAX_LOOKBACK_MS / (BLOCK_MS[chain.key] ?? 2_000)));
  if (to - from + 1n > maxSpan) from = to - maxSpan + 1n;

  const approvers = addresses.filter((a) => watched.addresses.get(a)!.some((t) => t.rules.approvals.on));
  const queries: Topic[][] = [];
  for (let i = 0; i < addresses.length; i += ADDRESS_BATCH) {
    const batch = addresses.slice(i, i + ADDRESS_BATCH).map(topicFor);
    queries.push([TOPICS.transfer, batch], [TOPICS.transfer, null, batch]);
  }
  for (let i = 0; i < approvers.length; i += ADDRESS_BATCH)
    queries.push([
      [TOPICS.approval, TOPICS.approvalForAll, TOPICS.permit2Approval],
      approvers.slice(i, i + ADDRESS_BATCH).map(topicFor),
    ]);

  const { logs, reached } = await searchLogs(chain, mem, from, to, queries);
  noteStatus(chain.key, reached >= to);
  if (reached < from) return [];

  // Unique events (the same log can come back from two queries).
  const seen = new Set<string>();
  const unique = logs.filter((l) => {
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Number(BigInt(l.blockNumber ?? 0)) <= Number(reached);
  });
  const movements = unique.map(decodeTransfer).filter((m): m is Movement => m !== null);
  const approvals = unique
    .map(decodeApproval)
    .filter((a): a is ApprovalEvent => a !== null && a.kind !== "nft-one" && approvers.includes(a.owner));

  const drafts: AlertDraft[] = [];
  const info = chainInfo(chain);

  // Coins: balance changes since the last read, explained by Alchemy when available.
  const sentTokens = new Set(movements.filter((m) => watched.addresses.has(m.from)).map((m) => m.from));
  const coinMoves = await coinMovements(client, chain, addresses, mem, reached, sentTokens);

  // Prices and token details for everything found.
  const tokenAddrs = [
    ...new Set([
      ...movements.filter((m) => m.standard === "erc20").map((m) => m.token),
      ...approvals.map((a) => a.token),
    ]),
  ];
  const details = await tokenInfo(client, chain.key, tokenAddrs);
  const prices = await getOnchainPrices(
    client,
    chain,
    tokenAddrs.filter((t) => details.get(t)).map((t) => ({ address: t, decimals: details.get(t)!.decimals })),
  ).catch(() => null);
  const usdOf = (token: string | null, raw: bigint | null, decimals: number) => {
    if (raw === null) return null;
    const price = token === null ? prices?.native?.usd : prices?.tokens.get(token)?.usd;
    return price ? (Number(raw) / 10 ** decimals) * price : null;
  };

  // Who sent the transaction: needed for unpriced tokens, NFTs and collection-wide approvals.
  const needSender = new Set<string>();
  for (const m of movements) {
    const priced = m.standard === "erc20" && prices?.tokens.has(m.token);
    if (!priced && watched.addresses.has(m.from)) needSender.add(m.txHash);
  }
  for (const a of approvals) if (a.kind === "nft-all") needSender.add(a.txHash);
  const senders = new Map<string, string>();
  await Promise.all(
    [...needSender].slice(0, 50).map(async (hash) => {
      const tx = await client.getTransaction({ hash: hash as `0x${string}` }).catch(() => null);
      if (tx) senders.set(hash, tx.from.toLowerCase());
    }),
  );

  const priced: PricedMovement[] = [
    ...movements.map((m) => {
      const d = m.standard === "erc20" ? details.get(m.token) : null;
      return {
        txHash: m.txHash,
        standard: m.standard,
        from: m.from,
        to: m.to,
        amount: m.amount,
        decimals: d?.decimals ?? 0,
        symbol: d?.symbol ?? (m.standard === "nft" ? "NFT" : "?"),
        usd: m.standard === "erc20" && d ? usdOf(m.token, m.amount, d.decimals) : null,
        txFrom: senders.get(m.txHash) ?? null,
        tokenId: m.tokenId,
      } satisfies PricedMovement;
    }),
    ...coinMoves.map((c) => ({
      ...c,
      decimals: 18,
      symbol: chain.nativeSymbol,
      usd: usdOf(null, c.amount, 18),
      txFrom: null,
    })),
  ];
  if (process.env.CRYPY_DEBUG_ALERTS === "1")
    console.log(
      `[crypy] alerts ${chain.key} ${from}-${reached}: ${logs.length} logs, ${movements.length} transfers, ` +
        `${approvals.length} approvals, ${coinMoves.length} coin changes, ${prices?.tokens.size ?? 0} prices`,
    );
  drafts.push(...transferAlerts(info, priced, watched.addresses, (a) => knownContract(chain.key, a)?.name ?? null));
  drafts.push(
    ...approvalAlerts(
      info,
      await confirmApprovals(client, chain, approvals, details, prices, senders, reached),
      watched.addresses,
    ),
  );

  await saveCursor(reached);
  return drafts;
}

async function readCoinBalances(
  client: PublicClient,
  chain: ChainConfig,
  addresses: string[],
  block: bigint,
  mem: ChainMemory,
): Promise<Map<string, bigint> | null> {
  const results = await client
    .multicall({
      contracts: addresses.map((a) => ({
        address: MULTICALL3,
        abi: multicallAbi,
        functionName: "getEthBalance",
        args: [a as `0x${string}`],
      })),
      allowFailure: true,
      blockNumber: block,
    })
    .catch(() => null);
  if (!results) return null;
  const out = new Map<string, bigint>();
  addresses.forEach((a, i) => {
    const r = results[i];
    if (r?.status === "success") out.set(a, r.result as bigint);
  });
  for (const [a, balance] of out) if (!mem.coin.has(a)) mem.coin.set(a, { balance, block });
  return out;
}

async function coinMovements(
  client: PublicClient,
  chain: ChainConfig,
  addresses: string[],
  mem: ChainMemory,
  block: bigint,
  /** Wallets that sent tokens in this range: without Alchemy, their coin balance drop is mostly the network fee. */
  sentTokens: Set<string>,
): Promise<Omit<PricedMovement, "decimals" | "symbol" | "usd" | "txFrom">[]> {
  const before = new Map(mem.coin);
  const now = await readCoinBalances(client, chain, addresses, block, mem);
  if (!now) return [];
  const out: Omit<PricedMovement, "decimals" | "symbol" | "usd" | "txFrom">[] = [];
  for (const [address, balance] of now) {
    const prev = before.get(address);
    mem.coin.set(address, { balance, block });
    if (!prev || prev.balance === balance) continue;
    // Say what happened when Alchemy can (each coin transfer with its transaction); otherwise the balance change.
    const transfers = await coinTransfersInRange(chain, address, prev.block + 1n, block).catch(() => null);
    if (transfers) {
      for (const t of transfers)
        if (t.from === address || t.to === address)
          out.push({ txHash: t.hash, standard: "coin", from: t.from, to: t.to, amount: t.raw });
      continue;
    }
    const diff = balance - prev.balance;
    if (diff < 0n && sentTokens.has(address)) continue;
    out.push(
      diff < 0n
        ? {
            txHash: null,
            standard: "coin",
            from: address,
            to: "0x0000000000000000000000000000000000000000",
            amount: -diff,
          }
        : {
            txHash: null,
            standard: "coin",
            from: "0x0000000000000000000000000000000000000000",
            to: address,
            amount: diff,
          },
    );
  }
  return out;
}

/** Only approvals that are real now: read back on-chain, for tokens with a market price (fake tokens emit fake events). */
async function confirmApprovals(
  client: PublicClient,
  chain: ChainConfig,
  approvals: ApprovalEvent[],
  details: Map<string, { symbol: string; decimals: number } | null>,
  prices: Awaited<ReturnType<typeof getOnchainPrices>> | null,
  senders: Map<string, string>,
  block: bigint,
): Promise<ConfirmedApproval[]> {
  const permit2 = new Set(PERMIT2_CONTRACTS.map((a) => a.toLowerCase()));
  const candidates = approvals.filter((a) => {
    if (a.kind === "nft-all") return senders.get(a.txHash) === a.owner;
    if (a.kind === "permit2" && !permit2.has(a.emitter)) return false;
    return Boolean(prices?.tokens.has(a.token) && details.get(a.token));
  });
  if (candidates.length === 0) return [];
  const results = await client
    .multicall({
      contracts: candidates.map((a) =>
        a.kind === "token"
          ? {
              address: a.token as `0x${string}`,
              abi: erc20Abi,
              functionName: "allowance",
              args: [a.owner as `0x${string}`, a.spender as `0x${string}`],
            }
          : a.kind === "permit2"
            ? {
                address: a.emitter as `0x${string}`,
                abi: permit2Abi,
                functionName: "allowance",
                args: [a.owner as `0x${string}`, a.token as `0x${string}`, a.spender as `0x${string}`],
              }
            : {
                address: a.token as `0x${string}`,
                abi: nftAbi,
                functionName: "isApprovedForAll",
                args: [a.owner as `0x${string}`, a.spender as `0x${string}`],
              },
      ),
      allowFailure: true,
      blockNumber: block,
    })
    .catch(() => null);
  if (!results) return [];
  const nftNames = await client
    .multicall({
      contracts: candidates
        .filter((a) => a.kind === "nft-all")
        .map((a) => ({ address: a.token as `0x${string}`, abi: nftAbi, functionName: "name" as const })),
      allowFailure: true,
    })
    .catch(() => []);
  let nftIndex = 0;
  const confirmed: ConfirmedApproval[] = [];
  candidates.forEach((a, i) => {
    const r = results[i];
    const nftName = a.kind === "nft-all" ? nftNames[nftIndex++] : null;
    if (r?.status !== "success") return;
    const value = r.result as unknown;
    const live =
      a.kind === "nft-all"
        ? value === true
        : a.kind === "permit2"
          ? ((value as [bigint])[0] ?? 0n) > 0n
          : (value as bigint) > 0n;
    if (!live) return;
    const d = details.get(a.token);
    confirmed.push({
      txHash: a.txHash,
      logIndex: a.logIndex,
      owner: a.owner,
      kind: a.kind as ConfirmedApproval["kind"],
      symbol:
        a.kind === "nft-all"
          ? nftName?.status === "success"
            ? sanitizeTokenText(String(nftName.result), 32) || "collection"
            : "collection"
          : (d?.symbol ?? "?"),
      decimals: d?.decimals ?? 0,
      amount: a.amount,
      unlimited: a.unlimited,
      spender: a.spender,
      spenderName: knownContract(chain.key, a.spender)?.name ?? null,
      expiration: a.expiration,
    });
  });
  return confirmed;
}

// ---- Hourly checks ---------------------------------------------------------------------------------------------

const riskTitle = (id: string): string => {
  const checks = (messages as { entity: { tokenSecurity: { checks: Record<string, { risk?: { title?: string } }> } } })
    .entity.tokenSecurity.checks;
  const title = checks[id]?.risk?.title ?? id;
  return title
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export function securitySnapshot(report: SecurityReport): SecuritySnapshot {
  const t = report.facts.trade;
  return {
    level: report.level,
    trade: t.outcome,
    buyTax: t.buyTax,
    sellTax: t.sellTax,
    transferTax: t.transferTax,
    risks: report.checks
      .filter((c) => c.status === "risk" && (c.severity === "critical" || c.severity === "high"))
      .map((c) => c.id),
  };
}

export function liquiditySnapshot(report: SecurityReport, nowSec: number): LiquiditySnapshot | null {
  const s = liquiditySummary(report.facts.pools, nowSec);
  if (!s) return null;
  return {
    totalUsd: s.totalUsd,
    protectedShare: s.split.burned + s.split.locked,
    removableShare: s.split.owner + s.split.removable,
    nextUnlock: s.nextUnlock,
  };
}

export async function hourlyChecks(watched: Watched, db: Db, now = Date.now()): Promise<AlertDraft[]> {
  const drafts: AlertDraft[] = [];
  const due = [
    ...watched.addressItems
      .filter((a) => a.target.rules.valueDrop.on)
      .map((a) => ({ kind: "address" as const, at: a.state.checkedAt ?? 0, a })),
    ...watched.tokens
      .filter((t) => t.rules.security.on || t.rules.liquidity.on)
      .map((t) => ({ kind: "token" as const, at: t.checkedAt, t })),
  ]
    .filter((d) => now - d.at >= HOURLY_MS)
    .sort((x, y) => x.at - y.at)
    .slice(0, HOURLY_PER_ROUND);

  for (const d of due) {
    if (d.kind === "address") {
      const { target, state } = d.a;
      const overview = await addressOverview(target.address).catch(() => null);
      const next: ItemState = { ...state, checkedAt: now };
      // Only complete readings count: a chain that couldn't be read would look like a fall.
      if (overview && overview.unavailable.length === 0 && overview.pricesAvailable) {
        next.values = addValuePoint(state.values ?? [], { at: now, usd: overview.totalUsd });
        const drop = valueDrop(next.values, now, target.rules.valueDrop.percent);
        if (drop) drafts.push(valueDropAlert(target, drop, now));
      }
      await db.update(watchItems).set({ state: next }).where(eq(watchItems.id, target.itemId));
      continue;
    }
    const { t } = d;
    const chain = liveChains.find((c) => c.key === t.chain);
    const next: ItemState = { ...t.state, checkedAt: now };
    const report = chain ? await tokenSecurityReport(t.chain, t.address, "background").catch(() => null) : null;
    if (chain && report) {
      const info = chainInfo(chain);
      const symbol = report.facts.token.symbol;
      const security = securitySnapshot(report);
      // The trade test can fail for a moment (node busy): an "error" result is not compared.
      if (security.trade !== "error") {
        if (t.rules.security.on && t.state.security) {
          const changes = securityChanges(t.state.security, security, riskTitle);
          if (changes.length) drafts.push(tokenAlert("security", t, info, symbol, changes, now));
        }
        next.security = security;
      }
      const liquidity = liquiditySnapshot(report, Math.floor(now / 1000));
      if (liquidity) {
        if (t.rules.liquidity.on && t.state.liquidity) {
          const changes = liquidityChanges(t.state.liquidity, liquidity, Math.floor(now / 1000));
          if (changes.length) drafts.push(tokenAlert("liquidity", t, info, symbol, changes, now));
        }
        next.liquidity = liquidity;
      }
    }
    await db.update(watchItems).set({ state: next }).where(eq(watchItems.id, t.itemId));
  }
  return drafts;
}

// ---- A whole round ---------------------------------------------------------------------------------------------

/** One checker round: every chain, then the hourly checks; new alerts are saved for delivery. */
export async function checkRound(db?: Db, now = Date.now()): Promise<{ alerts: number; errors: string[] }> {
  const database = db ?? (await getDb());
  const watched = await loadWatched(database);
  const drafts: AlertDraft[] = [];
  const errors: string[] = [];
  const chains = liveChains.filter((c) => c.family === "evm");
  const results = await Promise.allSettled(chains.map((chain) => scanChain(chain, watched, database)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") drafts.push(...r.value);
    else errors.push(`${chains[i]!.key}: ${(r.reason as Error)?.message ?? "failed"}`);
  });
  if (watched.addressItems.length || watched.tokens.length) {
    try {
      drafts.push(...(await hourlyChecks(watched, database, now)));
    } catch (error) {
      errors.push(`hourly: ${(error as Error).message}`);
    }
  }
  const alerts = await enqueueAlerts(drafts, database);
  return { alerts, errors };
}
