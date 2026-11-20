import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics as encode, parseAbi, padHex } from "viem";
import { MAX_ROWS, parseTxLogs, type RawLog } from "@/server/chains/evm/tx-logs";

const abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event Deposit(address indexed dst, uint256 wad)",
]);
const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
// Test events only use single indexed values, so the topics are plain strings.
const encodeEventTopics = (...args: Parameters<typeof encode>) => encode(...args) as string[];
const word = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);

function erc20Transfer(amount: bigint, address = TOKEN): RawLog {
  return {
    address,
    topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from: A, to: B } }),
    data: word(amount),
  };
}

describe("parseTxLogs", () => {
  it("reads ERC-20 transfers", () => {
    const { transfers } = parseTxLogs([erc20Transfer(1_500_000n)]);
    expect(transfers).toEqual([{ standard: "erc20", token: TOKEN, from: A, to: B, amount: "1500000" }]);
  });

  it("reads ERC-721 transfers (token id in the 4th topic)", () => {
    const topics = [...encodeEventTopics({ abi, eventName: "Transfer", args: { from: A, to: B } }), padHex("0x2a")];
    const { transfers } = parseTxLogs([{ address: TOKEN, topics, data: "0x" }]);
    expect(transfers[0]).toMatchObject({ standard: "erc721", tokenId: "42", amount: "1" });
  });

  it("flags unlimited ERC-20 approvals and revokes", () => {
    const approval = (amount: bigint): RawLog => ({
      address: TOKEN,
      topics: encodeEventTopics({ abi, eventName: "Approval", args: { owner: A, spender: B } }),
      data: word(amount),
    });
    const { approvals } = parseTxLogs([approval(2n ** 256n - 1n), approval(0n), approval(10n)]);
    expect(approvals.map((a) => [a.unlimited, a.revoke])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("reads NFT operator approvals for a whole collection", () => {
    const log: RawLog = {
      address: TOKEN,
      topics: encodeEventTopics({ abi, eventName: "ApprovalForAll", args: { owner: A, operator: B } }),
      data: word(1n),
    };
    expect(parseTxLogs([log]).approvals[0]).toMatchObject({ kind: "all", unlimited: true, revoke: false });
  });

  it("reads ERC-1155 single and batch transfers", () => {
    const single: RawLog = {
      address: TOKEN,
      topics: encodeEventTopics({ abi, eventName: "TransferSingle", args: { operator: A, from: A, to: B } }),
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [7n, 3n]),
    };
    const batch: RawLog = {
      address: TOKEN,
      topics: encodeEventTopics({ abi, eventName: "TransferBatch", args: { operator: A, from: A, to: B } }),
      data: encodeAbiParameters(
        [{ type: "uint256[]" }, { type: "uint256[]" }],
        [
          [1n, 2n],
          [5n, 6n],
        ],
      ),
    };
    const { transfers } = parseTxLogs([single, batch]);
    expect(transfers.map((t) => [t.tokenId, t.amount])).toEqual([
      ["7", "3"],
      ["1", "5"],
      ["2", "6"],
    ]);
  });

  it("shows wrapping only for the chain's wrapped coin", () => {
    const deposit = (address: string): RawLog => ({
      address,
      topics: encodeEventTopics({ abi, eventName: "Deposit", args: { dst: A } }),
      data: word(10n ** 18n),
    });
    expect(parseTxLogs([deposit(WETH)], WETH).transfers[0]).toMatchObject({ standard: "wrap", to: A });
    // The same event from any other contract is not trusted as a wrap.
    expect(parseTxLogs([deposit(TOKEN)], WETH).transfers).toEqual([]);
  });

  it("ignores unknown and malformed events and caps very large transactions", () => {
    const junk: RawLog = { address: TOKEN, topics: ["0x1234"], data: "0xzz" };
    expect(parseTxLogs([junk]).transfers).toEqual([]);
    const many = Array.from({ length: MAX_ROWS + 5 }, () => erc20Transfer(1n));
    const result = parseTxLogs(many);
    expect(result.transfers).toHaveLength(MAX_ROWS);
    expect(result.truncated).toBe(true);
  });
});
