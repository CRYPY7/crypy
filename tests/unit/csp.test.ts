/** "Scan in my browser" calls every chain's public nodes from the page: the CSP must allow each of them. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chains } from "@/config/chains";

describe("content security policy", () => {
  it("allows every public node a browser scan may call", () => {
    const config = readFileSync("next.config.ts", "utf8");
    for (const chain of chains.filter((c) => c.status === "live")) {
      for (const url of chain.publicRpcUrls) expect(config, url).toContain(new URL(url).origin);
    }
  });
});
