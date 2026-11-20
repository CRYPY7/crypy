import { describe, expect, it } from "vitest";
import { classifySearch } from "@/lib/search/classify";

const address = "0x1234567890abcdef1234567890ABCDEF12345678";
const txHash = `0x${"ab".repeat(32)}`;

describe("classifySearch", () => {
  it("recognises an EVM address", () => {
    expect(classifySearch(address).kind).toBe("evm-address");
  });

  it("recognises an EVM transaction hash", () => {
    expect(classifySearch(txHash).kind).toBe("evm-tx");
  });

  it("trims whitespace around pasted values", () => {
    expect(classifySearch(`  ${address}\n`)).toEqual({ kind: "evm-address", value: address });
  });

  it("reports empty input", () => {
    expect(classifySearch("   ").kind).toBe("empty");
  });

  it.each([
    "0x123",
    "1234567890abcdef1234567890abcdef12345678",
    `${address}0`,
    "0xZZ34567890abcdef1234567890abcdef12345678",
    "abandon ability able about above absent absorb abstract absurd abuse access accident",
    "<script>alert(1)</script>",
  ])("rejects %s", (input) => {
    expect(classifySearch(input).kind).toBe("invalid");
  });

  it("caps very long input", () => {
    expect(classifySearch("a".repeat(10_000)).value).toHaveLength(200);
  });
});
