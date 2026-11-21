import { describe, expect, it } from "vitest";
import { redactKeys } from "@/server/diagnostics";

describe("diagnostic logs never contain provider keys", () => {
  it("removes Alchemy keys from URLs and key-like query values", () => {
    const text =
      "fetch https://eth-mainnet.g.alchemy.com/v2/AbCdEf1234567890xyz failed; https://x.io/rpc?apikey=SECRET123&a=1";
    const out = redactKeys(text);
    expect(out).not.toContain("AbCdEf1234567890xyz");
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("/v2/[key]");
  });
});
