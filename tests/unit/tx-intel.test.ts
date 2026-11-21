/**
 * Transaction intelligence engine: actions, permissions, route and parties.
 * The main case uses the real receipt logs of a KyberSwap TATA→BNB swap on BNB Chain
 * (0xadf65326…b58d, block 111798830), saved in tests/fixtures. Pool and allowance facts were read live on 2026-11-20.
 * The engine has no rule for this transaction: these tests check that generic rules explain it.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, pad, toEventSelector } from "viem";
import logs from "../fixtures/tata-logs.json";
import type { TxDetails } from "@/lib/chains/types";
import { detectActions, involvedParties, permissionGroups } from "@/lib/tx/actions";
import { interpret } from "@/lib/tx/interpret";
import { buildRoute } from "@/lib/tx/route";
import { parseTxLogs } from "@/server/chains/evm/tx-logs";

const WALLET = "0x0bff3366a7cf7Cb98ca95e5481B557e2FF8028e1";
const ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const TATA = "0x6f112c6AaF661684E99f1b4A45F861587c0595F1";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const POOL = "0x9ad7eEe97891Fa30c808904fA7d1Ddc3313E6649";
const HELPER = "0x8F10B468b06c6FD214B65F87778827F7D113f996";
const FEE_TO = "0xcD6b980029E6E6e0733ac8eC3E02be9410D09799";
const PANCAKE_V2 = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const OUT = 3_725_998_343_504_062n;

function base(over: Partial<TxDetails> = {}): TxDetails {
  const parsed = parseTxLogs(logs, WBNB);
  return {
    chain: "bsc",
    hash: "0xadf65326e84d22326edceb6dd8f4a8e388a3eacc3940ff634110191576e0b58d",
    status: "success",
    blockNumber: "111798830",
    from: WALLET,
    to: ROUTER,
    timestamp: 1_784_869_229,
    confirmations: 100,
    finalized: null,
    nonce: 195,
    type: "legacy",
    value: "0",
    gasLimit: "397749",
    gasUsed: "203974",
    gasPrice: "52000000",
    fee: "10606648000000",
    l1Fee: null,
    burnt: null,
    createdContract: null,
    toIsContract: true,
    input: { bytes: 0, preview: "0x", truncated: false },
    call: null,
    logCount: logs.length,
    otherEvents: 0,
    transfers: parsed.transfers,
    approvals: parsed.approvals,
    logsTruncated: false,
    tokens: {
      [TATA.toLowerCase()]: { address: TATA, name: "TATA Coin", symbol: "TATA", decimals: 18 },
      [WBNB.toLowerCase()]: { address: WBNB, name: "Wrapped BNB", symbol: "WBNB", decimals: 18 },
    },
    revertReason: null,
    prices: {},
    pricesAtTx: null,
    technical: {
      chainId: 56,
      blockHash: null,
      index: 42,
      baseFee: null,
      priorityFee: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    },
    events: logs.map((l) => ({ index: l.logIndex, address: l.address, topics: l.topics, data: l.data, dataBytes: 0 })),
    nonceUsed: null,
    checkedAt: 0,
    protocolEvents: parsed.protocolEvents,
    pools: {
      [POOL.toLowerCase()]: {
        address: POOL,
        version: "v2",
        token0: TATA,
        token1: WBNB,
        fee: null,
        factory: PANCAKE_V2,
        dex: "PancakeSwap v2",
        verified: true,
      },
    },
    allowances: [{ token: TATA, owner: WALLET, spender: ROUTER, before: null, now: "0" }],
    nativeBalance: null,
    codes: { [FEE_TO.toLowerCase()]: false, [HELPER.toLowerCase()]: true },
    ...over,
  };
}

describe("real KyberSwap swap (TATA → BNB)", () => {
  it("decodes the pool, router and permission events", () => {
    const tx = base();
    expect(tx.transfers.map((t) => t.logIndex)).toEqual([378, 381, 383, 387]);
    expect(tx.approvals.map((a) => [a.logIndex, a.amount])).toEqual([
      [379, "390084794224063614530"],
      [382, "0"],
    ]);
    expect(tx.protocolEvents.map((e) => e.type)).toEqual([
      "pool-sync",
      "pool-swap",
      "router-swapped",
      "router-exchange",
      "router-client",
    ]);
    expect(tx.protocolEvents.find((e) => e.type === "router-swapped")).toMatchObject({
      tokenIn: TATA,
      tokenOut: "native",
      recipient: WALLET,
      amountOut: OUT.toString(),
    });
  });

  it("reads the allowance changes as a permission being used, not granted", () => {
    const [group] = permissionGroups(base());
    expect(group!.steps.map((s) => [s.change, s.usedBy, s.evidence])).toEqual([
      ["used", 378, "interpreted"], // first value before is unknown: derived from the transfer next to it
      ["used", 381, "event"], // 390.08 → 0 matched exactly by the 390.08 transfer
    ]);
    expect(group!.before).toEqual({ raw: "391062450349938460681", evidence: "interpreted" });
    expect(group!.after).toBe("0");
    expect(group!.now).toBe("0");
    expect(group!.onlyUsed).toBe(true);
  });

  it("uses the chain's earlier allowance when available", () => {
    const tx = base({
      allowances: [{ token: TATA, owner: WALLET, spender: ROUTER, before: "391062450349938460681", now: "0" }],
    });
    const [group] = permissionGroups(tx);
    expect(group!.before?.evidence).toBe("chain");
    expect(group!.steps.every((s) => s.change === "used" && s.evidence === "event")).toBe(true);
  });

  it("explains 11 of 13 events and lists the other two", () => {
    const { actions, coverage } = detectActions(base(), "BNB");
    expect(coverage).toMatchObject({ total: 13, explained: 11 });
    expect(coverage.unexplained.map((e) => e.index)).toEqual([380, 386]);
    expect(actions.find((a) => a.type === "pool-swap")).toMatchObject({ evidence: "protocol", dex: "PancakeSwap v2" });
    expect(actions.find((a) => a.type === "router-swap")).toMatchObject({ evidence: "reported", app: "rabby" });
  });

  it("builds the route and marks the side payment only as a possible fee", () => {
    const route = buildRoute(base(), detectActions(base(), "BNB"), "BNB")!;
    expect(route.mode).toBe("path");
    expect(route.returnsToStart).toBe(true);
    expect(route.path.map((e) => [e.kind, e.to])).toEqual([
      ["transfer", POOL],
      ["transfer", HELPER],
      ["unwrap", HELPER],
      ["reported", WALLET],
    ]);
    expect(route.path.at(-1)!.evidence).toBe("reported");
    expect(route.side).toEqual([expect.objectContaining({ to: FEE_TO, possibleFee: true, evidence: "event" })]);
  });

  it("headline: a swap that relies on the router's report for the BNB side", () => {
    const it = interpret(base(), "BNB");
    expect(it).toMatchObject({ kind: "swap", evidence: "reported", values: { via: "PancakeSwap v2", app: "rabby" } });
    expect(it.values.amountOut).toMatchObject({ token: TATA, raw: "391062450349938460681" });
    expect(it.values.amountIn).toMatchObject({ token: "native", raw: OUT.toString() });
    expect(it.changes.find((c) => c.asset.token === "native")?.evidence).toBe("reported");
  });

  it("a matching measured balance change upgrades the BNB side to a chain fact", () => {
    const fee = 10_606_648_000_000n;
    const before = 10n ** 18n;
    const tx = base({
      nativeBalance: { address: WALLET, before: before.toString(), after: (before - fee + OUT).toString() },
    });
    const it = interpret(tx, "BNB");
    expect(it.evidence).toBe("confirmed");
    expect(it.changes.find((c) => c.asset.token === "native")).toMatchObject({ evidence: "chain", sign: 1 });
    expect(buildRoute(tx, it.set, "BNB")!.path.at(-1)!.evidence).toBe("chain");
  });

  it("lists who was involved with neutral roles", () => {
    const tx = base();
    const set = detectActions(tx, "BNB");
    const parties = involvedParties(tx, set, [FEE_TO]);
    const roles = Object.fromEntries(parties.map((p) => [p.address, p.roles]));
    expect(roles[WALLET]).toEqual(["sender"]);
    expect(roles[ROUTER]).toEqual(expect.arrayContaining(["called", "router", "spender"]));
    expect(roles[POOL]).toEqual(["pool"]);
    expect(roles[HELPER]).toEqual(["intermediary"]);
    expect(roles[FEE_TO]).toEqual(["possible-fee"]);
    expect(parties.find((p) => p.address === FEE_TO)?.isContract).toBe(false);
  });
});

// ---------- generic rules on synthetic events (made-up addresses) ----------

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const word = (n: bigint) => pad(`0x${n.toString(16)}`, { size: 32 });
const topicOf = (sig: string) => toEventSelector(sig);
const TRANSFER = topicOf("event Transfer(address indexed from, address indexed to, uint256 value)");
const transferLog = (token: string, from: string, to: string, amount: bigint, logIndex: number) => ({
  address: token,
  topics: [TRANSFER, pad(from as `0x${string}`), pad(to as `0x${string}`)],
  data: word(amount),
  logIndex,
});

describe("generic rules", () => {
  it("ignores a router-style event from a contract we don't know", () => {
    const swapped = topicOf(
      "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)",
    );
    const data = encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [WALLET, TATA, "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", WALLET, 1n, 10n ** 18n],
    );
    const parsed = parseTxLogs([{ address: C, topics: [swapped], data, logIndex: 0 }]);
    expect(parsed.protocolEvents[0]?.type).toBe("router-swapped");
    const tx = base({
      transfers: [],
      approvals: [],
      protocolEvents: parsed.protocolEvents,
      allowances: [],
      logCount: 1,
      events: [],
    });
    expect(detectActions(tx, "BNB").actions.some((a) => a.type === "router-swap")).toBe(false);
    expect(interpret(tx, "BNB").changes).toEqual([]);
  });

  it("an unverified pool's swap is a standard event, not a verified protocol action", () => {
    const tx = base({
      pools: { [POOL.toLowerCase()]: { ...base().pools[POOL.toLowerCase()]!, verified: false, dex: null } },
    });
    expect(detectActions(tx, "BNB").actions.find((a) => a.type === "pool-swap")?.evidence).toBe("event");
  });

  it("splits v3 signed amounts into in and out", () => {
    const v3 = topicOf(
      "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    );
    const data = encodeAbiParameters(
      [{ type: "int256" }, { type: "int256" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }],
      [-500n, 1_000n, 1n, 1n, 0],
    );
    const [event] = parseTxLogs([{ address: C, topics: [v3, pad(A), pad(B)], data, logIndex: 4 }]).protocolEvents;
    expect(event).toMatchObject({
      type: "pool-swap",
      version: "v3",
      amount0Out: "500",
      amount1In: "1000",
      amount0In: "0",
      amount1Out: "0",
    });
  });

  it("separate payments to several wallets are listed, not joined into a route", () => {
    const parsed = parseTxLogs([
      transferLog(TATA, A, B, 5n, 0),
      transferLog(TATA, A, C, 6n, 1),
      transferLog(TATA, A, ROUTER, 7n, 2),
    ]);
    const tx = base({
      from: A,
      to: TATA,
      transfers: parsed.transfers,
      approvals: [],
      protocolEvents: [],
      allowances: [],
      pools: {},
    });
    const route = buildRoute(tx, detectActions(tx, "BNB"), "BNB")!;
    expect(route.mode).toBe("relations");
    expect(route.side).toHaveLength(3);
  });

  it("an approve call that sets an allowance is not mistaken for permission use", () => {
    const approvalTopic = topicOf("event Approval(address indexed owner, address indexed spender, uint256 value)");
    const parsed = parseTxLogs([
      { address: TATA, topics: [approvalTopic, pad(A), pad(B)], data: word(100n), logIndex: 0 },
    ]);
    const tx = base({
      from: A,
      to: TATA,
      transfers: [],
      approvals: parsed.approvals,
      protocolEvents: [],
      allowances: [],
      pools: {},
    });
    const [group] = permissionGroups(tx);
    expect(group!.steps[0]).toMatchObject({ change: "set", evidence: "event" });
    expect(interpret(tx, "BNB").kind).toBe("approval");
  });

  it("a failed transaction has no actions or permissions", () => {
    const set = detectActions(base({ status: "reverted" }), "BNB");
    expect(set.actions).toEqual([]);
    expect(set.permissions).toEqual([]);
  });
});
