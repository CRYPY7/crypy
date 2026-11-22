import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** A stand-in Telegram API on this machine records every call (test fixture only). */
const calls: { method: string; body: Record<string, unknown> }[] = [];
let blockSends = false;
const server: Server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const method = req.url!.split("/").pop()!;
    calls.push({ method, body: JSON.parse(body || "{}") });
    res.writeHead(200, { "content-type": "application/json" });
    if (method === "sendMessage" && blockSends)
      return res.end(
        JSON.stringify({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }),
      );
    if (method === "getMe")
      return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: "crypyalertsbot" } }));
    res.end(JSON.stringify({ ok: true, result: true }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
process.env.PGLITE_DIR = "memory";
process.env.TELEGRAM_BOT_TOKEN = "123456789:AAtesttesttesttesttesttesttesttest12";
process.env.TELEGRAM_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const { getDb, resetDb } = await import("@/server/db/client");
const { users, watchItems, alerts } = await import("@/server/db/schema");
const { eq } = await import("drizzle-orm");
const tg = await import("@/server/services/telegram");
const { handleUpdate } = await import("@/server/telegram/bot");
const { deliverQueued } = await import("@/server/alerts/deliver");
const { enqueueAlerts, listAlerts } = await import("@/server/alerts/store");

afterAll(() => {
  server.close();
  resetDb();
});

let userId = "";
const replies: string[] = [];
const send = async (_chat: string, html: string) => void replies.push(html);
const db = await getDb();

beforeAll(async () => {
  const [u] = await db.insert(users).values({}).returning();
  userId = u!.id;
});
beforeEach(() => {
  calls.length = 0;
  replies.length = 0;
  blockSends = false;
});

const startUpdate = (text: string, chatId = 555) => ({
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: chatId, type: "private" as const },
    from: { id: chatId, is_bot: false, username: "usman_k" },
    text,
  },
});

describe("connecting Telegram", () => {
  it("/start with the page's code links the chat once; a reused code doesn't", async () => {
    const { code } = await tg.createLinkCode(userId);
    expect(tg.displayLinkCode(code)).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect((await tg.alertSettings(userId))!.pendingCode).toBe(true);
    await handleUpdate(startUpdate(`/start ${code}`), db, send);
    expect(replies[0]).toContain("Connected to CRYPY");
    const settings = (await tg.alertSettings(userId))!;
    expect(settings.telegram).toMatchObject({ connected: true, username: "usman_k" });
    expect(settings.pendingCode).toBe(false);
    await handleUpdate(startUpdate(`/start ${code}`, 777), db, send);
    expect(replies[1]).toContain("isn't valid");
  });

  it("an expired code is refused; typing the code with a dash or in lower case works", async () => {
    const old = await tg.createLinkCode(userId, new Date(Date.now() - 11 * 60_000));
    expect(await tg.linkTelegramChat(old.code, "555", null, new Date(), db)).toEqual({ ok: false, reason: "expired" });
    const fresh = await tg.createLinkCode(userId);
    const typed = tg.displayLinkCode(fresh.code).toLowerCase();
    expect(await tg.linkTelegramChat(typed, "555", "usman_k", new Date(), db)).toMatchObject({ ok: true });
  });

  it("the Mute button mutes only the person's own item; /stop disconnects", async () => {
    const [item] = await db
      .insert(watchItems)
      .values({ userId, kind: "address", target: "0xabc", rules: {} })
      .returning();
    await handleUpdate(
      {
        update_id: 2,
        callback_query: {
          id: "q1",
          from: { id: 555, is_bot: false },
          message: { message_id: 3, chat: { id: 555, type: "private" } },
          data: `mute:${item!.id}`,
        },
      },
      db,
      send,
    );
    expect((await db.select().from(watchItems).where(eq(watchItems.id, item!.id)))[0]!.muted).toBe(true);
    expect(calls.find((c) => c.method === "answerCallbackQuery")!.body.text).toContain("Muted");
    // Another chat can't mute it back.
    await handleUpdate(
      { update_id: 3, callback_query: { id: "q2", from: { id: 999, is_bot: false }, data: `unmute:${item!.id}` } },
      db,
      send,
    );
    expect((await db.select().from(watchItems).where(eq(watchItems.id, item!.id)))[0]!.muted).toBe(true);
    await handleUpdate(startUpdate("/stop"), db, send);
    expect((await tg.alertSettings(userId))!.telegram.connected).toBe(false);
    await db.delete(watchItems).where(eq(watchItems.id, item!.id));
  });

  it("a chat that keeps guessing codes is stopped after 10 tries", async () => {
    for (let i = 0; i < 10; i++) await handleUpdate(startUpdate(`/start WRONG${i}XX`, 9_001), db, send);
    expect(replies.every((r) => r.includes("isn't valid"))).toBe(true);
    const { code } = await tg.createLinkCode(userId);
    await handleUpdate(startUpdate(`/start ${code}`, 9_001), db, send);
    expect(replies.at(-1)).toContain("Too many tries");
  });

  it("anything else gets the help text, which never asks for a wallet or a signature", async () => {
    await handleUpdate(startUpdate("hello"), db, send);
    expect(replies[0]).toContain("never asks you to connect a wallet");
  });
});

describe("delivering alerts", () => {
  const draft = (key: string, title = "Main wallet sent 250 USDT") => ({
    userId,
    itemId: null,
    kind: "sent" as const,
    severity: "danger" as const,
    chain: "bsc",
    title,
    details: { summary: "s", lines: ["l"], path: "/tools/watchlist", muteItemId: null },
    dedupeKey: key,
  });
  const link = async () => {
    const { code } = await tg.createLinkCode(userId);
    await tg.linkTelegramChat(code, "555", "usman_k", new Date(), db);
  };

  it("each event is saved once; sent to Telegram outside quiet hours", async () => {
    await link();
    await tg.updateQuietHours(userId, { on: false, start: 1380, end: 420, timeZone: "UTC" });
    expect(await enqueueAlerts([draft("k1"), draft("k1")], db)).toBe(1);
    const result = await deliverQueued(new Date(), db, undefined, 0);
    expect(result.sent).toBe(1);
    const message = calls.find((c) => c.method === "sendMessage")!;
    expect(message.body.chat_id).toBe("555");
    expect(message.body.parse_mode).toBe("HTML");
    expect((await listAlerts(userId, undefined, 20, db))[0]).toMatchObject({
      title: "Main wallet sent 250 USDT",
      status: "sent",
    });
  });

  it("during quiet hours alerts wait; afterwards more than 5 go out as one summary", async () => {
    await tg.updateQuietHours(userId, { on: true, start: 23 * 60, end: 7 * 60, timeZone: "UTC" });
    await enqueueAlerts(
      Array.from({ length: 7 }, (_, i) => draft(`q${i}`, `Alert ${i}`)),
      db,
    );
    expect(await deliverQueued(new Date("2026-11-21T02:00:00Z"), db, undefined, 0)).toEqual({ sent: 0, held: 7 });
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
    expect((await deliverQueued(new Date("2026-11-21T08:00:00Z"), db, undefined, 0)).sent).toBe(7);
    const messages = calls.filter((c) => c.method === "sendMessage");
    expect(messages).toHaveLength(1);
    expect(String(messages[0]!.body.text)).toContain("7 alerts while you were away");
  });

  it("a blocked bot disconnects Telegram; alerts stay in the history", async () => {
    await tg.updateQuietHours(userId, { on: false, start: 0, end: 0, timeZone: "UTC" });
    blockSends = true;
    await enqueueAlerts([draft("b1")], db);
    await deliverQueued(new Date(), db, undefined, 0);
    expect((await tg.alertSettings(userId))!.telegram.connected).toBe(false);
    const [row] = await db.select().from(alerts).where(eq(alerts.dedupeKey, "b1"));
    expect(row!.status).toBe("no-channel");
  });
});
