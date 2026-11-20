/**
 * The route assets took inside a transaction, built only from movements we can show evidence for.
 * Generic: no protocol- or token-specific rules. Works for simple sends, swaps through one or many pools,
 * wraps/unwraps and router payouts; when movements don't form a chain we return them as separate relationships
 * instead of inventing one.
 */
import type { TxDetails } from "@/lib/chains/types";
import type { ActionSet } from "./actions";
import { type AssetAmount, type EvidenceLevel, assetOf, internalNative, lower, nativeAsset } from "./assets";

export type EdgeKind = "native" | "transfer" | "wrap" | "unwrap" | "reported" | "internal";

export interface RouteEdge {
  from: string;
  to: string;
  asset: AssetAmount;
  /** Order inside the transaction (receipt log index; −1 for the coin value sent with the call). */
  logIndex: number;
  kind: EdgeKind;
  evidence: EvidenceLevel;
  /** A small side payment of the same token out of the sender's wallet: maybe a fee, not proven. */
  possibleFee?: boolean;
}

export interface TxRoute {
  /** "path": a connected chain of steps; "relations": separate movements that don't form one chain. */
  mode: "path" | "relations";
  start: string;
  path: RouteEdge[];
  side: RouteEdge[];
  returnsToStart: boolean;
}

const MAX_EDGES = 60;
const MAX_DEPTH = 8;
const MAX_VISITS = 20_000;
const LAST = Number.MAX_SAFE_INTEGER;
/** A side payment counts as a possible fee only when it is at most this share of the main amount (5%). */
const FEE_SHARE = 20n;

export function routeEdges(tx: TxDetails, set: ActionSet, nativeSymbol: string): RouteEdge[] {
  if (tx.status !== "success") return [];
  const edges: RouteEdge[] = [];
  const value = BigInt(tx.value);
  if (value > 0n && tx.to) {
    edges.push({
      from: tx.from,
      to: tx.to,
      asset: nativeAsset(value, nativeSymbol),
      logIndex: -1,
      kind: "native",
      evidence: "chain",
    });
  }
  for (const t of tx.transfers) {
    const amount = BigInt(t.amount);
    if (t.standard === "wrap") {
      edges.push({
        from: t.to,
        to: t.to,
        asset: assetOf(tx, t.token, "erc20", amount),
        logIndex: t.logIndex,
        kind: "wrap",
        evidence: "event",
      });
    } else if (t.standard === "unwrap") {
      edges.push({
        from: t.from,
        to: t.from,
        asset: nativeAsset(amount, nativeSymbol),
        logIndex: t.logIndex,
        kind: "unwrap",
        evidence: "event",
      });
    } else {
      edges.push({
        from: t.from,
        to: t.to,
        asset: assetOf(tx, t.token, t.standard, amount, t.tokenId),
        logIndex: t.logIndex,
        kind: "transfer",
        evidence: "event",
      });
    }
  }

  // Coins paid out inside contracts leave no event. Use a known router's report, and upgrade it to a chain fact
  // when the sender's measured balance change matches it exactly.
  const internal = internalNative(tx);
  let nativeShown = false;
  for (const action of set.actions) {
    if (action.type !== "router-swap" || action.assetOut?.token !== "native" || !action.to) continue;
    const amount = BigInt(action.assetOut.raw);
    const at = action.logs[0]!;
    const unwrapper = edges
      .filter((e) => e.kind === "unwrap" && e.logIndex < at && BigInt(e.asset.raw) === amount)
      .at(-1);
    const confirmed = lower(action.to) === lower(tx.from) && internal !== null && internal === amount;
    edges.push({
      from: unwrapper?.from ?? action.router!,
      to: action.to,
      asset: action.assetOut,
      logIndex: at,
      kind: "reported",
      evidence: confirmed ? "chain" : "reported",
    });
    if (lower(action.to) === lower(tx.from)) nativeShown = true;
  }
  if (!nativeShown && internal !== null && internal > 0n && tx.to) {
    const unwrapper = edges.filter((e) => e.kind === "unwrap" && BigInt(e.asset.raw) === internal).at(-1);
    edges.push({
      from: unwrapper?.from ?? tx.to,
      to: tx.from,
      asset: nativeAsset(internal, nativeSymbol),
      logIndex: LAST,
      kind: "internal",
      evidence: "chain",
    });
  }
  return edges.sort((a, b) => a.logIndex - b.logIndex);
}

export function buildRoute(tx: TxDetails, set: ActionSet, nativeSymbol: string): TxRoute | null {
  const edges = routeEdges(tx, set, nativeSymbol);
  if (edges.length === 0) return null;
  const start = lower(tx.from);
  if (edges.length > MAX_EDGES) {
    return { mode: "relations", start: tx.from, path: [], side: edges.slice(0, MAX_EDGES), returnsToStart: false };
  }

  // Longest chain of steps starting at the sender, in event order; one that comes back to the sender wins.
  let best: number[] = [];
  let bestScore = 0;
  let visits = 0;
  const path: number[] = [];
  const used = new Set<number>();
  const walk = (node: string, last: number) => {
    for (let i = 0; i < edges.length; i++) {
      if (++visits > MAX_VISITS) return;
      const edge = edges[i]!;
      if (used.has(i) || lower(edge.from) !== node || edge.logIndex <= last) continue;
      path.push(i);
      used.add(i);
      const score = path.length + (lower(edge.to) === start ? 1_000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = [...path];
      }
      if (path.length < MAX_DEPTH) walk(lower(edge.to), edge.logIndex);
      path.pop();
      used.delete(i);
    }
  };
  walk(start, -2);

  if (best.length < 2) {
    return edges.length >= 2
      ? { mode: "relations", start: tx.from, path: [], side: edges, returnsToStart: false }
      : null;
  }
  const chosen = new Set(best);
  const main = best.map((i) => edges[i]!);
  const nodes = new Set(main.flatMap((e) => [lower(e.from), lower(e.to)]));
  const first = main[0]!;
  const side = edges
    .filter((_, i) => !chosen.has(i))
    .map((edge) => {
      const possibleFee =
        edge.kind === "transfer" &&
        lower(edge.from) === start &&
        lower(edge.asset.token) === lower(first.asset.token) &&
        !nodes.has(lower(edge.to)) &&
        BigInt(edge.asset.raw) * FEE_SHARE <= BigInt(first.asset.raw);
      return possibleFee ? { ...edge, possibleFee: true } : edge;
    });
  return { mode: "path", start: tx.from, path: main, side, returnsToStart: lower(main.at(-1)!.to) === start };
}
