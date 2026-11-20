import { describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { evmAdapter } from "@/server/chains/evm/adapter";

const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

describe("EVM adapter: input parsing (no network)", () => {
  it("normalizes lowercase and uppercase addresses without judging the checksum", () => {
    expect(evmAdapter.parseAddress(USDT.toLowerCase())).toEqual({ normalized: USDT, checksumValid: null });
    expect(evmAdapter.parseAddress(`0x${USDT.slice(2).toUpperCase()}`)).toEqual({
      normalized: USDT,
      checksumValid: null,
    });
  });

  it("accepts a correct EIP-55 checksum and flags a wrong one", () => {
    expect(evmAdapter.parseAddress(USDT)?.checksumValid).toBe(true);
    const typo = USDT.replace("dAC17", "DAC17");
    expect(evmAdapter.parseAddress(typo)?.checksumValid).toBe(false);
  });

  it("rejects non-addresses", () => {
    for (const bad of ["", "0x123", `${USDT}0`, USDT.slice(2), "0xZZC17F958D2ee523a2206206994597C13D831ec7"]) {
      expect(evmAdapter.parseAddress(bad)).toBeNull();
    }
  });

  it("parses 32-byte transaction hashes to lowercase", () => {
    const hash = `0x${"AB".repeat(32)}`;
    expect(evmAdapter.parseTxId(hash)).toBe(hash.toLowerCase());
    expect(evmAdapter.parseTxId(USDT)).toBeNull();
    expect(evmAdapter.parseTxId(`0x${"ab".repeat(31)}`)).toBeNull();
  });

  it("builds explorer links per chain", () => {
    const eth = getChain("ethereum")!;
    const bsc = getChain("bsc")!;
    expect(evmAdapter.explorerUrl(eth, "token", USDT)).toBe(`https://etherscan.io/token/${USDT}`);
    expect(evmAdapter.explorerUrl(bsc, "tx", "0xab")).toBe("https://bscscan.com/tx/0xab");
    expect(evmAdapter.explorerUrl(bsc, "address", USDT)).toBe(`https://bscscan.com/address/${USDT}`);
  });
});
