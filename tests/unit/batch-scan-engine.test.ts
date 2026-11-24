/** S2 Part A: the scan engine never gives up on a row while a reader may answer (BATCH_SCANNER_DESIGN.md §4–5). */
import { describe, expect, it } from "vitest";
import {
  type ChainState,
  type ChunkResult,
  type Reader,
  ReadError,
  type ScanRow,
  crossCheckSample,
  scanChain,
} from "@/lib/batch-scan/engine";

const addresses = Array.from({ length: 250 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
const TOKENS = ["0x00000000000000000000000000000000000000aa"];

/** The true balance of an address: derived from it, so every honest node agrees. */
function truth(address: string): ScanRow {
  const n = BigInt(address);
  return { address, type: "wallet", native: String(n * 10n), tokens: [String(n * 3n)] };
}

type Behaviour = (addresses: string[], block: string | undefined, call: number) => ChunkResult | Error | "hang";

function reader(id: string, behaviour: Behaviour, log?: string[]): Reader & { calls: number } {
  const r = {
    id,
    calls: 0,
    async read(list: string[], _tokens: string[], block: string | undefined, signal: AbortSignal) {
      r.calls += 1;
      log?.push(`${id}:${list.length}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const out = behaviour(list, block, r.calls);
      if (out === "hang") {
        return new Promise<ChunkResult>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      }
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return r;
}

const honest: Behaviour = (list, block) => ({ block: block ?? "1000", rows: list.map(truth) });

async function run(readers: Reader[], extra: Partial<Parameters<typeof scanChain>[0]> = {}) {
  const got = new Map<string, ScanRow>();
  const states: ChainState[] = [];
  const final = await scanChain({
    readers,
    addresses,
    tokens: TOKENS,
    signal: new AbortController().signal,
    onRows: (rows) => rows.forEach((row) => got.set(row.address, row)),
    onState: (s) => states.push(s),
    requestTimeoutMs: 80,
    ...extra,
  });
  return { got, states, final };
}

function expectAllCorrect(got: Map<string, ScanRow>) {
  expect(got.size).toBe(addresses.length);
  for (const a of addresses) expect(got.get(a)).toEqual(truth(a));
}

describe("batch scan engine", () => {
  it("reads every address with healthy readers and cross-checks a sample", async () => {
    const { got, final } = await run([reader("a", honest), reader("b", honest)]);
    expectAllCorrect(got);
    expect(final.phase).toBe("done");
    expect(final.read).toBe(250);
    expect(final.crossCheck?.compared).toBeGreaterThanOrEqual(5);
    expect(final.crossCheck?.matched).toBe(final.crossCheck?.compared);
  });

  it("moves on when a node asks to slow down, without marking anything failed", async () => {
    const busy = reader("busy", () => new ReadError("rate-limited", 60_000));
    const { got, final } = await run([busy, reader("ok", honest)]);
    expectAllCorrect(got);
    expect(final.phase).toBe("done");
    expect(busy.calls).toBe(1); // rested for the time it asked, not asked again
  });

  it("splits a chunk that times out and remembers a smaller size for that node", async () => {
    const log: string[] = [];
    // This node only answers up to 30 addresses in time.
    const slow = reader("slow", (list, block) => (list.length > 30 ? "hang" : honest(list, block, 0)), log);
    const { got } = await run([slow], { crossCheck: false });
    expectAllCorrect(got);
    expect(log.some((l) => l === "slow:100")).toBe(true);
    expect(log.filter((l) => Number(l.split(":")[1]) <= 30).length).toBeGreaterThan(0);
  });

  it("treats empty or wrong answers as failures and reads them elsewhere", async () => {
    const empty = reader("empty", (_list, block) => ({ block: block ?? "1000", rows: [] }));
    const wrongAddresses = reader("wrong", (list, block) => ({
      block: block ?? "1000",
      rows: list.map((a) => truth(a.replace(/.$/, "f"))),
    }));
    const { got } = await run([empty, wrongAddresses, reader("ok", honest)], { crossCheck: false });
    expectAllCorrect(got);
  });

  it("reads cells a node couldn't read again elsewhere", async () => {
    const partial = reader("partial", (list, block) => ({
      block: block ?? "1000",
      rows: list.map((a) => ({ ...truth(a), tokens: [null] })),
    }));
    const { got } = await run([partial, reader("ok", honest)], { crossCheck: false });
    expectAllCorrect(got);
  });

  it("keeps waiting while every node is down, then finishes when one comes back", async () => {
    let downUntil = Date.now() + 1_500;
    const flaky = (id: string) =>
      reader(id, (list, block) => (Date.now() < downUntil ? new ReadError("failed") : honest(list, block, 0)));
    const { got, states, final } = await run([flaky("a"), flaky("b")], { crossCheck: false });
    expectAllCorrect(got);
    expect(states.some((s) => s.phase === "waiting" && s.reason === "nodes-down")).toBe(true);
    expect(final.phase).toBe("done");
    downUntil = 0;
  }, 20_000);

  it("says 'stalled' after a long outage but keeps trying", async () => {
    let calls = 0;
    const down = reader("down", (list, block) => (++calls < 4 ? new ReadError("failed") : honest(list, block, 0)));
    const { got, states } = await run([down], { stallAfterMs: 200, crossCheck: false });
    expect(states.some((s) => s.phase === "stalled")).toBe(true);
    expectAllCorrect(got);
  }, 20_000);

  it("corrects a node that answers wrong numbers when a third reading agrees with the other", async () => {
    const liar = reader("liar", (list, block) => ({
      block: block ?? "1000",
      rows: list.map((a) => ({ ...truth(a), native: "1" })),
    }));
    // The liar reads everything first (only reader at the start), then two honest readers check.
    const a = reader("a", honest);
    const b = reader("b", honest);
    const got = new Map<string, ScanRow>();
    const final = await scanChain({
      readers: [liar, a, b],
      addresses: addresses.slice(0, 50),
      tokens: TOKENS,
      signal: new AbortController().signal,
      onRows: (rows) => rows.forEach((row) => got.set(row.address, row)),
      requestTimeoutMs: 80,
      concurrency: 1,
      crossCheck: { fraction: 1, min: 50 },
    });
    expect(final.crossCheck?.compared).toBeGreaterThan(0);
    expect(final.crossCheck?.corrected).toBe(final.crossCheck?.compared);
    for (const addr of addresses.slice(0, 50)) expect(got.get(addr)).toEqual(truth(addr));
  });

  it("records the block range when a node answers from a newer block", async () => {
    let block = 1000;
    const moving = reader("m", (list) => ({ block: String(block++), rows: list.map(truth) }));
    const { final } = await run([moving], { crossCheck: false });
    expect(final.blocks?.[0]).toBe("1000");
    expect(Number(final.blocks?.[1])).toBeGreaterThan(1000);
  });

  it("stops when cancelled, and gives up only after the long limit", async () => {
    const controller = new AbortController();
    const hang = reader("h", () => "hang");
    const promise = scanChain({
      readers: [hang],
      addresses,
      tokens: TOKENS,
      signal: controller.signal,
      onRows: () => {},
      requestTimeoutMs: 50,
      crossCheck: false,
    });
    setTimeout(() => controller.abort(), 300);
    expect((await promise).phase).toBe("cancelled");

    const never = reader("n", () => new ReadError("failed"));
    const gaveUp = await scanChain({
      readers: [never],
      addresses: addresses.slice(0, 5),
      tokens: TOKENS,
      signal: new AbortController().signal,
      onRows: () => {},
      giveUpAfterMs: 400,
      crossCheck: false,
    });
    expect(gaveUp.phase).toBe("gave-up");
    expect(gaveUp.read).toBe(0);
  }, 20_000);

  it("pauses without starting new chunks", async () => {
    let paused = true;
    const r = reader("p", honest);
    setTimeout(() => (paused = false), 400);
    const start = Date.now();
    const { got } = await run([r], { isPaused: () => paused, crossCheck: false });
    expect(Date.now() - start).toBeGreaterThanOrEqual(350);
    expectAllCorrect(got);
  });

  it("spreads the cross-check sample over the list", () => {
    expect(crossCheckSample(addresses, 0.02, 5)).toHaveLength(5);
    expect(
      crossCheckSample(
        Array.from({ length: 1000 }, (_, i) => String(i)),
        0.02,
        5,
      ),
    ).toHaveLength(20);
    expect(crossCheckSample([], 0.02, 5)).toEqual([]);
  });
});
