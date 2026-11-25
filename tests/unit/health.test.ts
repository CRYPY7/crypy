import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { toolIds } = await import("@/config/tools");
const { liveChains } = await import("@/config/chains");
const { checkDefinitions, statusComponents, findCheck, ROUND_MS, TOOL_EVERY_MS } = await import("@/lib/health/checks");
const status = await import("@/lib/health/status");
const { resetDb, getDb } = await import("@/server/db/client");
const { healthChecks } = await import("@/server/db/schema");
const runner = await import("@/server/health/runner");
const { probes, Skip } = await import("@/server/health/probes");
const jobs = await import("@/server/health/jobs");

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms);
const MIN = 60_000;

afterAll(() => resetDb());

describe("check definitions", () => {
  it("has a check for every definition and a status line for every tool and chain", () => {
    for (const d of checkDefinitions) expect(probes[d.id], d.id).toBeTypeOf("function");
    const tools = statusComponents.filter((c) => c.tool).map((c) => c.tool);
    expect(new Set(tools)).toEqual(new Set(toolIds));
    for (const chain of liveChains) expect(statusComponents.some((c) => c.chain === chain.key)).toBe(true);
    for (const c of statusComponents)
      for (const id of [...c.checks, ...(c.someOf ?? [])]) expect(findCheck(id), `${c.id} → ${id}`).toBeDefined();
  });

  it("keeps server internals off the public page", () => {
    const publicChecks = new Set(statusComponents.flatMap((c) => [...c.checks, ...(c.someOf ?? [])]));
    for (const id of publicChecks) expect(id.startsWith("server:"), id).toBe(false);
  });
});

describe("check state", () => {
  const quick = { everyMs: ROUND_MS };
  it("passes, degrades on one failure or slowness, and is down after two failures in a row", () => {
    expect(status.checkState(quick, [{ status: "ok", at: ago(MIN) }], NOW)).toBe("operational");
    expect(status.checkState(quick, [{ status: "slow", at: ago(MIN) }], NOW)).toBe("degraded");
    expect(
      status.checkState(
        quick,
        [
          { status: "fail", at: ago(MIN) },
          { status: "ok", at: ago(6 * MIN) },
        ],
        NOW,
      ),
    ).toBe("degraded");
    expect(
      status.checkState(
        quick,
        [
          { status: "fail", at: ago(MIN) },
          { status: "fail", at: ago(6 * MIN) },
        ],
        NOW,
      ),
    ).toBe("down");
    expect(
      status.checkState(
        quick,
        [
          { status: "ok", at: ago(MIN) },
          { status: "fail", at: ago(6 * MIN) },
        ],
        NOW,
      ),
    ).toBe("operational");
  });

  it("claims nothing when results are old or missing, and leaves out skipped checks", () => {
    expect(status.checkState(quick, [], NOW)).toBe("unknown");
    expect(status.checkState(quick, [{ status: "ok", at: ago(17 * MIN) }], NOW)).toBe("unknown");
    expect(status.checkState(quick, [{ status: "ok", at: ago(15 * MIN) }], NOW)).toBe("operational");
    expect(status.checkState({ everyMs: TOOL_EVERY_MS }, [{ status: "ok", at: ago(80 * MIN) }], NOW)).toBe(
      "operational",
    );
    expect(status.checkState(quick, [{ status: "skipped", at: ago(MIN) }], NOW)).toBeNull();
  });
});

describe("component state", () => {
  const states = new Map<string, ReturnType<typeof status.checkState>>([
    ["website", "operational"],
    ["tool:tx", "down"],
    ["a", "operational"],
    ["b", "down"],
    ["c", "down"],
    ["bot", null],
  ]);
  it("is as bad as the worst check it needs", () => {
    expect(status.componentState({ checks: ["website", "tool:tx"] }, states)).toBe("down");
    // A skipped check is left out, but a component with nothing of its own set up isn't claimed as working.
    expect(status.componentState({ checks: ["website", "tool:tx", "bot"] }, states)).toBe("down");
    expect(status.componentState({ checks: ["website", "bot"] }, states)).toBe("unknown");
  });
  it("is down only when every per-chain alternative is down", () => {
    expect(status.componentState({ checks: ["website"], someOf: ["a", "b"] }, states)).toBe("degraded");
    expect(status.componentState({ checks: ["website"], someOf: ["b", "c"] }, states)).toBe("down");
    expect(status.componentState({ checks: ["website"], someOf: ["a"] }, states)).toBe("operational");
  });
  it("headline: down only when the website is down", () => {
    expect(runner.overallState([{ id: "website", state: "down" }])).toBe("down");
    expect(
      runner.overallState([
        { id: "website", state: "operational" },
        { id: "tool:tx-checker", state: "down" },
      ]),
    ).toBe("degraded");
    expect(runner.overallState([{ id: "website", state: "unknown" }])).toBe("unknown");
    expect(
      runner.overallState([
        { id: "website", state: "operational" },
        { id: "x", state: "unknown" },
      ]),
    ).toBe("operational");
  });
});

describe("daily bars", () => {
  const days = status.lastDays(3, NOW);
  it("lists UTC days oldest first", () => {
    expect(days).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
  });
  it("sums every check a component needs and marks days without data as none", () => {
    const bars = status.dayBars(
      { checks: ["website", "tool:tx"] },
      [
        { check: "website", day: "2026-11-21", total: 288, failed: 0 },
        { check: "tool:tx", day: "2026-11-21", total: 48, failed: 12 },
        { check: "website", day: "2026-11-22", total: 144, failed: 0 },
        { check: "other", day: "2026-11-22", total: 10, failed: 10 },
      ],
      days,
    );
    expect(bars.map((b) => b.state)).toEqual(["none", "degraded", "operational"]);
    expect(bars[1]!.uptime).toBeCloseTo(324 / 336);
    expect(status.uptimeShare(bars)).toBeCloseTo((324 / 336 + 1) / 2);
    expect(status.uptimeShare([{ day: "x", state: "none", uptime: null }])).toBeNull();
  });
});

describe("running checks", () => {
  const def = { id: "t", group: "tool" as const, everyMs: TOOL_EVERY_MS, slowMs: 50 };

  it("picks every due quick check and at most two tool checks, longest-waiting first", () => {
    const ranAt = new Map<string, number>([
      ["tool:search", NOW - 31 * MIN],
      ["tool:balances", NOW - 40 * MIN],
      ["tool:tx", NOW - 10 * MIN],
      ["website", NOW - 4.6 * MIN],
      ["database", NOW - 2 * MIN],
    ]);
    const due = runner.dueChecks(checkDefinitions, ranAt, NOW).map((d) => d.id);
    expect(due).toContain("website");
    expect(due).not.toContain("database");
    const tools = due.filter((id) => id.startsWith("tool:"));
    expect(tools).toHaveLength(2);
    expect(tools).not.toContain("tool:tx");
    // Never ran before: those wait longest.
    expect(tools.every((id) => !ranAt.has(id))).toBe(true);
  });

  it("saves passed, slow, failed and skipped results with keys removed", async () => {
    expect((await runner.runProbe(def, async () => "block 1")).status).toBe("ok");
    expect((await runner.runProbe(def, async () => "slow:90% used")).status).toBe("slow");
    const slow = await runner.runProbe(def, () => new Promise((r) => setTimeout(r, 80)));
    expect(slow.status).toBe("slow");
    const failed = await runner.runProbe(def, async () => {
      throw new Error("https://eth-mainnet.g.alchemy.com/v2/abcdefghijklmnop1234 refused");
    });
    expect(failed.status).toBe("fail");
    expect(failed.detail).not.toContain("abcdefghijklmnop1234");
    const skipped = await runner.runProbe(def, async () => {
      throw new Skip("no bot");
    });
    expect(skipped).toMatchObject({ status: "skipped", ms: null });
    const late = await runner.runProbe(def, () => new Promise(() => undefined), 30);
    expect(late.status).toBe("fail");
  });

  it("reads job heartbeats without calling anything", async () => {
    jobs.resetJobHeartbeats();
    await expect(probes["job:checker"]!()).rejects.toBeInstanceOf(Skip);
    jobs.registerJob("checker", 60_000);
    await expect(probes["job:checker"]!()).resolves.toBeUndefined(); // just started
    jobs.noteJobRun("checker", null);
    await expect(probes["job:checker"]!()).resolves.toBeUndefined();
    jobs.registerJob("checker", 60_000, Date.now() - 10 * MIN);
    jobs.noteJobRun("checker", "provider refused", Date.now() - 5 * MIN);
    await expect(probes["job:checker"]!()).rejects.toThrow("provider refused");
    jobs.resetJobHeartbeats();
  });

  it("daily token checks: right after a restart (first round still running) it says so instead of failing (B-016)", async () => {
    jobs.resetJobHeartbeats();
    jobs.registerJob("token-checks", 10 * MIN);
    // Empty database: every curated token's check is missing.
    await expect(probes["job:token-checks"]!()).resolves.toMatch(/^slow:.*first round after a restart/);
    jobs.noteJobRun("token-checks", null);
    await expect(probes["job:token-checks"]!()).rejects.toThrow(/token checks are old or missing/);
    jobs.resetJobHeartbeats();
  });
});

describe("saved results", () => {
  it("builds the public status from saved rows only, and removes rows older than 90 days", async () => {
    const db = await getDb();
    const now = Date.now();
    await db.insert(healthChecks).values([
      { check: "website", status: "ok", ms: 120, detail: null, checkedAt: new Date(now - MIN) },
      { check: "tool:tx", status: "fail", ms: 900, detail: "secret reason", checkedAt: new Date(now - MIN) },
      { check: "tool:tx", status: "fail", ms: 900, detail: "secret reason", checkedAt: new Date(now - 31 * MIN) },
      { check: "website", status: "ok", ms: 100, detail: null, checkedAt: new Date(now - 91 * 86_400_000) },
    ]);
    const result = await runner.publicStatus(now);
    expect(result.overall).toBe("degraded");
    expect(result.components.find((c) => c.id === "website")?.state).toBe("operational");
    expect(result.components.find((c) => c.id === "tool:tx-checker")?.state).toBe("down");
    expect(result.components.find((c) => c.id === "tool:unit-converter")?.state).toBe("operational");
    expect(result.components.find((c) => c.id === "chain:ethereum")?.state).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("secret reason");
    expect(result.components[0]!.bars).toHaveLength(90);

    await runner.pruneHealthChecks(now);
    const left = await db.select().from(healthChecks);
    expect(left).toHaveLength(3);
  });
});
