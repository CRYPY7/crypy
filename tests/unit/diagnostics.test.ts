import { describe, expect, it } from "vitest";
import { redactKeys } from "@/server/diagnostics";

describe("diagnostic logs never contain provider keys", () => {
  it("removes Alchemy keys from URLs and key-like query values", () => {
    const text =
      "fetch https://eth-mainnet.g.alchemy.com/v2/AbCdEf1234567890xyz failed; https://x.io/rpc?apikey=SECRET123&a=1";
    const out = redactKeys(text);
    expect(out).not.toContain("AbCdEf1234567890xyz");
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("https://eth-mainnet.g.alchemy.com/[…]");
  });

  it("keeps only the host of any provider URL, and removes Telegram tokens", () => {
    const text = [
      "https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef",
      "https://rpc.ankr.com/multichain/939f00aa11bb22cc33dd44ee55ff66aa77bb88cc",
      "https://lb.drpc.live/ethereum/AnRhLdE5iUVcqWvOE?dkey=zzzzzz",
      "https://api.telegram.org/bot123456789:AAfakefakefakefakefakefakefakefake12/getUpdates",
      "token 123456789:AAfakefakefakefakefakefakefakefake12 leaked",
    ].join(" ");
    const out = redactKeys(text);
    for (const secret of ["0123456789abcdef", "939f00aa", "AnRhLdE5", "zzzzzz", "AAfakefake"])
      expect(out).not.toContain(secret);
    expect(out).toContain("https://mainnet.infura.io/[…]");
    expect(out).toContain("https://api.telegram.org/[…]");
  });
});
