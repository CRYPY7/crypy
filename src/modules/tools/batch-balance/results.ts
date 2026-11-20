/**
 * Batch Balance Scanner results: rows, values, totals, sorting, filtering and CSV. Pure and unit-tested.
 * Amounts stay raw integers (strings) until they are formatted; USD values use the scan's on-chain prices and are
 * only added up for assets that have a reliable price.
 */
import type { Entry } from "./parse";

export type AccountType = "wallet" | "contract" | "delegated";

/** An asset column: the native coin, or a token that may exist on several chains. */
export interface ScanAsset {
  key: string;
  symbol: string;
  name: string;
  /** Per chain key: the token contract and decimals; missing = not on that chain. Native: address "native". */
  chains: Record<string, { address: string; decimals: number } | undefined>;
}

export interface ScanRow {
  entry: Entry;
  chain: string;
  status: "ok" | "failed" | "pending";
  type: AccountType | null;
  /** Per asset key: raw balance; null = not readable; undefined = asset not on this chain. */
  balances: Record<string, string | null | undefined>;
  block: string | null;
}

export interface ScanPrices {
  /** Per chain: "native" and lower-case token addresses → USD. */
  [chain: string]: Record<string, number>;
}

export function toNumber(raw: string, decimals: number): number {
  // Precise enough for display and sorting; exact amounts are formatted from the raw string.
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(value / base) + Number(value % base) / 10 ** decimals;
}

function priceOf(prices: ScanPrices, asset: ScanAsset, chain: string): number | undefined {
  const deployment = asset.chains[chain];
  if (!deployment) return undefined;
  return prices[chain]?.[deployment.address === "native" ? "native" : deployment.address.toLowerCase()];
}

/** USD value of one asset in one row, or null when it has no price or no readable balance. */
export function cellUsd(row: ScanRow, asset: ScanAsset, prices: ScanPrices): number | null {
  const raw = row.balances[asset.key];
  const deployment = asset.chains[row.chain];
  const price = priceOf(prices, asset, row.chain);
  if (!raw || !deployment || price === undefined) return null;
  return toNumber(raw, deployment.decimals) * price;
}

export function rowUsd(row: ScanRow, assets: ScanAsset[], prices: ScanPrices): number {
  return assets.reduce((sum, asset) => sum + (cellUsd(row, asset, prices) ?? 0), 0);
}

export function isEmptyRow(row: ScanRow): boolean {
  return (
    row.status === "ok" && Object.values(row.balances).every((raw) => raw === undefined || raw === null || raw === "0")
  );
}

export interface AssetTotal {
  asset: ScanAsset;
  /** Per chain: raw total and decimals. */
  perChain: { chain: string; raw: string; decimals: number }[];
  usd: number | null;
}

export interface ScanSummary {
  addresses: number;
  checks: number;
  withBalance: number;
  empty: number;
  failed: number;
  totalUsd: number;
  assetTotals: AssetTotal[];
  blocks: Record<string, string>;
}

export function summarize(rows: ScanRow[], assets: ScanAsset[], prices: ScanPrices, addressCount: number): ScanSummary {
  const withBalance = new Set<string>();
  const anyFailed = new Set<string>();
  const blocks: Record<string, string> = {};
  for (const row of rows) {
    const key = row.entry.address.toLowerCase();
    if (row.status === "failed") anyFailed.add(key);
    if (row.status === "ok" && !isEmptyRow(row)) withBalance.add(key);
    if (row.block && !blocks[row.chain]) blocks[row.chain] = row.block;
  }
  // Empty = every check of the address succeeded and found nothing.
  const empty = new Set(
    rows
      .filter((r) => !withBalance.has(r.entry.address.toLowerCase()) && !anyFailed.has(r.entry.address.toLowerCase()))
      .map((r) => r.entry.address.toLowerCase()),
  );
  const assetTotals: AssetTotal[] = assets.map((asset) => {
    const perChain = new Map<string, { raw: bigint; decimals: number }>();
    let usd: number | null = null;
    for (const row of rows) {
      const raw = row.balances[asset.key];
      const deployment = asset.chains[row.chain];
      if (!raw || !deployment) continue;
      const entry = perChain.get(row.chain) ?? { raw: 0n, decimals: deployment.decimals };
      entry.raw += BigInt(raw);
      perChain.set(row.chain, entry);
      const value = cellUsd(row, asset, prices);
      if (value !== null) usd = (usd ?? 0) + value;
    }
    return {
      asset,
      perChain: [...perChain].map(([chain, v]) => ({ chain, raw: v.raw.toString(), decimals: v.decimals })),
      usd,
    };
  });
  return {
    addresses: addressCount,
    checks: rows.length,
    withBalance: withBalance.size,
    empty: empty.size,
    failed: rows.filter((r) => r.status === "failed").length,
    totalUsd: rows.reduce((sum, row) => sum + rowUsd(row, assets, prices), 0),
    assetTotals,
    blocks,
  };
}

export type SortKey = "index" | "label" | "chain" | "value" | `asset:${string}`;

export interface ViewOptions {
  search: string;
  chain: string | null;
  hideEmpty: boolean;
  sort: SortKey;
  descending: boolean;
}

export function viewRows(rows: ScanRow[], assets: ScanAsset[], prices: ScanPrices, options: ViewOptions): ScanRow[] {
  const query = options.search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!options.chain || row.chain === options.chain) &&
      (!options.hideEmpty || !isEmptyRow(row)) &&
      (!query || row.entry.address.toLowerCase().includes(query) || row.entry.label.toLowerCase().includes(query)),
  );
  const keyOf = (row: ScanRow): number | string => {
    if (options.sort === "value") return rowUsd(row, assets, prices);
    if (options.sort === "label") return row.entry.label.toLowerCase();
    if (options.sort === "chain") return row.chain;
    if (options.sort.startsWith("asset:")) {
      const asset = assets.find((a) => a.key === options.sort.slice(6));
      const raw = asset ? row.balances[asset.key] : null;
      const deployment = asset?.chains[row.chain];
      return raw && deployment ? toNumber(raw, deployment.decimals) : -1;
    }
    return rows.indexOf(row);
  };
  const direction = options.descending ? -1 : 1;
  return [...filtered].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === kb) return rows.indexOf(a) - rows.indexOf(b);
    return (ka < kb ? -1 : 1) * direction;
  });
}

/** Keeps spreadsheet apps from running a cell as a formula (CSV injection). */
export function safeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Plain decimal text for CSV (no grouping, dot decimal), exact. */
export function plainAmount(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const fraction = decimals > 0 ? (value % base).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return fraction ? `${value / base}.${fraction}` : (value / base).toString();
}

export function toCsv(
  rows: ScanRow[],
  assets: ScanAsset[],
  prices: ScanPrices,
  headers: { label: string; address: string; chain: string; type: string; value: string; status: string },
  chainName: (key: string) => string,
  typeName: (type: AccountType | null) => string,
  statusName: (status: ScanRow["status"]) => string,
): string {
  const head = [
    headers.label,
    headers.address,
    headers.chain,
    headers.type,
    ...assets.map((a) => a.symbol),
    headers.value,
    headers.status,
  ];
  const lines = rows.map((row) => {
    const cells = assets.map((asset) => {
      const raw = row.balances[asset.key];
      const deployment = asset.chains[row.chain];
      return raw && deployment ? plainAmount(raw, deployment.decimals) : "";
    });
    return [
      row.entry.label,
      row.entry.address,
      chainName(row.chain),
      typeName(row.type),
      ...cells,
      row.status === "ok" ? rowUsd(row, assets, prices).toFixed(2) : "",
      statusName(row.status),
    ];
  });
  // A byte-order mark lets Excel open UTF-8 labels correctly.
  return "﻿" + [head, ...lines].map((cells) => cells.map((c) => safeCell(String(c))).join(",")).join("\r\n");
}
