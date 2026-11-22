import { describe, expect, it } from "vitest";
import {
  type PricedMovement,
  type WatchTarget,
  addValuePoint,
  approvalAlerts,
  liquidityChanges,
  securityChanges,
  transferAlerts,
  valueDrop,
} from "@/lib/alerts/build";
import { TOPICS, decodeApproval, decodeTransfer, topicFor } from "@/lib/alerts/events";
import { isPublicSite, telegramAlert, telegramDigest } from "@/lib/alerts/format";
import { isQuietNow, localMinutes, parseMinutes } from "@/lib/alerts/quiet";
import { ownWalletDefaults, watchOnlyDefaults } from "@/lib/watchlist/rules";

const ME = "0x4b2e8f00000000000000000000000000a3d291c7";
const OTHER = "0x31c2000000000000000000000000000000a8e0aa";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TX = `0x${"9f1e".padEnd(64, "0")}`;
const chain = { key: "bsc", name: "BNB Chain", nativeSymbol: "BNB" };
const word = (n: bigint) => n.toString(16).padStart(64, "0");

describe("decoding events", () => {
  it("reads ERC-20 and NFT transfers and ignores malformed logs", () => {
    const erc20 = decodeTransfer({
      address: USDT,
      topics: [TOPICS.transfer, topicFor(ME), topicFor(OTHER)],
      data: `0x${word(250n * 10n ** 18n)}`,
      blockNumber: "0x10",
      transactionHash: TX,
      logIndex: "0x3",
    })!;
    expect(erc20).toMatchObject({
      standard: "erc20",
      from: ME,
      to: OTHER,
      amount: 250n * 10n ** 18n,
      logIndex: 3,
      block: 16,
    });
    const nft = decodeTransfer({
      address: USDT,
      topics: [TOPICS.transfer, topicFor(ME), topicFor(OTHER), `0x${word(7n)}`],
      data: "0x",
      blockNumber: 1n,
      transactionHash: TX,
      logIndex: 0,
    })!;
    expect(nft).toMatchObject({ standard: "nft", tokenId: 7n, amount: null });
    expect(
      decodeTransfer({
        address: USDT,
        topics: [TOPICS.transfer, topicFor(ME)],
        data: "0x",
        blockNumber: 1n,
        transactionHash: TX,
        logIndex: 0,
      }),
    ).toBeNull();
  });

  it("keeps new approvals only: revokes, approvals to nobody and switched-off operators are dropped", () => {
    const base = { address: USDT, blockNumber: "0x1", transactionHash: TX, logIndex: 1 };
    const max = 2n ** 256n - 1n;
    expect(
      decodeApproval({ ...base, topics: [TOPICS.approval, topicFor(ME), topicFor(OTHER)], data: `0x${word(max)}` }),
    ).toMatchObject({
      kind: "token",
      unlimited: true,
      emitter: USDT,
    });
    expect(
      decodeApproval({ ...base, topics: [TOPICS.approval, topicFor(ME), topicFor(OTHER)], data: `0x${word(0n)}` }),
    ).toBeNull();
    expect(
      decodeApproval({
        ...base,
        topics: [TOPICS.approvalForAll, topicFor(ME), topicFor(OTHER)],
        data: `0x${word(0n)}`,
      }),
    ).toBeNull();
    expect(
      decodeApproval({
        ...base,
        topics: [TOPICS.approvalForAll, topicFor(ME), topicFor(OTHER)],
        data: `0x${word(1n)}`,
      }),
    ).toMatchObject({
      kind: "nft-all",
    });
    const permit2 = decodeApproval({
      ...base,
      address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      topics: [TOPICS.permit2Approval, topicFor(ME), topicFor(USDT), topicFor(OTHER)],
      data: `0x${word(2n ** 160n - 1n)}${word(1_900_000_000n)}`,
    })!;
    expect(permit2).toMatchObject({
      kind: "permit2",
      token: USDT,
      spender: OTHER,
      unlimited: true,
      expiration: 1_900_000_000,
    });
    expect(permit2.emitter).toBe("0x000000000022d473030f116ddee9f6b43ac78ba3");
  });
});

const target = (rules = ownWalletDefaults, label = "Main wallet"): WatchTarget => ({
  itemId: "item-1",
  userId: "user-1",
  label,
  address: ME,
  rules,
});
const move = (over: Partial<PricedMovement>): PricedMovement => ({
  txHash: TX,
  standard: "erc20",
  from: ME,
  to: OTHER,
  amount: 250n * 10n ** 18n,
  decimals: 18,
  symbol: "USDT",
  usd: 250,
  txFrom: null,
  ...over,
});

describe("transfer alerts", () => {
  const targets = (t = target()) => new Map([[ME, [t]]]);

  it("a sent token makes one alert in the approved wording, linking the transaction", () => {
    const [alert] = transferAlerts(chain, [move({})], targets());
    expect(alert).toMatchObject({ kind: "sent", severity: "danger", title: "Main wallet sent 250 USDT" });
    expect(alert!.details.summary).toBe("Main wallet → 0x31c2…e0aa · BNB Chain");
    expect(alert!.details.path).toBe(`/tx/${TX}?chain=bsc`);
    expect(alert!.details.lines[0]).toBe("Sent 250 USDT ($250) to 0x31c2…e0aa");
  });

  it("a swap's two sides become one alert", () => {
    const list = transferAlerts(chain, [move({}), move({ from: OTHER, to: ME, symbol: "CAKE", usd: 240 })], targets());
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("moved");
  });

  it("spam is skipped: zero amounts, received tokens without a price, received NFTs", () => {
    expect(transferAlerts(chain, [move({ amount: 0n })], targets())).toEqual([]);
    expect(transferAlerts(chain, [move({ from: OTHER, to: ME, usd: null })], targets())).toEqual([]);
    expect(
      transferAlerts(chain, [move({ from: OTHER, to: ME, standard: "nft", amount: null, usd: null })], targets()),
    ).toEqual([]);
  });

  it("an unpriced token 'sent' counts only when the wallet itself sent the transaction (address poisoning)", () => {
    expect(transferAlerts(chain, [move({ usd: null })], targets())).toEqual([]);
    expect(transferAlerts(chain, [move({ usd: null, txFrom: ME })], targets())).toHaveLength(1);
  });

  it("thresholds: received above $100 for an own wallet, above $1,000 for watch-only", () => {
    expect(transferAlerts(chain, [move({ from: OTHER, to: ME, usd: 99 })], targets())).toEqual([]);
    expect(transferAlerts(chain, [move({ from: OTHER, to: ME, usd: 101 })], targets())).toHaveLength(1);
    expect(transferAlerts(chain, [move({ usd: 999 })], targets(target(watchOnlyDefaults)))).toEqual([]);
    expect(transferAlerts(chain, [move({ usd: 1_000 })], targets(target(watchOnlyDefaults)))).toHaveLength(1);
  });

  it("the same transaction always gets the same key, so it alerts once", () => {
    const a = transferAlerts(chain, [move({})], targets())[0]!.dedupeKey;
    const b = transferAlerts(chain, [move({})], targets())[0]!.dedupeKey;
    expect(a).toBe(b);
  });
});

describe("approval alerts", () => {
  it("names known spenders and links the approvals page", () => {
    const [alert] = approvalAlerts(
      chain,
      [
        {
          txHash: TX,
          logIndex: 2,
          owner: ME,
          kind: "token",
          symbol: "USDC",
          decimals: 6,
          amount: 2n ** 255n,
          unlimited: true,
          spender: OTHER,
          spenderName: "Uniswap Universal Router",
          expiration: null,
        },
      ],
      new Map([[ME, [target()]]]),
    );
    expect(alert!.title).toBe("New approval on Main wallet: unlimited USDC");
    expect(alert!.details.lines[0]).toBe("Uniswap Universal Router can move unlimited USDC on BNB Chain.");
    expect(alert!.details.path).toBe(`/address/${ME}/approvals?chains=bsc`);
  });

  it("not sent when the item's approval alerts are off", () => {
    const off = target({ ...ownWalletDefaults, approvals: { on: false } });
    expect(
      approvalAlerts(
        chain,
        [
          {
            txHash: TX,
            logIndex: 2,
            owner: ME,
            kind: "token",
            symbol: "X",
            decimals: 18,
            amount: 1n,
            unlimited: false,
            spender: OTHER,
            spenderName: null,
            expiration: null,
          },
        ],
        new Map([[ME, [off]]]),
      ),
    ).toEqual([]);
  });
});

describe("hourly checks", () => {
  const H = 3_600_000;
  it("value drop compares with about a day ago, and only complete readings", () => {
    let points = addValuePoint([], { at: 0, usd: 1_000 });
    for (let h = 1; h <= 24; h++) points = addValuePoint(points, { at: h * H, usd: h === 24 ? 700 : 1_000 });
    expect(valueDrop(points, 24 * H, 20)).toMatchObject({ before: 1_000, after: 700 });
    expect(valueDrop(points, 24 * H, 40)).toBeNull();
    // Less than a day of history: nothing to compare yet.
    expect(valueDrop(points.slice(-3), 24 * H, 20)).toBeNull();
  });

  it("security: selling starting to fail, tax rises and new serious risks are reported", () => {
    const before = { level: "none-found" as const, trade: "ok", buyTax: 0, sellTax: 0.02, transferTax: 0, risks: [] };
    const after = {
      level: "serious" as const,
      trade: "sell-failed",
      buyTax: 0,
      sellTax: 0.3,
      transferTax: 0,
      risks: ["sell"],
    };
    const changes = securityChanges(before, after, () => "Selling blocked in the trade test");
    expect(changes).toContain("Selling now fails in the trade test");
    expect(changes).toContain("Sell tax went from 2% to 30%");
    expect(changes).toContain("New risk: Selling blocked in the trade test");
    expect(securityChanges(before, before, (id) => id)).toEqual([]);
  });

  it("liquidity: lock ending within a week, protected share falling, liquidity pulled", () => {
    const now = 1_800_000_000;
    const before = { totalUsd: 100_000, protectedShare: 0.95, removableShare: 0, nextUnlock: null };
    const after = {
      totalUsd: 40_000,
      protectedShare: 0.6,
      removableShare: 0.3,
      nextUnlock: { at: now + 3 * 86_400, share: 0.35 },
    };
    const changes = liquidityChanges(before, after, now);
    expect(changes).toHaveLength(4);
    expect(liquidityChanges(after, after, now)).toEqual([]);
  });
});

describe("quiet hours and messages", () => {
  it("23:00–07:00 in the person's own time zone", () => {
    const quiet = { on: true, start: 23 * 60, end: 7 * 60, timeZone: "Asia/Karachi" };
    // 20:00 UTC = 01:00 in Karachi (UTC+5): quiet. 06:00 UTC = 11:00: not quiet.
    expect(localMinutes(new Date("2026-11-21T20:00:00Z"), "Asia/Karachi")).toBe(60);
    expect(isQuietNow(quiet, new Date("2026-11-21T20:00:00Z"))).toBe(true);
    expect(isQuietNow(quiet, new Date("2026-11-21T06:00:00Z"))).toBe(false);
    expect(isQuietNow({ ...quiet, on: false }, new Date("2026-11-21T20:00:00Z"))).toBe(false);
    expect(parseMinutes("07:30")).toBe(450);
    expect(parseMinutes("25:00")).toBeNull();
  });

  it("labels can't inject Telegram formatting; links only to CRYPY; buttons only on a public site", () => {
    const alert = {
      kind: "sent" as const,
      severity: "danger" as const,
      title: "<b>Main</b> & co sent 1 ETH",
      details: { summary: "", lines: ["<a href='x'>"], path: "/tx/0x1?chain=bsc", muteItemId: "item-1" },
    };
    const local = telegramAlert(alert, new URL("http://localhost:3000"));
    expect(local.html).toContain("&lt;b&gt;Main&lt;/b&gt; &amp; co");
    expect(local.html).not.toContain("<a ");
    expect(local.buttons[0]).toEqual([{ text: "Mute this wallet", callback_data: "mute:item-1" }]);
    const live = telegramAlert(alert, new URL("https://crypy.org"));
    expect(live.buttons[0]![0]).toEqual({ text: "Open in CRYPY", url: "https://crypy.org/en/tx/0x1?chain=bsc" });
    expect(isPublicSite(new URL("https://crypy.org"))).toBe(true);
    const digest = telegramDigest(
      Array.from({ length: 7 }, () => alert),
      new URL("https://crypy.org"),
    );
    expect(digest.html).toContain("7 alerts while you were away");
    expect(digest.html).toContain("…and 2 more.");
  });
});
