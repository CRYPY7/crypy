import { batchAssets } from "@/config/batch-assets";
import { getChain } from "@/config/chains";
import type { ChainHoldings, Holding } from "./holdings";

/**
 * Portfolio maths (pure): several wallets' balance overviews → one total, by chain, by wallet and by token.
 *
 * The same token on different chains is combined only when CRYPY knows it is the same asset: the chain's own coin
 * (ETH on Ethereum, Base and Arbitrum) or a token in CRYPY's checked list of well-known tokens (USDT, USDC…, each
 * address verified per chain). Anything else stays one row per chain and contract, so a look-alike token can never
 * be merged into a real one.
 */
export interface WalletOverview {
  address: string;
  label: string;
  /** null while loading or when it couldn't be read. */
  chains: ChainHoldings[] | null;
  pricesAvailable: boolean;
}

export interface CombinedHolding {
  key: string;
  symbol: string;
  name: string;
  chains: string[];
  /** Total amount across chains and wallets (for display; exact amounts stay on each wallet's page). */
  amount: number;
  valueUsd: number | null;
  wallets: number;
  /** Where to open it: the token page for a single-chain token, else null. */
  link: { chain: string; address: string } | null;
}

export interface WalletSummary {
  address: string;
  label: string;
  totalUsd: number;
  chains: { chain: string; totalUsd: number }[];
  loaded: boolean;
}

export interface PortfolioSummary {
  totalUsd: number;
  byChain: { chain: string; totalUsd: number }[];
  wallets: WalletSummary[];
  holdings: CombinedHolding[];
  /** Coins and tokens with a value (priced, not spam). */
  pricedTokens: number;
  unpricedTokens: number;
  hiddenSpam: number;
  loadedWallets: number;
}

const knownAsset = new Map<string, { key: string; symbol: string; name: string }>();
for (const asset of batchAssets)
  for (const [chain, deployment] of Object.entries(asset.chains))
    if (deployment)
      knownAsset.set(`${chain}:${deployment.address.toLowerCase()}`, {
        key: `asset:${asset.key}`,
        symbol: asset.symbol,
        name: asset.name,
      });

function groupOf(h: Holding): { key: string; symbol: string; name: string } {
  if (h.kind === "native") {
    const symbol = getChain(h.chain)?.nativeSymbol ?? h.symbol;
    return { key: `native:${symbol}`, symbol, name: h.name };
  }
  const known = h.address ? knownAsset.get(`${h.chain}:${h.address.toLowerCase()}`) : undefined;
  return known ?? { key: `${h.chain}:${(h.address ?? "").toLowerCase()}`, symbol: h.symbol, name: h.name };
}

const amountOf = (h: Holding) => Number(h.amount.raw) / 10 ** h.amount.decimals;

export function combinePortfolio(wallets: WalletOverview[]): PortfolioSummary {
  const byChain = new Map<string, number>();
  const groups = new Map<string, CombinedHolding & { holders: Set<string>; links: Set<string> }>();
  let unpricedTokens = 0;
  let hiddenSpam = 0;
  const summaries: WalletSummary[] = wallets.map((w) => {
    const chains = (w.chains ?? []).map((c) => ({ chain: c.chain, totalUsd: c.totalUsd }));
    for (const c of w.chains ?? []) {
      byChain.set(c.chain, (byChain.get(c.chain) ?? 0) + c.totalUsd);
      unpricedTokens += c.unpricedCount;
      hiddenSpam += c.hidden.length;
      for (const h of c.visible) {
        if (h.amount.raw === "0") continue;
        const g = groupOf(h);
        const entry =
          groups.get(g.key) ??
          ({
            key: g.key,
            symbol: g.symbol,
            name: g.name,
            chains: [],
            amount: 0,
            valueUsd: null,
            wallets: 0,
            link: null,
            holders: new Set<string>(),
            links: new Set<string>(),
          } as CombinedHolding & { holders: Set<string>; links: Set<string> });
        if (!entry.chains.includes(h.chain)) entry.chains.push(h.chain);
        entry.amount += amountOf(h);
        if (h.valueUsd !== undefined) entry.valueUsd = (entry.valueUsd ?? 0) + h.valueUsd;
        entry.holders.add(w.address);
        if (h.kind === "token" && h.address) entry.links.add(`${h.chain}:${h.address}`);
        groups.set(g.key, entry);
      }
    }
    return {
      address: w.address,
      label: w.label,
      totalUsd: chains.reduce((s, c) => s + c.totalUsd, 0),
      chains: chains.filter((c) => c.totalUsd > 0).sort((a, b) => b.totalUsd - a.totalUsd),
      loaded: w.chains !== null,
    };
  });
  const holdings = [...groups.values()]
    .map(({ holders, links, ...h }) => {
      const only = links.size === 1 ? [...links][0]!.split(":") : null;
      return { ...h, wallets: holders.size, link: only ? { chain: only[0]!, address: only[1]! } : null };
    })
    .sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || a.symbol.localeCompare(b.symbol));
  return {
    totalUsd: summaries.reduce((s, w) => s + w.totalUsd, 0),
    byChain: [...byChain.entries()]
      .filter(([, v]) => v > 0)
      .map(([chain, totalUsd]) => ({ chain, totalUsd }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    wallets: summaries,
    holdings,
    pricedTokens: holdings.filter((h) => h.valueUsd !== null && h.valueUsd > 0).length,
    unpricedTokens,
    hiddenSpam,
    loadedWallets: summaries.filter((w) => w.loaded).length,
  };
}

/** Keeps spreadsheet apps from running a cell as a formula (CSV injection). */
const cell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function portfolioCsv(summary: PortfolioSummary, chainName: (key: string) => string): string {
  const lines = [["Token", "Name", "Chains", "Amount", "Value (USD)", "Wallets"].join(",")];
  for (const h of summary.holdings)
    lines.push(
      [
        cell(h.symbol),
        cell(h.name),
        cell(h.chains.map(chainName).join(" / ")),
        String(h.amount),
        h.valueUsd === null ? "" : h.valueUsd.toFixed(2),
        String(h.wallets),
      ].join(","),
    );
  return `﻿${lines.join("\n")}\n`;
}
