import { formatAmount, shortenId } from "@/lib/format/amount";
import type { AddressRules } from "@/lib/watchlist/rules";
import type { AlertDetails, AlertKind, AlertSeverity } from "./format";

/**
 * Which alerts the checker's findings produce, and their text (approved board 40). Pure: the checker supplies what it
 * read (transfers with prices, confirmed approvals, snapshots), this decides who is told what.
 *
 * Spam rules (address poisoning and fake tokens emit events that name any wallet):
 *  - received: never zero amounts, NFTs or tokens without a market price;
 *  - sent: a token without a market price, or an NFT, only when the watched wallet sent the transaction itself;
 *  - approvals: only ones the checker confirmed on-chain (see checker.ts).
 */

export interface WatchTarget {
  itemId: string;
  userId: string;
  label: string;
  /** Lower case. */
  address: string;
  rules: AddressRules;
}

export interface AlertDraft {
  userId: string;
  itemId: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  chain: string;
  title: string;
  details: AlertDetails;
  dedupeKey: string;
}

export interface ChainInfo {
  key: string;
  name: string;
  nativeSymbol: string;
}

/** A transfer the checker found, with what it knows about the token. */
export interface PricedMovement {
  /** null: found only as a coin balance change (no transaction known). */
  txHash: string | null;
  standard: "coin" | "erc20" | "nft";
  from: string;
  to: string;
  /** Raw amount (null for NFTs). */
  amount: bigint | null;
  decimals: number;
  symbol: string;
  /** USD value now; null without a reliable price. */
  usd: number | null;
  /** Who sent the transaction, when the checker looked it up. */
  txFrom: string | null;
  tokenId?: bigint | null;
}

const fmtUsd = (usd: number) =>
  usd >= 1 ? `$${Math.round(usd).toLocaleString("en-US")}` : usd >= 0.01 ? `$${usd.toFixed(2)}` : "< $0.01";

export function describeAmount(m: Pick<PricedMovement, "standard" | "amount" | "decimals" | "symbol" | "tokenId">) {
  if (m.standard === "nft")
    return `${m.symbol} NFT${m.tokenId != null ? ` #${m.tokenId.toString().slice(0, 12)}` : ""}`;
  return `${formatAmount((m.amount ?? 0n).toString(), m.decimals, "en-US")} ${m.symbol}`;
}

const nameOf = (t: WatchTarget) => t.label || shortenId(t.address);

/** Should this movement alert this wallet's owner? */
export function wantsMovement(m: PricedMovement, t: WatchTarget, direction: "out" | "in"): boolean {
  if (m.standard !== "nft" && (m.amount === null || m.amount === 0n)) return false;
  if (direction === "out") {
    const rule = t.rules.sent;
    if (!rule.on) return false;
    const genuine = m.standard === "coin" || m.usd !== null || m.txFrom === t.address;
    if (!genuine) return false;
    return rule.minUsd === null || (m.usd !== null && m.usd >= rule.minUsd);
  }
  const rule = t.rules.received;
  if (!rule.on || m.standard === "nft") return false;
  if (m.usd === null) return m.standard === "coin" && rule.minUsd === null;
  return rule.minUsd === null || m.usd >= rule.minUsd;
}

/** One alert per watched wallet per transaction (a swap's sent and received parts together). */
export function transferAlerts(
  chain: ChainInfo,
  movements: PricedMovement[],
  targets: Map<string, WatchTarget[]>,
  /** Names from CRYPY's own list of known contracts (never names read from the chain). */
  knownName: (address: string) => string | null = () => null,
): AlertDraft[] {
  const who = (address: string) => knownName(address) ?? shortenId(address);
  const drafts: AlertDraft[] = [];
  const groups = new Map<string, { target: WatchTarget; out: PricedMovement[]; in: PricedMovement[]; key: string }>();
  for (const m of movements) {
    for (const [direction, address] of [
      ["out", m.from],
      ["in", m.to],
    ] as const) {
      for (const target of targets.get(address) ?? []) {
        if (m.from === m.to && direction === "in") continue;
        if (!wantsMovement(m, target, direction)) continue;
        const key = `${target.itemId}|${m.txHash ?? `bal:${m.standard}:${m.symbol}`}`;
        const group = groups.get(key) ?? { target, out: [], in: [], key };
        group[direction].push(m);
        groups.set(key, group);
      }
    }
  }
  for (const g of groups.values()) {
    const name = nameOf(g.target);
    const first = (g.out[0] ?? g.in[0])!;
    const hash = first.txHash;
    const what = (list: PricedMovement[]) => (list.length === 1 ? describeAmount(list[0]!) : `${list.length} assets`);
    const kind: AlertKind = g.out.length && g.in.length ? "moved" : g.out.length ? "sent" : "received";
    const title =
      kind === "moved"
        ? `${name} sent ${what(g.out)} and received ${what(g.in)}`
        : kind === "sent"
          ? `${name} sent ${what(g.out)}`
          : `${name} received ${what(g.in)}`;
    const line = (m: PricedMovement, dir: "out" | "in") => {
      const value = m.usd !== null ? ` (${fmtUsd(m.usd)})` : "";
      return dir === "out"
        ? `Sent ${describeAmount(m)}${value} to ${who(m.to)}`
        : `Received ${describeAmount(m)}${value} from ${who(m.from)}`;
    };
    const lines = [...g.out.slice(0, 5).map((m) => line(m, "out")), ...g.in.slice(0, 5).map((m) => line(m, "in"))];
    lines.push(
      hash
        ? `${chain.name} · tx ${shortenId(hash, 6, 4)}`
        : `${chain.name} · from the balance change (no details available)`,
    );
    const counterpart = kind === "received" ? who(first.from) : who(first.to);
    drafts.push({
      userId: g.target.userId,
      itemId: g.target.itemId,
      kind,
      severity: kind === "sent" ? "danger" : kind === "received" ? "good" : "info",
      chain: chain.key,
      title,
      details: {
        summary:
          kind === "received" ? `${counterpart} → ${name} · ${chain.name}` : `${name} → ${counterpart} · ${chain.name}`,
        lines,
        path: hash ? `/tx/${hash}?chain=${chain.key}` : `/address/${g.target.address}/activity?chains=${chain.key}`,
        muteItemId: g.target.itemId,
      },
      dedupeKey: hash
        ? `tx:${chain.key}:${hash}:${g.target.itemId}`
        : `bal:${chain.key}:${g.target.itemId}:${first.standard}:${first.amount}:${first.from}:${first.to}`,
    });
  }
  return drafts;
}

/** A new permission, already confirmed on-chain by the checker. */
export interface ConfirmedApproval {
  txHash: string;
  logIndex: number;
  owner: string;
  kind: "token" | "nft-all" | "permit2";
  symbol: string;
  decimals: number;
  amount: bigint | null;
  unlimited: boolean;
  spender: string;
  /** From CRYPY's own list of known contracts only. */
  spenderName: string | null;
  /** Permit2: unix seconds. */
  expiration: number | null;
}

export function approvalAlerts(
  chain: ChainInfo,
  approvals: ConfirmedApproval[],
  targets: Map<string, WatchTarget[]>,
): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  for (const a of approvals) {
    for (const target of targets.get(a.owner) ?? []) {
      if (!target.rules.approvals.on) continue;
      const name = nameOf(target);
      const spender = a.spenderName ?? shortenId(a.spender);
      const what =
        a.kind === "nft-all"
          ? `all ${a.symbol} NFTs`
          : a.unlimited
            ? `unlimited ${a.symbol}`
            : `${formatAmount((a.amount ?? 0n).toString(), a.decimals, "en-US")} ${a.symbol}`;
      const lines = [`${spender} can move ${what} on ${chain.name}.`];
      if (a.kind === "permit2")
        lines.push(
          `Given through Permit2${a.expiration ? `, until ${new Date(a.expiration * 1000).toISOString().slice(0, 10)}` : ""}.`,
        );
      if (!a.spenderName) lines.push(`Spender: ${a.spender}`);
      lines.push("Didn't do this? Revoke it in CRYPY.");
      drafts.push({
        userId: target.userId,
        itemId: target.itemId,
        kind: "approval",
        severity: "warn",
        chain: chain.key,
        title: `New approval on ${name}: ${what}`,
        details: {
          summary: `${name} → ${spender} · ${chain.name}`,
          lines,
          path: `/address/${a.owner}/approvals?chains=${chain.key}`,
          muteItemId: target.itemId,
        },
        dedupeKey: `appr:${chain.key}:${a.txHash}:${a.logIndex}:${target.itemId}`,
      });
    }
  }
  return drafts;
}

// ---- Hourly checks ----------------------------------------------------------------------------------------------

export interface ValuePoint {
  at: number;
  usd: number;
}

/** Keeps about two days of hourly values. */
export function addValuePoint(points: ValuePoint[], point: ValuePoint): ValuePoint[] {
  return [...points.filter((p) => p.at > point.at - 50 * 3_600_000 && p.at < point.at), point];
}

/** The fall over about a day (the value 23–26 hours ago vs now), when it is at least `percent`. */
export function valueDrop(
  points: ValuePoint[],
  now: number,
  percent: number,
): { before: number; after: number; fall: number } | null {
  const current = points.at(-1);
  if (!current) return null;
  const candidates = points.filter((p) => p.at <= now - 23 * 3_600_000 && p.at >= now - 26 * 3_600_000);
  const before = candidates.sort(
    (a, b) => Math.abs(a.at - (now - 86_400_000)) - Math.abs(b.at - (now - 86_400_000)),
  )[0];
  if (!before || before.usd < 10) return null;
  const fall = (before.usd - current.usd) / before.usd;
  return fall >= percent / 100 ? { before: before.usd, after: current.usd, fall } : null;
}

export function valueDropAlert(
  target: WatchTarget,
  drop: { before: number; after: number; fall: number },
  now: number,
): AlertDraft {
  const name = nameOf(target);
  const pct = Math.round(drop.fall * 100);
  return {
    userId: target.userId,
    itemId: target.itemId,
    kind: "value-drop",
    severity: "warn",
    chain: "",
    title: `${name} fell ${pct}% in a day`,
    details: {
      summary: `${fmtUsd(drop.before)} → ${fmtUsd(drop.after)} · all chains`,
      lines: [
        `Value now ${fmtUsd(drop.after)}, about a day ago ${fmtUsd(drop.before)} (today's prices, tokens with a reliable price).`,
        "A change in value, not profit or loss: prices moving and coins sent out both count.",
      ],
      path: `/address/${target.address}`,
      muteItemId: target.itemId,
    },
    dedupeKey: `drop:${new Date(now).toISOString().slice(0, 10)}:${target.itemId}`,
  };
}

/** What the token checks found last time, to tell what changed. */
export interface SecuritySnapshot {
  level: "serious" | "risks" | "warnings" | "none-found";
  trade: string;
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
  /** Ids of critical and high risks. */
  risks: string[];
}

export interface LiquiditySnapshot {
  totalUsd: number;
  /** Burned or locked for more than 30 days (0–1). */
  protectedShare: number;
  /** In the owner's or wallets' hands (0–1). */
  removableShare: number;
  nextUnlock: { at: number; share: number } | null;
}

const LEVEL_ORDER = ["none-found", "warnings", "risks", "serious"] as const;
const LEVEL_TEXT: Record<SecuritySnapshot["level"], string> = {
  serious: "Serious risks found",
  risks: "Risks found",
  warnings: "Some warnings",
  "none-found": "No major risks found",
};
const pctText = (x: number) => `${Math.round(x * 100)}%`;

/** Plain-language changes from `before` to `after`; empty when nothing worth an alert changed. */
export function securityChanges(
  before: SecuritySnapshot,
  after: SecuritySnapshot,
  riskTitle: (id: string) => string,
): string[] {
  const changes: string[] = [];
  const failing: Record<string, string> = {
    "sell-failed": "Selling now fails in the trade test",
    "buy-failed": "Buying now fails in the trade test",
    "buy-nothing": "Buying now gives nothing in the trade test",
    "transfer-failed": "Transfers now fail in the trade test",
  };
  if (after.trade !== before.trade && failing[after.trade]) changes.push(failing[after.trade]!);
  for (const [label, b, a] of [
    ["Sell tax", before.sellTax, after.sellTax],
    ["Buy tax", before.buyTax, after.buyTax],
    ["Transfer tax", before.transferTax, after.transferTax],
  ] as const) {
    if (a !== null && b !== null && a - b >= 0.05) changes.push(`${label} went from ${pctText(b)} to ${pctText(a)}`);
  }
  for (const id of after.risks.filter((r) => !before.risks.includes(r))) changes.push(`New risk: ${riskTitle(id)}`);
  if (LEVEL_ORDER.indexOf(after.level) > LEVEL_ORDER.indexOf(before.level))
    changes.push(`Result changed from "${LEVEL_TEXT[before.level]}" to "${LEVEL_TEXT[after.level]}"`);
  return changes;
}

export function liquidityChanges(before: LiquiditySnapshot, after: LiquiditySnapshot, nowSec: number): string[] {
  const changes: string[] = [];
  if (before.protectedShare - after.protectedShare >= 0.1)
    changes.push(
      `Burned or locked liquidity fell from ${pctText(before.protectedShare)} to ${pctText(after.protectedShare)}`,
    );
  if (after.removableShare - before.removableShare >= 0.1)
    changes.push(
      `Liquidity the owner or wallets can remove rose from ${pctText(before.removableShare)} to ${pctText(after.removableShare)}`,
    );
  if (before.totalUsd > 0 && (before.totalUsd - after.totalUsd) / before.totalUsd >= 0.5)
    changes.push(`Liquidity fell from ${fmtUsd(before.totalUsd)} to ${fmtUsd(after.totalUsd)}`);
  const next = after.nextUnlock;
  if (
    next &&
    next.share >= 0.05 &&
    next.at - nowSec <= 7 * 86_400 &&
    (!before.nextUnlock || before.nextUnlock.at !== next.at || before.nextUnlock.at - nowSec > 7 * 86_400)
  )
    changes.push(
      `A lock on ${pctText(next.share)} of the liquidity ends on ${new Date(next.at * 1000).toISOString().slice(0, 10)}`,
    );
  return changes;
}

export function tokenAlert(
  kind: "security" | "liquidity",
  item: { itemId: string; userId: string; label: string; chain: string; address: string },
  chain: ChainInfo,
  symbol: string,
  changes: string[],
  now: number,
): AlertDraft {
  const name = item.label || symbol || shortenId(item.address);
  return {
    userId: item.userId,
    itemId: item.itemId,
    kind,
    severity: "danger",
    chain: chain.key,
    title: `${name}: ${changes[0]!.charAt(0).toLowerCase()}${changes[0]!.slice(1)}`,
    details: {
      summary: `${kind === "security" ? "Security result changed" : "Liquidity changed"} · ${chain.name}`,
      lines: [
        ...changes,
        kind === "security"
          ? "Signals from CRYPY's checks; never a safe verdict."
          : "Read on-chain; holders CRYPY couldn't identify are not counted as safe.",
      ],
      path: `/token/${chain.key}/${item.address}`,
      muteItemId: item.itemId,
    },
    // One alert per change per hour at most (the hourly check), the same change not again the same day.
    dedupeKey: `${kind}:${item.itemId}:${new Date(now).toISOString().slice(0, 10)}:${changes.join("|").slice(0, 200)}`,
  };
}
