import { afterEach, describe, expect, it, vi } from "vitest";
import { freshOrSaved, resetFreshOrSaved } from "@/server/saved/fresh-or-saved";

/** Stabilization S2 (B-006, B-013, B-018): never wait long when a saved reading exists. */
const saved = (data: string) => async () => ({ data, savedAt: "2026-11-24T10:00:00.000Z" });
const none = async () => undefined;
const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

afterEach(() => resetFreshOrSaved());

describe("freshOrSaved", () => {
  it("a quick fresh read is used and saved", async () => {
    const onFresh = vi.fn();
    const result = await freshOrSaved("k1", async () => "new", saved("old"), onFresh, 200);
    expect(result).toEqual({ kind: "fresh", value: "new" });
    expect(onFresh).toHaveBeenCalledWith("new");
  });

  it("a slow fresh read shows the saved one at once; the next request gets the fresh one without reading again", async () => {
    const fresh = vi.fn(() => later(150, "new"));
    const onFresh = vi.fn();
    const started = Date.now();
    const first = await freshOrSaved("k2", fresh, saved("old"), onFresh, 50);
    expect(Date.now() - started).toBeLessThan(140);
    expect(first).toMatchObject({ kind: "saved", value: "old", refreshing: true });
    // A second request while it runs joins the same read.
    const second = await freshOrSaved("k2", fresh, saved("old"), onFresh, 50);
    expect(second).toMatchObject({ kind: "saved", refreshing: true });
    await later(150, null);
    expect(onFresh).toHaveBeenCalledWith("new");
    const third = await freshOrSaved("k2", fresh, saved("old"), onFresh, 50);
    expect(third).toEqual({ kind: "fresh", value: "new" });
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("a slow fresh read with nothing saved is waited for", async () => {
    const result = await freshOrSaved(
      "k3",
      () => later(120, "new"),
      none,
      () => {},
      30,
    );
    expect(result).toEqual({ kind: "fresh", value: "new" });
  });

  it("a failed read shows the saved one (not refreshing), or fails when nothing is saved; failures aren't kept", async () => {
    const boom = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await freshOrSaved("k4", boom, saved("old"), () => {}, 50)).toMatchObject({
      kind: "saved",
      value: "old",
      refreshing: false,
    });
    const failed = await freshOrSaved("k4", boom, none, () => {}, 50);
    expect(failed.kind).toBe("failed");
    expect(boom).toHaveBeenCalledTimes(2);
  });

  it("a fresh read that fails after the saved one was shown leaves no stale entry", async () => {
    const fresh = vi.fn(() => later(80, null).then(() => Promise.reject(new Error("down"))));
    expect(await freshOrSaved("k5", fresh, saved("old"), () => {}, 20)).toMatchObject({ refreshing: true });
    await later(100, null);
    expect(await freshOrSaved("k5", fresh, saved("old"), () => {}, 200)).toMatchObject({
      kind: "saved",
      refreshing: false,
    });
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it("R2: the saved reading is asked for before the fresh read starts", async () => {
    const order: string[] = [];
    await freshOrSaved(
      "k-order",
      async () => (order.push("fresh"), "new"),
      async () => (order.push("saved"), { data: "old", savedAt: "2026-11-24T10:00:00.000Z" }),
      () => {},
      50,
    );
    expect(order).toEqual(["saved", "fresh"]);
  });

  it("R2: a fresh read finishing while the database is still answering is shown at once", async () => {
    const started = Date.now();
    const result = await freshOrSaved(
      "k-race",
      () => later(80, "new"),
      () => later(400, { data: "old", savedAt: "2026-11-24T10:00:00.000Z" }),
      () => {},
      20,
    );
    expect(result).toEqual({ kind: "fresh", value: "new" });
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("R2: a fresh read failing while the database answers gives the saved reading, not 'checking for changes'", async () => {
    const result = await freshOrSaved(
      "k-race-fail",
      () => later(40, null).then(() => Promise.reject(new Error("down"))),
      () => later(150, { data: "old", savedAt: "2026-11-24T10:00:00.000Z" }),
      () => {},
      20,
    );
    expect(result).toMatchObject({ kind: "saved", value: "old", refreshing: false });
  });

  it("R2: a fresh result the caller says not to keep (still completing) is read again on the reload", async () => {
    let reads = 0;
    const saved = async () => ({ data: "old", savedAt: "2026-11-24T10:00:00.000Z" });
    const fresh = () => later(60, `partial-${++reads}`);
    const shown = await freshOrSaved(
      "k-keep",
      fresh,
      saved,
      () => {},
      10,
      () => false,
    );
    expect(shown).toMatchObject({ kind: "saved", refreshing: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reload = await freshOrSaved(
      "k-keep",
      fresh,
      saved,
      () => {},
      200,
      () => false,
    );
    expect(reload).toEqual({ kind: "fresh", value: "partial-2" });
  });
});
