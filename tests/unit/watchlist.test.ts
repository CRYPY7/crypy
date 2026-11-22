import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_WATCH_ITEMS,
  ownWalletDefaults,
  tokenDefaults,
  watchItemInput,
  watchOnlyDefaults,
} from "@/lib/watchlist/rules";

process.env.PGLITE_DIR = "memory";
const { getDb, resetDb } = await import("@/server/db/client");
const { users } = await import("@/server/db/schema");
const svc = await import("@/server/services/watchlist");

const OWN = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

async function newUser() {
  const db = await getDb();
  const [user] = await db.insert(users).values({}).returning();
  return { db, userId: user!.id };
}

describe("watchlist", () => {
  afterAll(() => resetDb());

  it("uses the right defaults: own wallet, someone else's wallet, a token", async () => {
    const { db, userId } = await newUser();
    const own = await svc.addWatchItem(
      userId,
      OWN,
      { kind: "address", target: OWN.toLowerCase(), label: " Main " },
      db,
    );
    const other = await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(7), label: "" }, db);
    const token = await svc.addWatchItem(
      userId,
      OWN,
      { kind: "token", chain: "bsc", target: addr(9), label: "HBR" },
      db,
    );
    if (!own.ok || !other.ok || !token.ok) throw new Error("add failed");
    expect(own.item).toMatchObject({ target: OWN, label: "Main", chain: "", rules: ownWalletDefaults });
    expect(other.item.rules).toEqual(watchOnlyDefaults);
    expect(token.item).toMatchObject({ chain: "bsc", rules: tokenDefaults });
  });

  it("refuses duplicates, unknown chains, and more than the limit", async () => {
    const { db, userId } = await newUser();
    for (let i = 1; i <= MAX_WATCH_ITEMS; i++)
      expect((await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(i), label: "" }, db)).ok).toBe(true);
    expect(await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(99), label: "" }, db)).toEqual({
      ok: false,
      reason: "full",
    });
    await svc.removeWatchItem(userId, (await svc.listWatchItems(userId, db))[0]!.id, db);
    expect(await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(2), label: "" }, db)).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(
      await svc.addWatchItem(userId, OWN, { kind: "token", chain: "solana", target: addr(3), label: "" }, db),
    ).toEqual({
      ok: false,
      reason: "chain",
    });
  });

  it("one person can never see, change or remove another person's items", async () => {
    const a = await newUser();
    const b = await newUser();
    const added = await svc.addWatchItem(a.userId, OWN, { kind: "address", target: addr(5), label: "" }, a.db);
    if (!added.ok) throw new Error("add failed");
    expect(await svc.listWatchItems(b.userId, b.db)).toEqual([]);
    expect(await svc.updateWatchItem(b.userId, added.item.id, { label: "x" }, b.db)).toBeNull();
    expect(await svc.removeWatchItem(b.userId, added.item.id, b.db)).toBe(false);
    expect(await svc.listWatchItems(a.userId, a.db)).toHaveLength(1);
  });

  it("rules must match the item's kind, and labels are cleaned", async () => {
    const { db, userId } = await newUser();
    const added = await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(8), label: "" }, db);
    if (!added.ok) throw new Error("add failed");
    expect(await svc.updateWatchItem(userId, added.item.id, { rules: tokenDefaults }, db)).toBe("invalid");
    const updated = await svc.updateWatchItem(
      userId,
      added.item.id,
      { label: "Cold‮ wallet", rules: { ...watchOnlyDefaults, approvals: { on: true } } },
      db,
    );
    expect(updated).toMatchObject({ label: "Cold wallet", rules: { approvals: { on: true } } });
  });

  it("input validation rejects junk and unknown fields", () => {
    expect(watchItemInput.safeParse({ kind: "address", target: "0x123" }).success).toBe(false);
    expect(watchItemInput.safeParse({ kind: "address", target: OWN, extra: 1 }).success).toBe(false);
    expect(watchItemInput.safeParse({ kind: "token", target: OWN }).success).toBe(false);
  });

  it("export lists the person's data without session tokens; delete removes everything", async () => {
    const { db, userId } = await newUser();
    await svc.addWatchItem(userId, OWN, { kind: "address", target: addr(4), label: "" }, db);
    const data = await svc.exportAccount(userId, db);
    expect(data.watchlist).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/token_?hash/i);
    await svc.deleteAccount(userId, db);
    expect(await svc.listWatchItems(userId, db)).toEqual([]);
  });
});
