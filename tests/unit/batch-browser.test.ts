/** S2 Part A.2: browser-mode reader errors and the larger list limit. */
import { describe, expect, it } from "vitest";
import { ReadError } from "@/lib/batch-scan/engine";
import { browserReaders, toBrowserReadError } from "@/modules/tools/batch-balance/browser-scan";
import { BROWSER_MAX_ADDRESSES, MAX_ADDRESSES, parseList } from "@/modules/tools/batch-balance/parse";

describe("scan in my browser", () => {
  it("maps node errors to what the engine does next", () => {
    expect(toBrowserReadError(Object.assign(new Error("HTTP request failed"), { status: 429 })).kind).toBe(
      "rate-limited",
    );
    expect(toBrowserReadError(new Error("The request took too long to respond.")).kind).toBe("timeout");
    expect(toBrowserReadError(new Error("Request Entity Too Large (413)")).kind).toBe("timeout");
    expect(toBrowserReadError(new Error("execution reverted")).kind).toBe("failed");
    const own = new ReadError("bad-answer");
    expect(toBrowserReadError(own)).toBe(own);
  });

  it("uses one reader per public node, and none for an unknown chain", () => {
    expect(
      browserReaders("bsc", ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"]).map((r) => r.id),
    ).toEqual(["bsc-rpc.publicnode.com", "bsc-dataseed.bnbchain.org"]);
    expect(browserReaders("dogechain", ["https://example.org"])).toEqual([]);
  });

  it("allows bigger lists in the browser mode", () => {
    const lines = Array.from({ length: 1_200 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`).join("\n");
    expect(parseList(lines).entries).toHaveLength(MAX_ADDRESSES);
    expect(parseList(lines, BROWSER_MAX_ADDRESSES).entries).toHaveLength(1_200);
  });
});
