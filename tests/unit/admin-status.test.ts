import { afterAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
const { newUpdateSchema, cleanText } = await import("@/lib/health/updates");
const { checkLabelKey } = await import("@/lib/health/checks");
const { transitions, transitionMessage } = await import("@/server/health/notify");
const { isAdminAddress, adminAccountIds } = await import("@/server/admin/auth");
const counters = await import("@/server/health/counters");
const { sortChecks, groupFailures } = await import("@/server/health/admin");
const { englishLabel } = await import("@/server/health/runner");
const updates = await import("@/server/services/status-updates");
const { resetDb, getDb } = await import("@/server/db/client");
const { statusUpdates } = await import("@/server/db/schema");

afterAll(() => resetDb());

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 23, 12);
const r = (status: "ok" | "slow" | "fail" | "skipped", minutesAgo: number, detail: string | null = null) => ({
  status,
  at: new Date(T0 - minutesAgo * MIN),
  detail,
});

describe("Telegram messages to admins", () => {
  it("sends one message when a check fails twice in a row, none while it stays down, one when it's fixed", () => {
    const once = transitions(new Map([["tool:tx", [r("fail", 0, "timed out"), r("fail", 30), r("ok", 60)]]]));
    expect(once).toEqual([{ check: "tool:tx", kind: "problem", detail: "timed out", minutes: null }]);
    expect(transitions(new Map([["tool:tx", [r("fail", 0), r("fail", 30), r("fail", 60)]]]))).toEqual([]);
    expect(transitions(new Map([["tool:tx", [r("fail", 0), r("ok", 30)]]]))).toEqual([]);
    const fixed = transitions(
      new Map([["tool:tx", [r("ok", 0), r("fail", 30), r("fail", 60), r("fail", 90), r("ok", 120)]]]),
    );
    expect(fixed).toEqual([{ check: "tool:tx", kind: "fixed", detail: null, minutes: 90 }]);
    expect(transitions(new Map([["bot", [r("skipped", 0), r("fail", 5), r("fail", 10)]]]))[0]?.kind).toBe("problem");
    expect(transitions(new Map([["website", [r("slow", 0), r("fail", 5), r("fail", 10)]]]))[0]?.kind).toBe("fixed");
  });

  it("escapes every value, removes keys and never asks to connect or sign", () => {
    const site = new URL("https://crypy.org");
    const text = transitionMessage(
      { check: "x", kind: "problem", detail: "https://eth.g.alchemy.com/v2/secretkey123456789 <b>", minutes: null },
      "Wallet <activity>",
      site,
      new Date(T0),
    );
    expect(text).toContain("Wallet &lt;activity&gt; has failed twice in a row");
    expect(text).not.toContain("secretkey123456789");
    expect(text).not.toContain("<b> ");
    expect(text).toContain("https://crypy.org/en/admin");
    expect(text.toLowerCase()).not.toMatch(/connect your wallet|sign (this|a message)/);
    expect(
      transitionMessage({ check: "x", kind: "fixed", detail: null, minutes: 38 }, "Gas", site, new Date(T0)),
    ).toContain("is passing again after 38 minutes");
  });

  it("names checks in English from the dictionary", () => {
    expect(englishLabel("chain:bsc")).toBe("BNB Chain connection");
    expect(englishLabel("tool:token-security")).toBe("Token security");
    expect(checkLabelKey("job:token-checks")).toEqual({ key: "job_token-checks" });
  });
});

describe("admin access", () => {
  it("only lists wallets in ADMIN_WALLETS, case-insensitive", () => {
    const admins = ["0x71c7656ec7ab88b098defb751b7401b5f6d8976f"];
    expect(isAdminAddress("0x71C7656EC7ab88b098defB751B7401B5f6d8976F", admins)).toBe(true);
    expect(isAdminAddress("0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be", admins)).toBe(false);
    expect(isAdminAddress("0x71c7656ec7ab88b098defb751b7401b5f6d8976f", [])).toBe(false);
    expect(adminAccountIds(admins)).toEqual(["eip155:1:0x71c7656ec7ab88b098defb751b7401b5f6d8976f"]);
  });
});

describe("status updates", () => {
  it("accepts plain text only, within limits, for known components", () => {
    const ok = newUpdateSchema.parse({
      title: "  Slow‮ activity\n ",
      body: "Line one\r\n\r\n\r\nLine two​",
      state: "ongoing",
      component: "tool:address-analyzer",
    });
    expect(ok).toEqual({
      title: "Slow activity",
      body: "Line one\n\nLine two",
      state: "ongoing",
      component: "tool:address-analyzer",
    });
    expect(
      newUpdateSchema.safeParse({ title: "x", body: "long enough", state: "ongoing", component: null }).success,
    ).toBe(false);
    expect(
      newUpdateSchema.safeParse({ title: "Title", body: "b".repeat(1_001), state: "ongoing", component: null }).success,
    ).toBe(false);
    expect(
      newUpdateSchema.safeParse({ title: "Title", body: "Body text", state: "gone", component: null }).success,
    ).toBe(false);
    expect(
      newUpdateSchema.safeParse({ title: "Title", body: "Body text", state: "fixed", component: "server:disk" })
        .success,
    ).toBe(false);
    expect(cleanText("a\tb", false)).toBe("ab");
  });

  it("shows ongoing and planned updates, and fixed ones for 90 days", async () => {
    const now = Date.now();
    const a = await updates.createUpdate({ title: "Ongoing one", body: "Body", state: "ongoing", component: null });
    await updates.createUpdate(
      { title: "Fixed recently", body: "Body", state: "fixed", component: "website" },
      new Date(now - 10 * 86_400_000),
    );
    await updates.createUpdate(
      { title: "Fixed long ago", body: "Body", state: "fixed", component: null },
      new Date(now - 100 * 86_400_000),
    );
    await updates.createUpdate(
      { title: "Planned long ago", body: "Body", state: "planned", component: null },
      new Date(now - 100 * 86_400_000),
    );
    const titles = (await updates.publicUpdates(now)).map((u) => u.title);
    expect(titles).toEqual(["Ongoing one", "Fixed recently", "Planned long ago"]);

    const fixed = await updates.changeUpdateState(a.id, "fixed");
    expect(fixed?.state).toBe("fixed");
    expect(fixed?.fixedAt).not.toBeNull();
    expect((await updates.changeUpdateState(a.id, "ongoing"))?.fixedAt).toBeNull();
    expect(await updates.changeUpdateState("00000000-0000-4000-8000-000000000000", "fixed")).toBeNull();
    await (await getDb()).delete(statusUpdates);
  });
});

describe("admin dashboard data", () => {
  it("counts per UTC day and starts again at midnight", () => {
    counters.resetCounters();
    counters.countToday("goplus.sent", T0);
    counters.countToday("goplus.sent", T0);
    counters.countToday("rateLimit.refused", T0);
    expect(counters.todayCounts(T0)).toEqual({ "goplus.sent": 2, "goplus.heldBack": 0, "rateLimit.refused": 1 });
    expect(counters.todayCounts(T0 + 13 * 3_600_000)["goplus.sent"]).toBe(0);
    counters.resetCounters();
  });

  it("lists problems first and groups failures by reason", () => {
    const row = (id: string, state: "operational" | "degraded" | "down" | "unknown" | null) => ({
      id,
      group: "tool" as const,
      state,
      status: null,
      ms: null,
      at: null,
      detail: null,
    });
    const sorted = sortChecks([
      row("a", "operational"),
      row("b", null),
      row("c", "down"),
      row("d", "unknown"),
      row("e", "degraded"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "e", "d", "a", "b"]);
    const groups = groupFailures([
      { check: "x", status: "fail", detail: "timeout", at: new Date(T0 - 2 * MIN) },
      { check: "x", status: "fail", detail: "timeout", at: new Date(T0 - MIN) },
      { check: "y", status: "fail", detail: "429", at: new Date(T0) },
      { check: "x", status: "ok", detail: null, at: new Date(T0) },
    ]);
    expect(groups).toEqual([
      { check: "x", detail: "timeout", count: 2, lastAt: new Date(T0 - MIN).toISOString() },
      { check: "y", detail: "429", count: 1, lastAt: new Date(T0).toISOString() },
    ]);
  });
});

describe("components whose own checks aren't set up", () => {
  it("aren't shown as working on the strength of the website and database alone", async () => {
    const { componentState } = await import("@/lib/health/status");
    const states = new Map<string, "operational" | null>([
      ["website", "operational"],
      ["database", "operational"],
      ["job:token-checks", null],
      ["job:checker", "operational"],
    ]);
    expect(componentState({ checks: ["database", "job:token-checks"] }, states)).toBe("unknown");
    expect(componentState({ checks: ["database", "job:checker"] }, states)).toBe("operational");
    expect(componentState({ checks: ["website"] }, states)).toBe("operational");
  });
});
