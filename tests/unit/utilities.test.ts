import { encodeFunctionData, maxUint256, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { checkAddress, splitAddresses } from "@/modules/tools/address-formatter/address";
import { convertNumber, hexToText } from "@/modules/tools/hex-converter/hex";
import { decodeCallData, knownSignatureCount } from "@/modules/tools/tx-decoder/decode";
import { MAX_UINT256, convertAll, formatExact, parseAmount } from "@/modules/tools/unit-converter/units";

describe("unit converter", () => {
  const wei = (input: string, decimals: number) => {
    const result = parseAmount(input, decimals);
    return result.ok ? result.wei.toString() : result.error;
  };

  it("converts exactly between wei, gwei and ether", () => {
    expect(wei("1", 18)).toBe("1000000000000000000");
    expect(wei("0.1", 18)).toBe("100000000000000000");
    expect(wei(".5", 9)).toBe("500000000");
    expect(wei("21000", 0)).toBe("21000");
    expect(convertAll(1_500_000_000n)).toEqual({ wei: "1500000000", gwei: "1.5", ether: "0.0000000015" });
    expect(convertAll(123456789012345678901234567890n).ether).toBe("123456789012.34567890123456789");
  });

  it("accepts scientific notation and digit separators", () => {
    expect(wei("1e18", 0)).toBe("1000000000000000000");
    expect(wei("1.5e9", 0)).toBe("1500000000");
    expect(wei("1_000 000", 0)).toBe("1000000");
    expect(wei("1.50000", 1)).toBe("15");
  });

  it("rejects values that can't be represented, instead of rounding", () => {
    expect(wei("0.5", 0)).toBe("too-precise");
    expect(wei("1.0000000000000000001", 18)).toBe("too-precise");
    expect(wei("1.000", 0)).toBe("1");
    expect(wei("-1", 18)).toBe("negative");
    expect(wei("1,5", 18)).toBe("comma");
    expect(wei("abc", 18)).toBe("format");
    expect(wei(".", 18)).toBe("format");
    expect(wei("", 18)).toBe("empty");
    expect(wei(MAX_UINT256.toString(), 0)).toBe(MAX_UINT256.toString());
    expect(wei((MAX_UINT256 + 1n).toString(), 0)).toBe("too-large");
    expect(wei("1e999", 0)).toBe("too-large");
  });

  it("formats without rounding", () => {
    expect(formatExact(1n, 18)).toBe("0.000000000000000001");
    expect(formatExact(10n ** 18n, 18)).toBe("1");
    expect(formatExact(0n, 9)).toBe("0");
  });
});

describe("hex converter", () => {
  const convert = (input: string, as?: "hex" | "decimal") => {
    const result = convertNumber(input, as);
    return result.ok ? result.result : result.error;
  };

  it("detects hex and decimal input", () => {
    expect(convert("0xff")).toMatchObject({ input: "hex", decimal: "255", hex: "0xff", byteLength: 1 });
    expect(convert("ff")).toMatchObject({ input: "hex", decimal: "255" });
    expect(convert("255")).toMatchObject({ input: "decimal", hex: "0xff" });
    expect(convert("10", "hex")).toMatchObject({ input: "hex", decimal: "16" });
    expect(convert("0x0")).toMatchObject({ decimal: "0", byteLength: 0 });
  });

  it("shows the 32-byte form and the signed reading", () => {
    const result = convert(`0x${"f".repeat(64)}`);
    expect(result).toMatchObject({ decimal: MAX_UINT256.toString(), signed: "-1", byteLength: 32 });
    expect(convert("1")).toMatchObject({ padded: `0x${"0".repeat(63)}1`, signed: null });
  });

  it("rejects invalid or oversized values", () => {
    expect(convert("0xzz")).toBe("format");
    expect(convert("12.5")).toBe("format");
    expect(convert("-5")).toBe("negative");
    expect(convert(`0x1${"0".repeat(64)}`)).toBe("too-large");
    expect(convert("")).toBe("empty");
  });

  it("reads text only when the bytes are clearly text", () => {
    expect(hexToText("0x48656c6c6f2043525950592")).toBeNull();
    expect(hexToText("0x48656c6c6f20435259505921")).toBe("Hello CRYPY!");
    expect(hexToText(`0x${"48656c6c6f".padEnd(64, "0")}`)).toBe("Hello");
    expect(hexToText("0x0000ff00")).toBeNull();
    expect(hexToText("0x00")).toBeNull();
    expect(hexToText("0x1b5b326a")).toBeNull();
  });
});

describe("address formatter", () => {
  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  it("classifies addresses and returns the checksummed form", () => {
    expect(checkAddress(USDT)).toMatchObject({ status: "valid", checksummed: USDT });
    expect(checkAddress(USDT.toLowerCase())).toMatchObject({ status: "no-checksum", checksummed: USDT });
    expect(checkAddress(USDT.replace("dAC", "DAC"))).toMatchObject({ status: "bad-checksum", checksummed: USDT });
    expect(checkAddress(USDT.slice(2))).toMatchObject({ status: "missing-prefix", checksummed: USDT });
    expect(checkAddress(`0x${"0".repeat(40)}`)).toMatchObject({ status: "no-checksum", isZero: true });
  });

  it("explains invalid input", () => {
    expect(checkAddress("0x1234")).toMatchObject({ status: "invalid", reason: "length", length: 4 });
    expect(checkAddress("0xg234567890abcdef1234567890abcdef12345678")).toMatchObject({ reason: "characters" });
    expect(checkAddress("  ")).toMatchObject({ reason: "empty" });
  });

  it("splits lists on lines, commas and spaces", () => {
    expect(splitAddresses(`a\nb, c;d  e\r\n`)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("transaction data decoder", () => {
  const erc20 = parseAbi([
    "function transfer(address to, uint256 amount)",
    "function approve(address spender, uint256 amount)",
  ]);
  const spender = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

  it("decodes a token transfer", () => {
    const data = encodeFunctionData({ abi: erc20, functionName: "transfer", args: [spender, 1_000_000n] });
    expect(decodeCallData(data)).toMatchObject({
      status: "decoded",
      key: "transfer",
      selector: "0xa9059cbb",
      params: [
        { name: "to", type: "address", value: { kind: "address", value: spender } },
        { name: "amount", type: "uint256", value: { kind: "number", value: "1000000" } },
      ],
      warnings: [],
    });
  });

  it("flags unlimited approvals, normal approvals and revokes", () => {
    const unlimited = encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, maxUint256] });
    const result = decodeCallData(unlimited);
    expect(result).toMatchObject({ status: "decoded", key: "approve", warnings: ["unlimited-approval"] });
    if (result.status === "decoded") expect(result.params[1]!.value).toMatchObject({ unlimited: true });

    const small = encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, 5n] });
    expect(decodeCallData(small)).toMatchObject({ warnings: ["approval"] });
    const revoke = encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, 0n] });
    expect(decodeCallData(revoke)).toMatchObject({ warnings: ["revoke"] });
  });

  it("flags NFT operator approvals", () => {
    const abi = parseAbi(["function setApprovalForAll(address operator, bool approved)"]);
    expect(
      decodeCallData(encodeFunctionData({ abi, functionName: "setApprovalForAll", args: [spender, true] })),
    ).toMatchObject({
      key: "set-approval-for-all",
      warnings: ["approval-for-all"],
    });
  });

  it("decodes router swaps with paths and deadlines", () => {
    const abi = parseAbi([
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
    ]);
    const data = encodeFunctionData({
      abi,
      functionName: "swapExactTokensForTokens",
      args: [1n, 2n, [spender, spender], spender, 1_800_000_000n],
    });
    const result = decodeCallData(data);
    expect(result).toMatchObject({ status: "decoded", key: "swap" });
    if (result.status === "decoded") {
      expect(result.params[2]!.value).toMatchObject({ kind: "list" });
      expect(result.params[4]!.value).toMatchObject({ kind: "number", time: "2027-01-15T08:00:00.000Z" });
    }
  });

  it("decodes calls nested inside multicall", () => {
    const inner = encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, maxUint256] });
    const abi = parseAbi(["function multicall(bytes[] data)"]);
    const result = decodeCallData(encodeFunctionData({ abi, functionName: "multicall", args: [[inner]] }));
    expect(result).toMatchObject({ status: "decoded", key: "multicall" });
    if (result.status === "decoded") {
      const list = result.params[0]!.value;
      expect(list.kind === "list" && list.items[0]).toMatchObject({
        kind: "call",
        result: { status: "decoded", key: "approve", warnings: ["unlimited-approval"] },
      });
    }
  });

  it("shows unknown functions as raw words and never guesses", () => {
    const result = decodeCallData(`0x12345678${"00".repeat(31)}01${"00".repeat(31)}02`);
    expect(result).toMatchObject({ status: "unknown", selector: "0x12345678", totalWords: 2, extraBytes: 0 });
  });

  it("handles empty data, bad input, hashes and broken parameters", () => {
    expect(decodeCallData("0x")).toEqual({ status: "native-transfer" });
    expect(decodeCallData("0xzz")).toMatchObject({ status: "invalid", error: "format" });
    expect(decodeCallData("0xabc")).toMatchObject({ error: "odd-length" });
    expect(decodeCallData("0xa905")).toMatchObject({ error: "too-short" });
    expect(decodeCallData(`0x${"ab".repeat(32)}`)).toMatchObject({ error: "tx-hash" });
    expect(decodeCallData("0xa9059cbb1234")).toMatchObject({ status: "mismatch" });
    expect(decodeCallData(" 0xA9059CBB\n0000 ")).toMatchObject({ status: "mismatch" });
  });

  it("knows a useful set of functions", () => {
    expect(knownSignatureCount).toBeGreaterThanOrEqual(30);
  });
});
