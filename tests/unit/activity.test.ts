import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { completeAbove, csvCell, groupTransfers, looksAlike, rateTransfers } from "@/lib/activity/evaluate";
import type { Transfer } from "@/lib/activity/types";
import { parseAlchemyTransfer } from "@/server/chains/evm/activity";

const ME = "0x4b2e000000000000000000000000000000091c7a";
const FRIEND = "0x1111222233334444555566667777888899990000";
const H = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const eth = getChain("ethereum")!;

// Shapes as documented for alchemy_getAssetTransfers (docs: transfers API reference).
const alchemy = {
  external: {
    category: "external",
    blockNum: "0x10",
    from: ME,
    to: FRIEND,
    asset: "ETH",
    hash: H(1),
    uniqueId: `${H(1)}:external`,
    rawContract: { value: "0xde0b6b3a7640000", address: null, decimal: "0x12" },
    metadata: { blockTimestamp: "2026-11-20T10:00:00.000Z" },
  },
  erc20: {
    category: "erc20",
    blockNum: "0x11",
    from: FRIEND,
    to: ME,
    asset: "USDT",
    hash: H(2),
    uniqueId: `${H(2)}:log:3`,
    rawContract: { value: "0x0f4240", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimal: "0x6" },
  },
  erc721: {
    category: "erc721",
    blockNum: "0x12",
    from: FRIEND,
    to: ME,
    asset: "CATS",
    hash: H(3),
    tokenId: "0x12d5",
    rawContract: { value: null, address: "0x0000000000000000000000000000000000000abc", decimal: null },
  },
  erc1155: {
    category: "erc1155",
    blockNum: "0x13",
    from: FRIEND,
    to: ME,
    asset: null,
    hash: H(4),
    erc1155Metadata: [{ tokenId: "0x1", value: "0x3" }],
    rawContract: { value: null, address: "0x0000000000000000000000000000000000000def", decimal: null },
  },
  internal: {
    category: "internal",
    blockNum: "0x14",
    from: FRIEND,
    to: ME,
    asset: "ETH",
    hash: H(5),
    rawContract: { value: "0x1", address: null, decimal: "0x12" },
  },
};

describe("Alchemy transfers → CRYPY transfers", () => {
  it("reads coins, tokens, NFTs and internal transfers with exact raw amounts", () => {
    const coin = parseAlchemyTransfer(alchemy.external, eth, ME)!;
    expect(coin).toMatchObject({
      kind: "coin",
      direction: "out",
      amount: "1000000000000000000",
      block: 16,
      internal: false,
    });
    expect(coin.asset).toMatchObject({ address: null, symbol: "ETH", decimals: 18 });
    expect(coin.time).toBe(Date.parse("2026-11-20T10:00:00Z") / 1000);
    const token = parseAlchemyTransfer(alchemy.erc20, eth, ME)!;
    expect(token).toMatchObject({ kind: "token", direction: "in", amount: "1000000", time: null });
    expect(token.asset).toMatchObject({
      symbol: "USDT",
      decimals: 6,
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    });
    expect(parseAlchemyTransfer(alchemy.erc721, eth, ME)).toMatchObject({
      kind: "nft",
      amount: "1",
      asset: { tokenId: "4821" },
    });
    expect(parseAlchemyTransfer(alchemy.erc1155, eth, ME)).toMatchObject({
      kind: "nft",
      amount: "3",
      asset: { tokenId: "1", symbol: "?" },
    });
    expect(parseAlchemyTransfer(alchemy.internal, eth, ME)).toMatchObject({
      kind: "coin",
      internal: true,
      amount: "1",
    });
  });
  it("drops junk, contract creations and transfers that don't involve the wallet", () => {
    expect(parseAlchemyTransfer({ ...alchemy.external, to: null }, eth, ME)).toBeNull();
    expect(parseAlchemyTransfer({ ...alchemy.external, hash: "0x12" }, eth, ME)).toBeNull();
    expect(parseAlchemyTransfer({ ...alchemy.external, from: FRIEND }, eth, ME)).toBeNull();
    expect(
      parseAlchemyTransfer({ ...alchemy.erc20, rawContract: { value: "0x1", address: null, decimal: null } }, eth, ME),
    ).toBeNull();
    expect(parseAlchemyTransfer("oops", eth, ME)).toBeNull();
    expect(parseAlchemyTransfer({ ...alchemy.erc20, asset: "‮evil​" }, eth, ME)!.asset.symbol).toBe("evil");
  });
});

describe("paging two newest-first streams", () => {
  it("only blocks above the oldest block of a full stream are complete", () => {
    expect(
      completeAbove([
        { blocks: [100, 90, 80], full: true },
        { blocks: [99, 50], full: false },
      ]),
    ).toBe(80);
    expect(
      completeAbove([
        { blocks: [100, 90], full: true },
        { blocks: [95, 85], full: true },
      ]),
    ).toBe(90);
    expect(
      completeAbove([
        { blocks: [100], full: false },
        { blocks: [], full: false },
      ]),
    ).toBeNull();
  });
});

const tr = (over: Partial<Transfer>): Transfer => ({
  id: Math.random().toString(36),
  chain: "bsc",
  hash: H(9),
  block: 1,
  time: 1_790_000_000,
  direction: "in",
  kind: "token",
  internal: false,
  from: FRIEND,
  to: ME,
  asset: { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18, tokenId: null },
  amount: "1000",
  valueNowUsd: 5,
  ...over,
});

describe("spam and address poisoning", () => {
  it("look-alike: same first and last four hex characters, different address", () => {
    expect(looksAlike("0x4b2e00000000000000000000000000000ff91c7a", ME)).toBe(true);
    expect(looksAlike(ME, ME)).toBe(false);
    expect(looksAlike(FRIEND, ME)).toBe(false);
  });
  it("flags zero or dust transfers from look-alikes of the wallet or of addresses it paid", () => {
    const fakeMe = "0x4b2e99999999999999999999999999999ff91c7a";
    const fakeFriend = "0x1111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000";
    const list = [
      tr({ direction: "out", from: ME, to: FRIEND, amount: "5" }),
      tr({ from: fakeMe, amount: "0" }),
      tr({ from: fakeFriend, amount: "1", valueNowUsd: 0.000001 }),
      tr({ from: fakeFriend, amount: "100", valueNowUsd: 100 }), // real value: not flagged
    ];
    const rated = rateTransfers(ME, list);
    expect(rated.map((t) => t.poisoning)).toEqual([null, ME.toLowerCase(), FRIEND.toLowerCase(), null]);
  });
  it("spam: hidden tokens, links or bait in the symbol, zero-value incoming tokens; coins never", () => {
    const hidden = new Set(["0x00000000000000000000000000000000000000aa"]);
    const rated = rateTransfers(
      ME,
      [
        tr({
          asset: { address: "0x00000000000000000000000000000000000000AA", symbol: "X", decimals: 18, tokenId: null },
        }),
        tr({
          asset: {
            address: "0x00000000000000000000000000000000000000bb",
            symbol: "visit-claim.com",
            decimals: 18,
            tokenId: null,
          },
        }),
        tr({
          asset: {
            address: "0x00000000000000000000000000000000000000cc",
            symbol: "$5000 REWARD",
            decimals: 18,
            tokenId: null,
          },
        }),
        tr({ amount: "0" }),
        tr({ kind: "coin", amount: "0", asset: { address: null, symbol: "BNB", decimals: 18, tokenId: null } }),
        tr({}),
      ],
      hidden,
    );
    expect(rated.map((t) => t.spam)).toEqual(["hidden-token", "link-in-name", "bait-words", "zero-value", null, null]);
  });
});

describe("grouping and export", () => {
  it("one transaction with something out and something else in reads as a swap", () => {
    const g = groupTransfers(
      rateTransfers(ME, [
        tr({
          hash: H(7),
          direction: "out",
          from: ME,
          to: FRIEND,
          kind: "coin",
          asset: { address: null, symbol: "BNB", decimals: 18, tokenId: null },
        }),
        tr({ hash: H(7) }),
        tr({ hash: H(8), time: 1_790_000_100 }),
      ]),
    );
    expect(g.map((x) => [x.hash, x.kind, x.transfers.length])).toEqual([
      [H(8), "single", 1],
      [H(7), "swap", 2],
    ]);
  });
  it("CSV cells can't start a formula and quote commas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("plain")).toBe("plain");
  });
});
