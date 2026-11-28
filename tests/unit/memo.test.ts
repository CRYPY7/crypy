import { describe, expect, it, vi } from "vitest";
import { memoCache } from "@/server/memo";

/** R2: outside sources are remembered in memory instead of Next.js "use cache" (see server/memo.ts). */
describe("memoCache", () => {
  it("shares one read while it runs, then keeps it for the lifetime the answer chose", async () => {
    vi.useFakeTimers({ now: 0 });
    const cache = memoCache<string>(10);
    const read = vi.fn(async (life: { set(l: { revalidate: number }): void }) => {
      life.set({ revalidate: 10 });
      return "answer";
    });
    const [a, b] = await Promise.all([cache.remember("k", read), cache.remember("k", read)]);
    expect([a, b]).toEqual(["answer", "answer"]);
    expect(read).toHaveBeenCalledTimes(1);
    vi.setSystemTime(9_000);
    await cache.remember("k", read);
    expect(read).toHaveBeenCalledTimes(1);
    vi.setSystemTime(11_000);
    await cache.remember("k", read);
    expect(read).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("doesn't keep failures and drops the oldest key when full", async () => {
    const cache = memoCache<string>(2);
    await expect(cache.remember("bad", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await Promise.resolve();
    expect(await cache.remember("bad", async () => "ok now")).toBe("ok now");
    await cache.remember("x", async () => "x");
    await cache.remember("y", async () => "y");
    expect(cache.size()).toBe(2);
  });
});
