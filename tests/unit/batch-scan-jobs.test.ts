/** S2 Part A: scan jobs on the server — caps, line, daily allowance, pause, cancel, 1-hour retention. */
import { describe, expect, it } from "vitest";
import type { Reader } from "@/lib/batch-scan/engine";
import { type CreateResult, type ScanDeps, ScanManager } from "@/server/batch-scan/jobs";

function jid(r: CreateResult): string {
  if (!("jobId" in r)) throw new Error(JSON.stringify(r));
  return r.jobId;
}

const wallets = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => `0x${(i + 1 + offset).toString(16).padStart(40, "0")}`);

function slowReader(ms = 30): Reader {
  return {
    id: "r",
    async read(list, tokens, block) {
      await new Promise((r) => setTimeout(r, ms));
      return {
        block: block ?? "7",
        rows: list.map((address) => ({ address, type: "wallet", native: "1", tokens: tokens.map(() => "2") })),
      };
    },
  };
}

function manager(limits: Partial<ConstructorParameters<typeof ScanManager>[0]> = {}, deps: Partial<ScanDeps> = {}) {
  let t = Date.parse("2026-11-24T10:00:00Z");
  const finished: boolean[] = [];
  const m = new ScanManager(
    { maxRunning: 1, maxQueued: 2, maxWallets: 100, dailyWallets: 250, ...limits },
    {
      readersFor: () => [slowReader(), { ...slowReader(), id: "r2" }],
      checkTokens: async (_chain, tokens) => ({
        tokens: tokens.filter((x) => !x.endsWith("dead")),
        notOnChain: tokens.filter((x) => x.endsWith("dead")),
      }),
      pricesFor: async () => ({ native: 600 }),
      onFinished: ({ complete }) => finished.push(complete),
      now: () => t,
      engine: { crossCheck: false },
      ...deps,
    },
  );
  return { m, finished, advance: (ms: number) => (t += ms) };
}

async function until(check: () => boolean, ms = 5_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("batch scan jobs", () => {
  it("runs a scan to the end and returns rows incrementally", async () => {
    const { m, finished } = manager();
    const created = m.create("visitor-a", {
      chains: ["bsc", "base"],
      addresses: wallets(40),
      tokens: { bsc: ["0x" + "1".repeat(40)], base: ["0x" + "2".repeat(36) + "dead"] },
    });
    expect(created.refused).toBeUndefined();
    const id = jid(created);
    await until(() => m.view(id)!.status === "done");
    const view = m.view(id)!;
    expect(view.chains.bsc!.read).toBe(40);
    expect(view.chains.base!.read).toBe(40);
    expect(view.chains.base!.notOnChain).toEqual(["0x" + "2".repeat(36) + "dead"]);
    expect(view.chains.bsc!.prices).toEqual({ native: 600 });
    expect(view.rows).toHaveLength(80);
    expect(m.view(id, view.seq)!.rows).toHaveLength(0);
    expect(finished).toEqual([true]);
  });

  it("puts scans in line beyond the running cap and refuses when the line is full", () => {
    const { m } = manager();
    const a = m.create("a", { chains: ["bsc"], addresses: wallets(10), tokens: {} });
    const b = m.create("b", { chains: ["bsc"], addresses: wallets(10), tokens: {} });
    const c = m.create("c", { chains: ["bsc"], addresses: wallets(10), tokens: {} });
    expect(m.view(jid(a))!.status).toBe("running");
    expect(m.view(jid(b))!.position).toBe(1);
    expect(m.view(jid(c))!.position).toBe(2);
    expect(m.view(jid(c))!.startsIn).toBeGreaterThan(0);
    expect(m.create("d", { chains: ["bsc"], addresses: wallets(10), tokens: {} })).toEqual({ refused: "busy" });
    m.control(jid(a), "cancel");
  });

  it("allows one scan at a time per visitor, then the next", async () => {
    const { m } = manager({ maxRunning: 2 });
    const first = m.create("a", { chains: ["bsc"], addresses: wallets(10), tokens: {} });
    const again = m.create("a", { chains: ["bsc"], addresses: wallets(10), tokens: {} });
    expect(again).toEqual({ refused: "active", jobId: jid(first) });
    await until(() => m.view(jid(first))!.status === "done");
    expect(m.create("a", { chains: ["bsc"], addresses: wallets(10), tokens: {} }).refused).toBeUndefined();
  });

  it("enforces wallets per scan and the daily allowance, resetting at 00:00 UTC", async () => {
    const { m, advance } = manager({ maxRunning: 5, maxQueued: 5 });
    expect(m.create("a", { chains: ["bsc"], addresses: wallets(101), tokens: {} })).toEqual({
      refused: "too-many",
      maxWallets: 100,
    });
    const one = m.create("a", { chains: ["bsc"], addresses: wallets(100), tokens: {} });
    await until(() => m.view(jid(one))!.status === "done");
    const two = m.create("a", { chains: ["bsc"], addresses: wallets(100, 100), tokens: {} });
    await until(() => m.view(jid(two))!.status === "done");
    const refused = m.create("a", { chains: ["bsc"], addresses: wallets(60), tokens: {} });
    expect(refused).toEqual({ refused: "daily-limit", dailyWallets: 250, resetsAt: "2026-11-25T00:00:00.000Z" });
    advance(14 * 60 * 60_000);
    expect(m.create("a", { chains: ["bsc"], addresses: wallets(60), tokens: {} }).refused).toBeUndefined();
  });

  it("pauses, resumes and cancels", async () => {
    const { m } = manager({}, { readersFor: () => [slowReader(60)] });
    const jobId = jid(m.create("a", { chains: ["bsc"], addresses: wallets(100), tokens: {} }));
    m.control(jobId, "pause");
    expect(m.view(jobId)!.status).toBe("paused");
    await new Promise((r) => setTimeout(r, 300));
    expect(m.view(jobId)!.chains.bsc!.read).toBeLessThan(100);
    m.control(jobId, "resume");
    m.control(jobId, "cancel");
    await until(() => m.view(jobId)!.status === "cancelled");
    expect(m.control(jobId, "resume")).toBe(false);
  });

  it("deletes results 1 hour after the end and abandoned places in line after 30 minutes", async () => {
    const hang: Reader = {
      id: "h",
      read: (_l, _t, _b, signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("x")))),
    };
    const { m, advance } = manager(
      {},
      { readersFor: () => [hang], engine: { crossCheck: false, requestTimeoutMs: 60_000 } },
    );
    const running = m.create("a", { chains: ["bsc"], addresses: wallets(5), tokens: {} });
    const waiting = m.create("b", { chains: ["bsc"], addresses: wallets(5), tokens: {} });
    expect(m.view(jid(waiting))!.status).toBe("queued");
    advance(31 * 60_000);
    m.sweep();
    expect(m.view(jid(waiting))).toBeNull();
    expect(m.view(jid(running))!.status).toBe("running"); // a running scan keeps going when nobody looks
    m.control(jid(running), "cancel");
    await until(() => m.view(jid(running))!.status === "cancelled");
    advance(59 * 60_000);
    m.sweep();
    expect(m.view(jid(running))).not.toBeNull();
    advance(2 * 60_000);
    m.sweep();
    expect(m.view(jid(running))).toBeNull();
  });
});
