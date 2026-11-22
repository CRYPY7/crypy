import { type Server, createServer } from "node:http";

/**
 * A stand-in Telegram Bot API on this machine for browser tests (CRYPY_FAKE_TELEGRAM=1), so tests never touch a real
 * bot. The app server must be started with TELEGRAM_API_URL pointing here (playwright.config.ts and
 * scripts/full-check.ps1 do that). Tests drive it through two extra paths:
 *   POST /__push  {update}  → delivered to the bot's next getUpdates
 *   GET  /__calls           → every call the bot made (method and body)
 */
export const FAKE_TELEGRAM_PORT = 3299;
export const FAKE_TELEGRAM_TOKEN = "123456789:AAfakefakefakefakefakefakefakefake12";
export const fakeTelegramUrl = `http://127.0.0.1:${FAKE_TELEGRAM_PORT}`;

export default async function globalSetup() {
  if (process.env.CRYPY_FAKE_TELEGRAM !== "1") return;
  const queue: Record<string, unknown>[] = [];
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let nextId = 1;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const json = (value: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.url === "/__push") {
        queue.push({ update_id: nextId++, ...body });
        return json({ ok: true });
      }
      if (req.url === "/__calls") return json(calls);
      const method = req.url?.split("/").pop() ?? "";
      if (method === "getMe") return json({ ok: true, result: { id: 1, is_bot: true, username: "crypy_test_bot" } });
      if (method === "getUpdates") {
        const offset = Number(body.offset ?? 0);
        while (queue.length && Number(queue[0]!.update_id) < offset) queue.shift();
        if (queue.length === 0) await new Promise((r) => setTimeout(r, 800));
        return json({ ok: true, result: queue.filter((u) => Number(u.update_id) >= offset) });
      }
      calls.push({ method, body });
      return json({ ok: true, result: true });
    });
  });
  await new Promise<void>((resolve) => server.listen(FAKE_TELEGRAM_PORT, "127.0.0.1", () => resolve()));
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
