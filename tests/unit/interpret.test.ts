import { describe, expect, it } from "vitest";
import type { TxDetails, TxTransfer } from "@/lib/chains/types";
import { decodeCallData } from "@/modules/tools/tx-decoder/decode";
import { changesFor, explainFailure, interpret } from "@/lib/tx/interpret";

// Test fixtures only (made-up addresses), shaped like real TxDetails.
const ME = "0x1111111111111111111111111111111111111111";
const YOU = "0x2222222222222222222222222222222222222222";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ROUTER = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";
const POOL = "0x3333333333333333333333333333333333333333";
const ZERO = "0x0000000000000000000000000000000000000000";
const pad = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
const transferData = (to: string, amount: bigint) => `0xa9059cbb${pad(to)}${amount.toString(16).padStart(64, "0")}`;

function tx(over: Partial<TxDetails>): TxDetails {
  return {
    chain: "ethereum",
    hash: `0x${"ab".repeat(32)}`,
    status: "success",
    blockNumber: "100",
    from: ME,
    to: YOU,
    timestamp: 1_800_000_000,
    confirmations: 10,
    finalized: null,
    nonce: 1,
    type: "eip1559",
    value: "0",
    gasLimit: "100000",
    gasUsed: "50000",
    gasPrice: "1000000000",
    fee: "50000000000000",
    l1Fee: null,
    burnt: null,
    createdContract: null,
    toIsContract: false,
    input: { bytes: 0, preview: "0x", truncated: false },
    call: null,
    logCount: 0,
    otherEvents: 0,
    transfers: [],
    approvals: [],
    logsTruncated: false,
    tokens: {
      [USDC.toLowerCase()]: { address: USDC, name: "USD Coin", symbol: "USDC", decimals: 6 },
      [WETH.toLowerCase()]: { address: WETH, name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
    },
    revertReason: null,
    prices: {},
    pricesAtTx: null,
    technical: {
      chainId: 1,
      blockHash: null,
      index: null,
      baseFee: null,
      priorityFee: null,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    },
    events: [],
    nonceUsed: null,
    checkedAt: 0,
    protocolEvents: [],
    pools: {},
    allowances: [],
    nativeBalance: null,
    codes: {},
    ...over,
  };
}
let nextLog = 0;
const erc20 = (token: string, from: string, to: string, amount: bigint, logIndex = nextLog++): TxTransfer => ({
  standard: "erc20",
  token,
  from,
  to,
  amount: amount.toString(),
  logIndex,
});

describe("interpret", () => {
  it("plain coin transfer", () => {
    const r = interpret(tx({ value: "500000000000000000" }), "ETH");
    expect(r).toMatchObject({ kind: "native-send", evidence: "confirmed" });
    expect(r.values.amount).toMatchObject({ raw: "500000000000000000", symbol: "ETH" });
    expect(r.changes).toEqual([{ asset: expect.objectContaining({ token: "native" }), sign: -1, evidence: "chain" }]);
  });

  it("token transfer is confirmed by its event, not by the function name", () => {
    const call = decodeCallData(transferData(YOU, 150_000_000n));
    const r = interpret(
      tx({ to: USDC, toIsContract: true, call, transfers: [erc20(USDC, ME, YOU, 150_000_000n)] }),
      "ETH",
    );
    expect(r).toMatchObject({ kind: "token-send", evidence: "confirmed" });
    expect(r.values.amount).toMatchObject({ raw: "150000000", symbol: "USDC", decimals: 6 });
    expect(r.values.to?.address).toBe(YOU);
  });

  it("a 'transfer' call without any transfer event is not reported as a transfer", () => {
    const call = decodeCallData(transferData(YOU, 1n));
    const r = interpret(tx({ to: USDC, toIsContract: true, call }), "ETH");
    expect(r.kind).toBe("contract-call");
    expect(r.values.fn).toBe("transfer");
  });

  it("swap: one asset out and another back, through a known router", () => {
    const transfers = [
      erc20(USDC, ME, POOL, 31_010_000n),
      erc20(WETH, POOL, ROUTER, 17_900_000_000_000_000n),
      erc20(WETH, ROUTER, ME, 17_900_000_000_000_000n),
    ];
    const r = interpret(tx({ to: ROUTER, toIsContract: true, call: decodeCallData("0x12345678"), transfers }), "ETH");
    expect(r).toMatchObject({ kind: "swap", evidence: "decoded" });
    expect(r.values.amountOut).toMatchObject({ symbol: "USDC", raw: "31010000" });
    expect(r.values.amountIn).toMatchObject({ symbol: "WETH" });
    // Internal hops between pool and router are not part of the sender's changes.
    expect(r.changes).toHaveLength(2);
  });

  it("an exchange through an unknown contract is only 'likely' a swap", () => {
    const transfers = [erc20(USDC, ME, POOL, 1n), erc20(WETH, POOL, ME, 2n)];
    expect(
      interpret(tx({ to: POOL, toIsContract: true, call: decodeCallData("0x12345678"), transfers }), "ETH").evidence,
    ).toBe("likely");
  });

  it("unlimited approval and revoke", () => {
    const approval = {
      kind: "amount" as const,
      token: USDC,
      owner: ME,
      spender: ROUTER,
      amount: (2n ** 256n - 1n).toString(),
      unlimited: true,
      revoke: false,
      logIndex: 0,
    };
    const r = interpret(tx({ to: USDC, toIsContract: true, approvals: [approval] }), "ETH");
    expect(r).toMatchObject({ kind: "approval", evidence: "confirmed", values: { unlimited: true } });
    expect(r.values.spender?.known?.name).toContain("Uniswap");
    expect(
      interpret(tx({ to: USDC, approvals: [{ ...approval, amount: "0", unlimited: false, revoke: true }] }), "ETH")
        .kind,
    ).toBe("revoke");
  });

  it("mint, burn, wrap", () => {
    expect(interpret(tx({ transfers: [erc20(USDC, ZERO, ME, 5n)] }), "ETH").kind).toBe("mint");
    expect(
      interpret(tx({ transfers: [erc20(USDC, ME, "0x000000000000000000000000000000000000dEaD", 5n)] }), "ETH").kind,
    ).toBe("burn");
    const wrap: TxTransfer = { standard: "wrap", token: WETH, from: WETH, to: ME, amount: "1000", logIndex: 0 };
    const r = interpret(tx({ to: WETH, value: "1000", transfers: [wrap] }), "ETH");
    expect(r.kind).toBe("wrap");
    expect(r.changes.map((c) => [c.asset.token, c.sign])).toEqual([
      ["native", -1],
      [WETH, 1],
    ]);
  });

  it("contract creation and empty self-transaction", () => {
    expect(interpret(tx({ to: null, createdContract: POOL }), "ETH")).toMatchObject({
      kind: "creation",
      values: { to: { address: POOL } },
    });
    expect(interpret(tx({ to: ME }), "ETH")).toMatchObject({ kind: "self", evidence: "likely" });
  });

  it("unknown function with no events says nothing more than that", () => {
    const r = interpret(tx({ to: POOL, toIsContract: true, call: decodeCallData("0xdeadbeef") }), "ETH");
    expect(r).toMatchObject({ kind: "unknown-call", evidence: "unknown", changes: [] });
  });

  it("failed transfer: describes the attempt and shows no changes", () => {
    const call = decodeCallData(transferData(YOU, 563_970_000n));
    const r = interpret(
      tx({
        status: "reverted",
        to: USDC,
        toIsContract: true,
        call,
        revertReason: "ERC20: transfer amount exceeds balance",
      }),
      "ETH",
    );
    expect(r).toMatchObject({ kind: "token-send", changes: [], failure: { category: "balance", evidence: "decoded" } });
    expect(r.values.amount).toMatchObject({ raw: "563970000", symbol: "USDC" });
  });

  it("pending: intended action, no failure", () => {
    const r = interpret(tx({ status: "pending", blockNumber: null, value: "7" }), "ETH");
    expect(r).toMatchObject({ kind: "native-send", failure: null, changes: [] });
  });
});

describe("explainFailure", () => {
  const failed = (over: Partial<TxDetails>) => tx({ status: "reverted", ...over });
  it.each([
    ["ERC20InsufficientBalance", "balance"],
    ["ERC20: transfer amount exceeds allowance", "allowance"],
    ["UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT", "slippage"],
    ["PancakeRouter: EXPIRED", "deadline"],
    ["Ownable: caller is not the owner", "access"],
    ["Pausable: paused", "paused"],
    ["TransferHelper: TRANSFER_FROM_FAILED", "token-transfer"],
    ["Panic 0x11", "math"],
    ["Custom error 0x12345678", "custom"],
    ["Some other words", "message"],
  ])("%s → %s", (reason, category) => {
    expect(explainFailure(failed({ revertReason: reason })).category).toBe(category);
  });

  it("out of gas only as a likely cause when nearly all gas was used", () => {
    expect(explainFailure(failed({ revertReason: null, gasUsed: "99500" }))).toMatchObject({
      category: "out-of-gas",
      evidence: "likely",
    });
    expect(explainFailure(failed({ revertReason: null, gasUsed: "40000" })).category).toBe("unavailable");
    expect(explainFailure(failed({ revertReason: "none", gasUsed: "40000" })).category).toBe("no-message");
  });
});

describe("changesFor", () => {
  it("nets several movements of the same token", () => {
    const r = changesFor(tx({ transfers: [erc20(USDC, ME, YOU, 10n), erc20(USDC, YOU, ME, 3n)] }), ME, "ETH");
    expect(r).toEqual([{ asset: expect.objectContaining({ raw: "7" }), sign: -1, evidence: "event" }]);
  });
});
