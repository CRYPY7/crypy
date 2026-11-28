import { afterAll, describe, expect, it, vi } from "vitest";

// A made-up key, so CRYPY sets up Alchemy as a provider; every request goes to the stand-in below.
process.env.PGLITE_DIR = "memory";
process.env.ALCHEMY_API_KEY = "testkey0123456789abcdef";
const { liveChains } = await import("@/config/chains");
const { getEvmActivity } = await import("@/server/chains/evm/activity");
const { resetAlchemyPace } = await import("@/server/chains/evm/alchemy-pace");
const { resetUsage } = await import("@/server/chains/evm/providers");

/** Stand-in Alchemy: transfer lists answer at once (empty); everything else fails at once (no network in tests). */
const calls: { method: string; at: number }[] = [];
const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (url.includes(".g.alchemy.com") && body?.method === "alchemy_getAssetTransfers") {
    calls.push({ method: body.method, at: Date.now() });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { transfers: [] } }), {
      headers: { "content-type": "application/json" },
    });
  }
  throw new TypeError("fetch failed (test: no network)");
});
afterAll(() => fetchSpy.mockRestore());

const OWNER = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";

describe("activity on every chain at once (owner's live audit, 2026-11-24)", () => {
  it("every chain gets its full history, not only the first ones within Alchemy's per-second budget", async () => {
    resetUsage();
    resetAlchemyPace();
    const chains = liveChains.filter((c) => c.capabilities.activity && c.alchemyNetwork);
    expect(chains.length).toBe(5);
    const pages = await Promise.all(chains.map((chain) => getEvmActivity(chain, OWNER, null, [])));
    expect(pages.map((p) => `${p.chain.chain}:${p.chain.source}`)).toEqual(chains.map((c) => `${c.key}:history`));
    // The transfer lists themselves (sent and received) were asked for on every chain.
    expect(calls.length).toBeGreaterThanOrEqual(chains.length * 2);
  }, 30_000);
});
