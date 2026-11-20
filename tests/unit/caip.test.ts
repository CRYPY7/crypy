import { describe, expect, it } from "vitest";
import { accountId, assetId, isChainId, parseAccountId } from "@/lib/chains/caip";

describe("CAIP identifiers", () => {
  it("accepts chain ids from any family", () => {
    expect(isChainId("eip155:1")).toBe(true);
    expect(isChainId("eip155:56")).toBe(true);
    expect(isChainId("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")).toBe(true);
    expect(isChainId("bip122:000000000019d6689c085ae165831e93")).toBe(true);
  });

  it("rejects malformed chain ids", () => {
    for (const bad of ["", "eip155", "eip155:", "EIP155:1", "ab:1", "eip155:1:2", "eip155:a b"]) {
      expect(isChainId(bad)).toBe(false);
    }
  });

  it("round-trips account ids", () => {
    const id = accountId("eip155:56", "0xdAC17F958D2ee523a2206206994597C13D831ec7");
    expect(id).toBe("eip155:56:0xdAC17F958D2ee523a2206206994597C13D831ec7");
    expect(parseAccountId(id)).toEqual({ chain: "eip155:56", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" });
  });

  it("rejects malformed account ids", () => {
    expect(parseAccountId("eip155:1")).toBeNull();
    expect(parseAccountId("eip155:1:<script>")).toBeNull();
    expect(parseAccountId("x:1:0xabc")).toBeNull();
  });

  it("builds asset ids", () => {
    expect(assetId("eip155:1", "erc20", "0xa0b8")).toBe("eip155:1/erc20:0xa0b8");
    expect(assetId("eip155:1", "slip44", "60")).toBe("eip155:1/slip44:60");
  });
});
