import { afterAll, describe, expect, it, vi } from "vitest";

/** R4: a wallet's first transfer is found once and stored; later first pages make 2 Alchemy calls per chain, not 4. */
process.env.ALCHEMY_API_KEY = "testkey0123456789abcdef";
process.env.PGLITE_DIR = "memory";
const { getChain } = await import("@/config/chains");
const { getEvmActivity } = await import("@/server/chains/evm/activity");
const { resetAlchemyPace } = await import("@/server/chains/evm/alchemy-pace");
const { resetUsage } = await import("@/server/chains/evm/providers");
const { resetDb } = await import("@/server/db/client");

const OWNER = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
const FIRST = {
  blockNum: "0x10",
  hash: `0x${"ab".repeat(32)}`,
  from: "0x0000000000000000000000000000000000000001",
  to: OWNER,
  asset: "ETH",
  category: "external",
  rawContract: { value: "0x1" },
  metadata: { blockTimestamp: "2017-01-01T00:00:00.000Z" },
};
let calls = 0;
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (url.includes(".g.alchemy.com") && body?.method === "alchemy_getAssetTransfers") {
    calls += 1;
    const asc = body.params[0].order === "asc";
    const transfers = asc && body.params[0].toAddress ? [FIRST] : [];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { transfers } }), {
      headers: { "content-type": "application/json" },
    });
  }
  throw new TypeError("fetch failed (test: no network)");
});
afterAll(async () => {
  fetchSpy.mockRestore();
  await resetDb();
});

describe("first activity", () => {
  it("is asked for once, stored, and reused on the next first page", async () => {
    resetUsage();
    resetAlchemyPace();
    const chain = getChain("ethereum")!;
    const first = await getEvmActivity(chain, OWNER, null, []);
    expect(calls).toBe(4);
    expect(first.chain.first?.block).toBe(16);
    await new Promise((resolve) => setTimeout(resolve, 100)); // the save is best-effort, in the background
    calls = 0;
    const again = await getEvmActivity(chain, OWNER, null, []);
    expect(calls).toBe(2);
    expect(again.chain.first?.block).toBe(16);
  }, 30_000);
});
