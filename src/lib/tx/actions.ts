/**
 * Transaction intelligence: the separate actions inside one transaction, the permissions it changed, and the
 * parties involved, each with its evidence. Pure and deterministic (no network, no AI, no per-transaction rules).
 *
 * Principles:
 * - an event is a fact about what a contract logged; who emitted it decides how much it is worth
 *   (a pool its factory lists → protocol; a known router's summary → reported; an unknown contract → not used);
 * - when a value is derived rather than read, it is marked "interpreted";
 * - events we can't explain are counted and listed, never guessed.
 */
import { burnAddresses, knownContract, type KnownContract } from "@/config/known-contracts";
import type { TxApproval, TxDetails, TxPool } from "@/lib/chains/types";
import {
  type AssetAmount,
  type EvidenceLevel,
  ZERO_ADDRESS,
  assetOf,
  lower,
  nativeAsset,
  protocolAsset,
} from "./assets";

export type ActionType =
  | "native-transfer"
  | "token-transfer"
  | "nft-transfer"
  | "mint"
  | "burn"
  | "wrap"
  | "unwrap"
  | "pool-swap"
  | "liquidity-add"
  | "liquidity-remove"
  | "permission-granted"
  | "permission-modified"
  | "permission-set"
  | "permission-used"
  | "permission-revoked"
  | "router-swap"
  | "contract-creation"
  | "smart-wallet"
  | "user-operation";

export interface TxAction {
  type: ActionType;
  evidence: EvidenceLevel;
  /** Receipt log indexes this action explains (empty for chain-level facts such as the coin value). */
  logs: number[];
  from?: string;
  to?: string;
  asset?: AssetAmount;
  /** Swaps: what went in and what came out. */
  assetIn?: AssetAmount;
  assetOut?: AssetAmount;
  pool?: string;
  dex?: string | null;
  owner?: string;
  spender?: string;
  unlimited?: boolean;
  /** Permissions: allowance before / after this step (null before when unknown). */
  before?: AssetAmount | null;
  after?: AssetAmount;
  router?: string;
  /** App named in a router report (router-reported, sanitized). */
  app?: string | null;
  success?: boolean;
}

// ---------- permissions ----------

export type PermissionChange = "granted" | "modified" | "set" | "used" | "revoked";

export interface PermissionStep {
  logIndex: number;
  change: PermissionChange;
  /** Allowance after this event (raw). For "all" approvals: "1" granted / "0" removed. */
  value: string;
  unlimited: boolean;
  /** "used": the transfer (log index) that used the permission. */
  usedBy: number | null;
  evidence: EvidenceLevel;
}

export interface PermissionGroup {
  kind: TxApproval["kind"];
  token: string;
  owner: string;
  spender: string;
  steps: PermissionStep[];
  /** Allowance before the transaction: read from the chain, derived from events, or unknown. */
  before: { raw: string; evidence: EvidenceLevel } | null;
  /** Allowance at the end of the transaction, from its last event. */
  after: string;
  /** Read from the chain when the page was built (null: not read / not readable). */
  now: string | null;
  /** True when every step was the permission being used (a swap spending an earlier approval). */
  onlyUsed: boolean;
}

const HALF_UINT = 1n << 255n;
const APPROVE_CALLS = new Set(["approve", "increase-allowance", "decrease-allowance", "permit2-approve", "permit"]);
/** How far (in log positions) a token's own Approval event can be from the Transfer it accompanies. */
const ADJACENT = 2;

export function permissionGroups(tx: TxDetails): PermissionGroup[] {
  const groups = new Map<string, TxApproval[]>();
  for (const approval of tx.approvals) {
    const key = `${approval.kind}:${approval.token}:${approval.owner}:${approval.spender}`.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), approval]);
  }
  const callIsApprove = tx.call?.status === "decoded" && APPROVE_CALLS.has(tx.call.key ?? "");
  const usedTransfers = new Set<number>();
  const out: PermissionGroup[] = [];

  for (const list of groups.values()) {
    const first = list[0]!;
    const sorted = [...list].sort((a, b) => a.logIndex - b.logIndex);
    if (first.kind !== "amount") {
      const steps: PermissionStep[] = sorted.map((a) => ({
        logIndex: a.logIndex,
        change: a.revoke ? "revoked" : "granted",
        value: a.amount,
        unlimited: a.unlimited,
        usedBy: null,
        evidence: "event",
      }));
      out.push({
        kind: first.kind,
        token: first.token,
        owner: first.owner,
        spender: first.spender,
        steps,
        before: null,
        after: sorted.at(-1)!.amount,
        now: null,
        onlyUsed: false,
      });
      continue;
    }

    const read = tx.allowances.find(
      (r) =>
        lower(r.token) === lower(first.token) &&
        lower(r.owner) === lower(first.owner) &&
        lower(r.spender) === lower(first.spender),
    );
    let before: PermissionGroup["before"] = read?.before != null ? { raw: read.before, evidence: "chain" } : null;
    let prev: bigint | null = before ? BigInt(before.raw) : null;
    const steps: PermissionStep[] = [];

    for (const approval of sorted) {
      const value = BigInt(approval.amount);
      // A transfer of the same token out of the owner's wallet, right next to this event, not yet matched.
      const candidates = tx.transfers.filter(
        (t) =>
          t.standard === "erc20" &&
          lower(t.token) === lower(approval.token) &&
          lower(t.from) === lower(approval.owner) &&
          Math.abs(t.logIndex - approval.logIndex) <= ADJACENT &&
          !usedTransfers.has(t.logIndex),
      );
      let step: PermissionStep;
      if (prev !== null) {
        const match = candidates.find((t) => value < prev! && prev! - value === BigInt(t.amount));
        if (match) {
          usedTransfers.add(match.logIndex);
          step = {
            logIndex: approval.logIndex,
            change: "used",
            value: approval.amount,
            unlimited: false,
            usedBy: match.logIndex,
            evidence: "event",
          };
        } else if (value === 0n) {
          step = {
            logIndex: approval.logIndex,
            change: "revoked",
            value: "0",
            unlimited: false,
            usedBy: null,
            evidence: "event",
          };
        } else if (prev === 0n) {
          step = {
            logIndex: approval.logIndex,
            change: "granted",
            value: approval.amount,
            unlimited: value >= HALF_UINT,
            usedBy: null,
            evidence: "event",
          };
        } else {
          step = {
            logIndex: approval.logIndex,
            change: value === prev ? "set" : "modified",
            value: approval.amount,
            unlimited: value >= HALF_UINT,
            usedBy: null,
            evidence: "event",
          };
        }
      } else {
        // The value before is unknown. A transfer out of the owner next to the event (and no approve call)
        // is the usual sign of a permission being used; the earlier value is then derived, not read.
        const match = !callIsApprove ? candidates[0] : undefined;
        if (match) {
          usedTransfers.add(match.logIndex);
          before = { raw: (value + BigInt(match.amount)).toString(), evidence: "interpreted" };
          step = {
            logIndex: approval.logIndex,
            change: "used",
            value: approval.amount,
            unlimited: false,
            usedBy: match.logIndex,
            evidence: "interpreted",
          };
        } else if (value === 0n) {
          step = {
            logIndex: approval.logIndex,
            change: "revoked",
            value: "0",
            unlimited: false,
            usedBy: null,
            evidence: "event",
          };
        } else {
          step = {
            logIndex: approval.logIndex,
            change: "set",
            value: approval.amount,
            unlimited: value >= HALF_UINT,
            usedBy: null,
            evidence: "event",
          };
        }
      }
      steps.push(step);
      prev = value;
    }
    out.push({
      kind: "amount",
      token: first.token,
      owner: first.owner,
      spender: first.spender,
      steps,
      before,
      after: sorted.at(-1)!.amount,
      now: read?.now ?? null,
      onlyUsed: steps.every((s) => s.change === "used"),
    });
  }
  return out;
}

// ---------- actions ----------

function poolAssets(tx: TxDetails, pool: TxPool | undefined, a0: bigint, a1: bigint) {
  if (!pool) return null;
  return {
    t0: assetOf(tx, pool.token0, "erc20", a0),
    t1: assetOf(tx, pool.token1, "erc20", a1),
  };
}

export interface ActionSet {
  actions: TxAction[];
  permissions: PermissionGroup[];
  /** Events in the receipt and how many of them an action explains. */
  coverage: { total: number; explained: number; unexplained: { index: number; address: string; topic: string }[] };
}

export function detectActions(tx: TxDetails, nativeSymbol: string): ActionSet {
  const actions: TxAction[] = [];
  const permissions = tx.status === "success" ? permissionGroups(tx) : [];
  if (tx.status !== "success") {
    return { actions, permissions, coverage: { total: tx.logCount, explained: 0, unexplained: [] } };
  }

  // Chain-level facts.
  const value = BigInt(tx.value);
  if (!tx.to && tx.createdContract) {
    actions.push({ type: "contract-creation", evidence: "chain", logs: [], from: tx.from, to: tx.createdContract });
  }
  if (value > 0n && tx.to) {
    actions.push({
      type: "native-transfer",
      evidence: "chain",
      logs: [],
      from: tx.from,
      to: tx.to,
      asset: nativeAsset(value, nativeSymbol),
    });
  }

  // Smart wallets first: they explain who really acted.
  for (const event of tx.protocolEvents) {
    if (event.type === "user-op" && knownContract(tx.chain, event.emitter)?.reports === "erc4337") {
      actions.push({
        type: "user-operation",
        evidence: "protocol",
        logs: [event.logIndex],
        from: event.sender,
        router: event.emitter,
        success: event.success,
      });
    }
    if (event.type === "safe-exec") {
      actions.push({
        type: "smart-wallet",
        evidence: "event",
        logs: [event.logIndex],
        from: event.emitter,
        success: event.success,
      });
    }
  }

  // Permissions, step by step.
  for (const group of permissions) {
    for (const step of group.steps) {
      const amount = (raw: string) =>
        group.kind === "amount"
          ? assetOf(tx, group.token, "erc20", BigInt(raw))
          : assetOf(tx, group.token, "erc721", 0n);
      const type: ActionType =
        step.change === "used"
          ? "permission-used"
          : step.change === "revoked"
            ? "permission-revoked"
            : step.change === "granted"
              ? "permission-granted"
              : step.change === "modified"
                ? "permission-modified"
                : "permission-set";
      const usedBy = step.usedBy !== null ? tx.transfers.find((t) => t.logIndex === step.usedBy) : undefined;
      actions.push({
        type,
        evidence: step.evidence,
        logs: [step.logIndex],
        owner: group.owner,
        spender: group.spender,
        unlimited: step.unlimited,
        after: amount(step.value),
        ...(usedBy ? { asset: assetOf(tx, usedBy.token, "erc20", BigInt(usedBy.amount)), to: usedBy.to } : {}),
      });
    }
  }

  // Token movements.
  for (const t of tx.transfers) {
    const amount = BigInt(t.amount);
    const asset = assetOf(tx, t.token, t.standard, amount, t.tokenId);
    const base = { evidence: "event" as const, logs: [t.logIndex], from: t.from, to: t.to, asset };
    if (t.standard === "wrap") actions.push({ ...base, type: "wrap", from: t.to });
    else if (t.standard === "unwrap") actions.push({ ...base, type: "unwrap" });
    else if (lower(t.from) === ZERO_ADDRESS) actions.push({ ...base, type: "mint" });
    else if (burnAddresses[lower(t.to)]) actions.push({ ...base, type: "burn" });
    else if (t.standard === "erc721" || t.standard === "erc1155") actions.push({ ...base, type: "nft-transfer" });
    else actions.push({ ...base, type: "token-transfer" });
  }

  // Pools.
  const poolActions = new Map<string, TxAction[]>();
  for (const event of tx.protocolEvents) {
    if (event.type !== "pool-swap" && event.type !== "pool-mint" && event.type !== "pool-burn") continue;
    const pool = tx.pools[lower(event.pool)];
    const evidence: EvidenceLevel = pool?.verified ? "protocol" : "event";
    let action: TxAction;
    if (event.type === "pool-swap") {
      const into = poolAssets(tx, pool, BigInt(event.amount0In), BigInt(event.amount1In));
      const outOf = poolAssets(tx, pool, BigInt(event.amount0Out), BigInt(event.amount1Out));
      const assetIn = into ? (BigInt(event.amount0In) > 0n ? into.t0 : into.t1) : undefined;
      const assetOut = outOf ? (BigInt(event.amount0Out) > 0n ? outOf.t0 : outOf.t1) : undefined;
      action = {
        type: "pool-swap",
        evidence,
        logs: [event.logIndex],
        pool: event.pool,
        dex: pool?.dex ?? null,
        to: event.recipient,
        from: event.sender,
        assetIn,
        assetOut,
      };
    } else {
      const assets = poolAssets(tx, pool, BigInt(event.amount0), BigInt(event.amount1));
      action = {
        type: event.type === "pool-mint" ? "liquidity-add" : "liquidity-remove",
        evidence,
        logs: [event.logIndex],
        pool: event.pool,
        dex: pool?.dex ?? null,
        from: event.sender,
        to: event.type === "pool-burn" ? event.recipient : undefined,
        assetIn: assets?.t0,
        assetOut: assets?.t1,
      };
    }
    actions.push(action);
    poolActions.set(lower(event.pool), [...(poolActions.get(lower(event.pool)) ?? []), action]);
  }
  // A pool's Sync event is its balance update for the nearest swap / liquidity change of the same pool.
  for (const event of tx.protocolEvents) {
    if (event.type !== "pool-sync") continue;
    const candidates = poolActions.get(lower(event.pool)) ?? [];
    const nearest = candidates
      .filter((a) => Math.abs(a.logs[0]! - event.logIndex) <= 3)
      .sort((a, b) => Math.abs(a.logs[0]! - event.logIndex) - Math.abs(b.logs[0]! - event.logIndex))[0];
    nearest?.logs.push(event.logIndex);
  }

  // Router reports: only from a known router whose events we read, and labelled as its own report.
  for (const event of tx.protocolEvents) {
    if (event.type !== "router-swapped") continue;
    if (knownContract(tx.chain, event.emitter)?.reports !== "kyberswap") continue;
    const related = tx.protocolEvents.filter(
      (e) => (e.type === "router-exchange" || e.type === "router-client") && lower(e.emitter) === lower(event.emitter),
    );
    const client = related.find((e) => e.type === "router-client");
    actions.push({
      type: "router-swap",
      evidence: "reported",
      logs: [event.logIndex, ...related.map((e) => e.logIndex)],
      router: event.emitter,
      from: event.sender,
      to: event.recipient,
      assetIn: protocolAsset(tx, event.tokenIn, BigInt(event.amountIn), nativeSymbol),
      assetOut: protocolAsset(tx, event.tokenOut, BigInt(event.amountOut), nativeSymbol),
      app: client?.type === "router-client" ? client.source : null,
    });
  }

  const explained = new Set(actions.flatMap((a) => a.logs));
  const unexplained = tx.events
    .filter((e) => !explained.has(e.index))
    .map((e) => ({ index: e.index, address: e.address, topic: (e.topics[0] ?? "").slice(0, 10) }));
  return {
    actions,
    permissions,
    coverage: { total: tx.logCount, explained: Math.min(explained.size, tx.logCount), unexplained },
  };
}

// ---------- parties ----------

export type PartyRole =
  | "sender"
  | "called"
  | "created"
  | "router"
  | "pool"
  | "intermediary"
  | "recipient"
  | "possible-fee"
  | "spender"
  | "token"
  | "smart-account"
  | "burn";

export interface InvolvedParty {
  address: string;
  roles: PartyRole[];
  known: KnownContract | null;
  isContract: boolean | null;
  pool?: TxPool;
}

const roleOrder: PartyRole[] = [
  "sender",
  "smart-account",
  "called",
  "created",
  "router",
  "pool",
  "intermediary",
  "recipient",
  "possible-fee",
  "spender",
  "token",
  "burn",
];

export function involvedParties(tx: TxDetails, set: ActionSet, possibleFees: string[] = []): InvolvedParty[] {
  const map = new Map<string, InvolvedParty>();
  const add = (address: string | null | undefined, role: PartyRole) => {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    const key = lower(address);
    const known = knownContract(tx.chain, key);
    const entry = map.get(key) ?? {
      address,
      roles: [],
      known,
      isContract: null as boolean | null,
      ...(tx.pools[key] ? { pool: tx.pools[key] } : {}),
    };
    if (!entry.roles.includes(role)) entry.roles.push(role);
    map.set(key, entry);
  };

  add(tx.from, "sender");
  if (tx.to) add(tx.to, "called");
  add(tx.createdContract, "created");
  for (const a of set.actions) {
    if (a.type === "router-swap") add(a.router, "router");
    if (a.type === "pool-swap" || a.type === "liquidity-add" || a.type === "liquidity-remove") add(a.pool, "pool");
    if (a.type === "user-operation") add(a.from, "smart-account");
  }
  for (const group of set.permissions) add(group.spender, "spender");
  for (const fee of possibleFees) add(fee, "possible-fee");

  // Who received tokens, and who received and passed them on (an intermediary such as a helper contract).
  const sent = new Set(tx.transfers.map((t) => lower(t.from)));
  for (const t of tx.transfers) {
    if (t.standard === "wrap" || t.standard === "unwrap") {
      add(t.standard === "wrap" ? t.to : t.from, "intermediary");
      continue;
    }
    const to = lower(t.to);
    if (burnAddresses[to]) add(t.to, "burn");
    else if (
      to === lower(tx.from) ||
      map.get(to)?.roles.includes("pool") ||
      map.get(to)?.roles.includes("possible-fee")
    )
      continue;
    else add(t.to, sent.has(to) ? "intermediary" : "recipient");
  }
  for (const token of Object.values(tx.tokens)) add(token.address, "token");

  // Contract or wallet: what the chain told us; never guessed.
  for (const [key, party] of map) {
    if (party.roles.includes("sender")) party.isContract = false;
    else if (party.roles.includes("token") || party.pool || party.roles.includes("created")) party.isContract = true;
    else if (key === lower(tx.to)) party.isContract = tx.toIsContract;
    else if (key in tx.codes) party.isContract = tx.codes[key]!;
    else if (party.known) party.isContract = party.known.kind !== "burn";
    party.roles.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b));
  }
  // A pool or router is also a recipient by nature; drop "recipient" when a stronger role explains it.
  return [...map.values()].sort((a, b) => roleOrder.indexOf(a.roles[0]!) - roleOrder.indexOf(b.roles[0]!));
}
