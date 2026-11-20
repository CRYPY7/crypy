import { describe, expect, it } from "vitest";
import { looksLikeLink, sanitizeTokenText } from "@/lib/chains/sanitize";
import { formatAmount, shortenId } from "@/lib/format/amount";

describe("formatAmount", () => {
  it("formats large integers without floating-point loss", () => {
    expect(formatAmount("1234567890000000000000", 18, "en")).toBe("1,234.5679");
    expect(
      formatAmount("115792089237316195423570985008687907853269984665640564039457584007913129639935", 18, "en"),
    ).toMatch(/^115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457\.584$/);
  });

  it("rounds half up and trims trailing zeros", () => {
    expect(formatAmount("15", 1, "en", 0)).toBe("2");
    expect(formatAmount("1000000", 6, "en")).toBe("1");
    expect(formatAmount("1500000", 6, "en")).toBe("1.5");
    expect(formatAmount("0", 18, "en")).toBe("0");
  });

  it("uses the reader's number style", () => {
    expect(formatAmount("1234500000", 6, "de")).toBe("1.234,5");
    expect(formatAmount("1234500000", 6, "fr")).toMatch(/^1\s234,5$/u);
  });

  it("returns unexpected input unchanged instead of guessing", () => {
    expect(formatAmount("12.5", 6, "en")).toBe("12.5");
    expect(formatAmount("abc", 6, "en")).toBe("abc");
  });

  it("shortens ids for tight spaces only", () => {
    expect(shortenId("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortenId("0x1234")).toBe("0x1234");
  });
});

describe("token text from contracts", () => {
  it("removes invisible and direction-changing characters", () => {
    expect(sanitizeTokenText("US‮DT", 64)).toBe("USDT");
    expect(sanitizeTokenText("Te​ther\u0000", 64)).toBe("Tether");
    expect(sanitizeTokenText("  a \n\t b  ", 64)).toBe("a b");
  });

  it("caps the length and ignores non-strings", () => {
    expect(sanitizeTokenText("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
    expect(sanitizeTokenText(42, 10)).toBe("");
  });

  it("flags names that look like links", () => {
    expect(looksLikeLink("Visit claim-airdrop.xyz")).toBe(true);
    expect(looksLikeLink("https://evil")).toBe(true);
    expect(looksLikeLink("Tether USD")).toBe(false);
  });
});
