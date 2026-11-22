import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IN_FLIGHT, MAX_RESPONSE_BYTES, limitedFetch, resetFetchGate, takeFetchStats } from "@/server/http/limit";

describe("shared outbound request cap", () => {
  beforeEach(() => resetFetchGate());
  afterEach(() => vi.unstubAllGlobals());

  it("never has more than the cap in flight, and every request still completes", async () => {
    let inFlight = 0;
    let most = 0;
    vi.stubGlobal("fetch", async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return new Response("ok");
    });
    const results = await Promise.all(Array.from({ length: MAX_IN_FLIGHT * 3 }, () => limitedFetch("https://x.test")));
    expect(results).toHaveLength(MAX_IN_FLIGHT * 3);
    expect(most).toBe(MAX_IN_FLIGHT);
    const stats = takeFetchStats();
    expect(stats.active).toBe(0);
    expect(stats.peak).toBe(MAX_IN_FLIGHT);
    expect(stats.queued).toBe(MAX_IN_FLIGHT * 2);
  });

  it("frees the slot when a request fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const failures = await Promise.allSettled(
      Array.from({ length: MAX_IN_FLIGHT + 5 }, () => limitedFetch("https://x.test")),
    );
    expect(failures.every((f) => f.status === "rejected")).toBe(true);
    expect(takeFetchStats().active).toBe(0);
  });
});

describe("answer size cap", () => {
  beforeEach(() => resetFetchGate());
  afterEach(() => vi.unstubAllGlobals());

  it("passes normal answers through unchanged", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x10" }, { status: 200 }));
    const response = await limitedFetch("https://node.test", { method: "POST", body: '{"method":"eth_blockNumber"}' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: "0x10" });
  });

  it("refuses an answer whose declared size is over the cap, without reading it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      async () => new Response("x", { headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } }),
    );
    await expect(limitedFetch("https://big.test", { body: '{"method":"eth_getLogs"}' })).rejects.toThrow(/larger than/);
    expect(warn.mock.calls.some(([line]) => String(line).includes("big.test (eth_getLogs)"))).toBe(true);
    expect(takeFetchStats().active).toBe(0);
    warn.mockRestore();
  });

  it("cuts off a streamed answer once it passes the cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const chunk = new Uint8Array(4 * 1_048_576);
    let sent = 0;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              sent += chunk.byteLength;
              if (sent > MAX_RESPONSE_BYTES * 2) controller.close();
              else controller.enqueue(chunk);
            },
          }),
        ),
    );
    const response = await limitedFetch("https://stream.test");
    await expect(response.text()).rejects.toThrow(/larger than/);
    expect(sent).toBeLessThanOrEqual(MAX_RESPONSE_BYTES + 3 * chunk.byteLength);
    warn.mockRestore();
  });
});
