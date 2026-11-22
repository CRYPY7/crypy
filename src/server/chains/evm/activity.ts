import "server-only";
import { limitedFetch } from "@/server/http/limit";
import { type PublicClient, getAddress, pad, parseAbiItem } from "viem";
import type { ChainConfig } from "@/config/chains";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import { completeAbove } from "@/lib/activity/evaluate";
import type { ChainActivity, Transfer } from "@/lib/activity/types";
import { getOnchainPrices } from "./prices";
import { discardBody } from "@/server/http/discard";
import { noteAlchemyLimited, waitForAlchemy } from "./alchemy-pace";
import {
  alchemyUnits,
  BudgetExhaustedError,
  type Provider,
  alchemyProvider,
  budgetExhausted,
  getEvmClient,
  recordUsage,
} from "./providers";

/**
 * A wallet's transfers on one EVM chain, newest first.
 *
 * With Alchemy (free plan): `alchemy_getAssetTransfers`, the wallet's full history of coin, token and NFT transfers,
 * read twice (sent and received) and merged. Internal transfers (coins moved by contracts) exist only on some
 * chains (Ethereum here, not BNB Chain); block times come with the data on Ethereum and are read from the chain
 * elsewhere. Paging uses block numbers, so two streams merge without losing or repeating a transfer.
 *
 * Without Alchemy (no key, error or daily budget used): the last few hours of token transfers for the tokens the
 * wallet holds, from the chain itself (free nodes only search events by contract address). Coin transfers can't be
 * found that way; the page says so.
 */
export const PAGE_SIZE = 50;
const ALCHEMY_TIMEOUT_MS = 12_000;
/**
 * Alchemy Transfers API chain support (docs, 2026-11): internal transfers on Ethereum and Polygon (the docs disagree
 * about Base, so it is treated as missing and the page says so); block times included on Ethereum, Base, Arbitrum and
 * Polygon.
 */
const INTERNAL = new Set(["ethereum", "polygon"]);
const METADATA = new Set(["ethereum", "base", "arbitrum", "polygon"]);
const RECENT_BLOCKS: Record<string, bigint> = {
  bsc: 20_000n,
  ethereum: 2_000n,
  // A few hours: Base and Polygon make a block every ~2 s; Arbitrum every ~0.25 s (kept smaller: public nodes
  // there are slow to search long ranges).
  base: 10_000n,
  polygon: 10_000n,
  arbitrum: 40_000n,
};

/** One transfer as Alchemy returns it (fields we read). Exported for tests. */
export interface AlchemyTransfer {
  category: string;
  blockNum: string;
  from: string;
  to: string | null;
  asset: string | null;
  uniqueId?: string;
  hash: string;
  tokenId?: string | null;
  erc721TokenId?: string | null;
  erc1155Metadata?: { tokenId: string; value: string }[] | null;
  rawContract?: { value: string | null; address: string | null; decimal: string | null };
  metadata?: { blockTimestamp?: string };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const hexInt = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]+$/.test(v)) return null;
  const n = Number.parseInt(v, 16);
  return Number.isSafeInteger(n) ? n : null;
};
const hexBig = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]*$/.test(v)) return null;
  return v === "0x" ? "0" : BigInt(v).toString();
};

/** Alchemy transfer → CRYPY transfer. Never trusts field types; returns null for anything unusable. */
export function parseAlchemyTransfer(
  raw: unknown,
  chain: ChainConfig,
  owner: string,
): Omit<Transfer, "valueNowUsd"> | null {
  const t = raw as AlchemyTransfer;
  const block = hexInt(t?.blockNum);
  if (block === null || typeof t.hash !== "string" || !HASH.test(t.hash)) return null;
  if (typeof t.from !== "string" || !ADDRESS.test(t.from)) return null;
  const to = typeof t.to === "string" && ADDRESS.test(t.to) ? t.to : null;
  if (!to) return null; // contract creation: not a transfer between two addresses
  const me = owner.toLowerCase();
  const fromMe = t.from.toLowerCase() === me;
  const toMe = to.toLowerCase() === me;
  if (!fromMe && !toMe) return null;
  const category = t.category;
  const contract = t.rawContract?.address;
  const tokenAddress = typeof contract === "string" && ADDRESS.test(contract) ? getAddress(contract) : null;
  const symbol = sanitizeTokenText(typeof t.asset === "string" ? t.asset : "", 24);
  let kind: Transfer["kind"];
  let amount: string | null;
  let decimals: number | null;
  let tokenId: string | null = null;
  if (category === "external" || category === "internal") {
    kind = "coin";
    amount = hexBig(t.rawContract?.value);
    decimals = chain.nativeDecimals;
  } else if (category === "erc20") {
    if (!tokenAddress) return null;
    kind = "token";
    amount = hexBig(t.rawContract?.value);
    decimals = hexInt(t.rawContract?.decimal);
  } else if (category === "erc721" || category === "erc1155" || category === "specialnft") {
    if (!tokenAddress) return null;
    kind = "nft";
    decimals = 0;
    const items = Array.isArray(t.erc1155Metadata) ? t.erc1155Metadata : null;
    tokenId = hexBig(t.tokenId ?? t.erc721TokenId ?? items?.[0]?.tokenId ?? null);
    amount = items ? items.reduce((sum, i) => sum + BigInt(hexBig(i.value) ?? "0"), 0n).toString() : "1";
  } else return null;
  const iso = t.metadata?.blockTimestamp;
  const time = iso ? Math.floor(Date.parse(iso) / 1000) : null;
  return {
    id: typeof t.uniqueId === "string" ? t.uniqueId.slice(0, 120) : `${t.hash}:${category}:${t.from}:${to}`,
    chain: chain.key,
    hash: t.hash,
    block,
    time: time && Number.isFinite(time) ? time : null,
    direction: fromMe && toMe ? "self" : fromMe ? "out" : "in",
    kind,
    internal: category === "internal",
    from: getAddress(t.from),
    to: getAddress(to),
    asset: {
      address: kind === "coin" ? null : tokenAddress,
      symbol: kind === "coin" ? chain.nativeSymbol : symbol || "?",
      decimals,
      tokenId,
    },
    amount,
  };
}

async function alchemyCall(provider: Provider, params: Record<string, unknown>) {
  if (budgetExhausted(provider)) throw new BudgetExhaustedError(provider.name);
  await waitForAlchemy(alchemyUnits("alchemy_getAssetTransfers"), 4_000);
  recordUsage(provider, "alchemy_getAssetTransfers");
  const response = await limitedFetch(provider.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [params] }),
    signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 429) noteAlchemyLimited();
    discardBody(response);
    throw new Error(`Transfers provider responded ${response.status}`);
  }
  const json = (await response.json()) as { result?: { transfers?: unknown[]; pageKey?: string }; error?: unknown };
  if (json.error || !json.result) throw new Error("Transfers provider error");
  return { transfers: Array.isArray(json.result.transfers) ? json.result.transfers : [], pageKey: json.result.pageKey };
}

function categories(chain: ChainConfig): string[] {
  return ["external", ...(INTERNAL.has(chain.key) ? ["internal"] : []), "erc20", "erc721", "erc1155"];
}

/** Block times for transfers that came without one, read from the chain (each block once). */
async function fillTimes(client: PublicClient, list: Omit<Transfer, "valueNowUsd">[]) {
  const missing = [...new Set(list.filter((t) => t.time === null).map((t) => t.block))];
  const times = new Map<number, number>();
  await Promise.all(
    missing.map(async (block) => {
      const b = await client.getBlock({ blockNumber: BigInt(block) }).catch(() => null);
      if (b) times.set(block, Number(b.timestamp));
    }),
  );
  for (const t of list) if (t.time === null) t.time = times.get(t.block) ?? null;
}

async function historyPage(
  chain: ChainConfig,
  provider: Provider,
  owner: string,
  before: number | null,
  withFirst: boolean,
): Promise<{ list: Omit<Transfer, "valueNowUsd">[]; next: number | null; first: ChainActivity["first"] }> {
  const base = {
    category: categories(chain),
    order: "desc",
    excludeZeroValue: false,
    maxCount: `0x${PAGE_SIZE.toString(16)}`,
    ...(METADATA.has(chain.key) ? { withMetadata: true } : {}),
    ...(before !== null ? { toBlock: `0x${before.toString(16)}` } : {}),
  };
  const firstOf = (dir: "fromAddress" | "toAddress") =>
    alchemyCall(provider, {
      category: categories(chain),
      order: "asc",
      excludeZeroValue: false,
      maxCount: "0x1",
      [dir]: owner,
      ...(METADATA.has(chain.key) ? { withMetadata: true } : {}),
    });
  const [sent, received, firstSent, firstReceived] = await Promise.all([
    alchemyCall(provider, { ...base, fromAddress: owner }),
    alchemyCall(provider, { ...base, toAddress: owner }),
    withFirst ? firstOf("fromAddress").catch(() => null) : null,
    withFirst ? firstOf("toAddress").catch(() => null) : null,
  ]);
  const parse = (items: unknown[]) =>
    items.flatMap((raw) => {
      const t = parseAlchemyTransfer(raw, chain, owner);
      return t ? [t] : [];
    });
  const a = parse(sent.transfers);
  const b = parse(received.transfers);
  const cut = completeAbove([
    { blocks: a.map((t) => t.block), full: sent.transfers.length >= PAGE_SIZE },
    { blocks: b.map((t) => t.block), full: received.transfers.length >= PAGE_SIZE },
  ]);
  const seen = new Set<string>();
  let list = [...a, ...b].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  let next: number | null = null;
  if (cut !== null) {
    const above = list.filter((t) => t.block > cut);
    // A single block with more transfers than a page: show it whole and continue below it.
    if (above.length === 0) next = cut - 1;
    else {
      list = above;
      next = cut;
    }
  }
  list.sort((x, y) => y.block - x.block);
  let first: ChainActivity["first"] = null;
  if (withFirst) {
    const firsts = [...parse(firstSent?.transfers ?? []), ...parse(firstReceived?.transfers ?? [])].sort(
      (x, y) => x.block - y.block,
    );
    if (firsts[0]) first = { block: firsts[0].block, time: firsts[0].time };
  }
  return { list, next, first };
}

/** Fallback: recent token transfers of held tokens, read from the chain. */
async function recentPage(
  chain: ChainConfig,
  client: PublicClient,
  owner: string,
  heldTokens: string[],
): Promise<Omit<Transfer, "valueNowUsd">[]> {
  if (heldTokens.length === 0) return [];
  const latest = await client.getBlockNumber();
  const window = RECENT_BLOCKS[chain.key] ?? 2_000n;
  const fromBlock = latest > window ? latest - window : 0n;
  const me = getAddress(owner);
  const groups: string[][] = [];
  for (let i = 0; i < Math.min(heldTokens.length, 60); i += 20) groups.push(heldTokens.slice(i, i + 20));
  const reads = await Promise.all(
    groups.flatMap((group) =>
      (["from", "to"] as const).map((side) =>
        client
          .request({
            method: "eth_getLogs",
            params: [
              {
                address: group.map((g) => getAddress(g)),
                fromBlock: `0x${fromBlock.toString(16)}`,
                toBlock: `0x${latest.toString(16)}`,
                topics: [
                  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                  side === "from" ? pad(me) : null,
                  side === "to" ? pad(me) : null,
                ],
              },
            ],
          })
          .then(
            (logs) =>
              logs as {
                address: string;
                topics: string[];
                data: string;
                transactionHash: string;
                blockNumber: string;
                logIndex: string;
              }[],
          )
          .catch(() => []),
      ),
    ),
  );
  const meta = await client.multicall({
    allowFailure: true,
    contracts: heldTokens.slice(0, 60).flatMap((t) => [
      {
        address: getAddress(t),
        abi: [parseAbiItem("function symbol() view returns (string)")],
        functionName: "symbol" as const,
      },
      {
        address: getAddress(t),
        abi: [parseAbiItem("function decimals() view returns (uint8)")],
        functionName: "decimals" as const,
      },
    ]),
  });
  const info = new Map<string, { symbol: string; decimals: number | null }>();
  heldTokens.slice(0, 60).forEach((t, i) => {
    const s = meta[i * 2];
    const d = meta[i * 2 + 1];
    info.set(t.toLowerCase(), {
      symbol: sanitizeTokenText(s?.status === "success" ? String(s.result) : "", 24) || "?",
      decimals: d?.status === "success" ? Number(d.result) : null,
    });
  });
  const seen = new Set<string>();
  return reads.flat().flatMap((log) => {
    if (log.topics.length !== 3) return []; // ERC-721 Transfer has 4 topics; ERC-20 has 3
    const id = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const from = getAddress(`0x${log.topics[1]!.slice(26)}`);
    const to = getAddress(`0x${log.topics[2]!.slice(26)}`);
    const tok = info.get(log.address.toLowerCase());
    const fromMe = from === me;
    const toMe = to === me;
    return [
      {
        id,
        chain: chain.key,
        hash: log.transactionHash,
        block: Number.parseInt(log.blockNumber, 16),
        time: null,
        direction: (fromMe && toMe ? "self" : fromMe ? "out" : "in") as Transfer["direction"],
        kind: "token" as const,
        internal: false,
        from,
        to,
        asset: {
          address: getAddress(log.address),
          symbol: tok?.symbol ?? "?",
          decimals: tok?.decimals ?? null,
          tokenId: null,
        },
        amount: log.data && log.data !== "0x" ? BigInt(log.data.slice(0, 66)).toString() : "0",
      },
    ];
  });
}

/** Adds today's value to each transfer (on-chain prices; nothing for NFTs or tokens without a reliable price). */
async function addValues(
  client: PublicClient,
  chain: ChainConfig,
  list: Omit<Transfer, "valueNowUsd">[],
): Promise<Transfer[]> {
  const tokens = [
    ...new Map(
      list
        .filter((t) => t.kind === "token" && t.asset.address)
        .map((t) => [t.asset.address!.toLowerCase(), { address: t.asset.address!, decimals: t.asset.decimals }]),
    ).values(),
  ].slice(0, 120);
  const prices = await Promise.race([
    getOnchainPrices(client, chain, tokens).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 6_000)),
  ]);
  return list.map((t) => {
    const price =
      t.kind === "coin"
        ? prices?.native?.usd
        : t.kind === "token"
          ? prices?.tokens.get(t.asset.address!.toLowerCase())?.usd
          : undefined;
    let valueNowUsd: number | null = null;
    if (price !== undefined && t.amount !== null && t.asset.decimals !== null) {
      const raw = t.amount.padStart(t.asset.decimals + 1, "0");
      const amount = Number(
        t.asset.decimals ? `${raw.slice(0, -t.asset.decimals)}.${raw.slice(-t.asset.decimals)}` : raw,
      );
      valueNowUsd = Number.isFinite(amount) ? amount * price : null;
    }
    return { ...t, valueNowUsd };
  });
}

export async function getEvmActivity(
  chain: ChainConfig,
  owner: string,
  before: number | null,
  heldTokensInput: string[] | Promise<string[]>,
): Promise<{ chain: ChainActivity; transfers: Transfer[] }> {
  const client = getEvmClient(chain);
  const provider = alchemyProvider(chain);
  if (provider) {
    try {
      const page = await historyPage(chain, provider, getAddress(owner), before, before === null);
      await fillTimes(client, page.list);
      return {
        chain: {
          chain: chain.key,
          source: "history",
          next: page.next,
          first: page.first,
          internalIncluded: INTERNAL.has(chain.key),
        },
        transfers: await addValues(client, chain, page.list),
      };
    } catch {
      // Fall through to the recent-only reading below.
    }
  }
  if (before !== null) {
    // Paging needs the history source; without it there is nothing older to read.
    return {
      chain: { chain: chain.key, source: "recent", next: null, first: null, internalIncluded: false },
      transfers: [],
    };
  }
  const heldTokens = await Promise.resolve(heldTokensInput).catch(() => [] as string[]);
  const list = await recentPage(chain, client, owner, heldTokens).catch(() => null);
  if (list === null)
    return {
      chain: { chain: chain.key, source: "unavailable", next: null, first: null, internalIncluded: false },
      transfers: [],
    };
  list.sort((x, y) => y.block - x.block);
  const capped = list.slice(0, PAGE_SIZE * 2);
  await fillTimes(client, capped);
  return {
    chain: { chain: chain.key, source: "recent", next: null, first: null, internalIncluded: false },
    transfers: await addValues(client, chain, capped),
  };
}

/**
 * Coin (not token) transfers of one wallet in a block range, for the alerts checker: called only after the wallet's
 * coin balance changed, to say what happened. Null without Alchemy (the checker then reports the balance change).
 */
export async function coinTransfersInRange(
  chain: ChainConfig,
  owner: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ hash: string; from: string; to: string; raw: bigint; internal: boolean }[] | null> {
  const provider = alchemyProvider(chain);
  if (!provider) return null;
  const category = ["external", ...(INTERNAL.has(chain.key) ? ["internal"] : [])];
  const range = { fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}` };
  const pages = await Promise.all(
    (["fromAddress", "toAddress"] as const).map((dir) =>
      alchemyCall(provider, { category, ...range, [dir]: owner, excludeZeroValue: true, maxCount: "0x32" }),
    ),
  );
  const seen = new Set<string>();
  const out: { hash: string; from: string; to: string; raw: bigint; internal: boolean }[] = [];
  for (const raw of pages.flatMap((p) => p.transfers) as AlchemyTransfer[]) {
    if (!raw || typeof raw.hash !== "string" || !HASH.test(raw.hash)) continue;
    if (!ADDRESS.test(raw.from ?? "") || !ADDRESS.test(raw.to ?? "")) continue;
    const key = raw.uniqueId ?? `${raw.hash}:${raw.from}:${raw.to}:${raw.rawContract?.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const value = raw.rawContract?.value;
    const amount = typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value) : 0n;
    if (amount === 0n) continue;
    out.push({
      hash: raw.hash.toLowerCase(),
      from: raw.from.toLowerCase(),
      to: raw.to!.toLowerCase(),
      raw: amount,
      internal: raw.category === "internal",
    });
  }
  return out;
}
