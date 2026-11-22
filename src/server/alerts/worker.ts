import "server-only";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { pruneLinkCodes } from "@/server/services/telegram";
import { startTelegramBot } from "@/server/telegram/bot";
import { checkRound } from "./checker";
import { deliverQueued } from "./deliver";
import { pruneAlerts } from "./store";

/**
 * Runs the alerts inside the always-on server process (approved: a background checker about every minute):
 *  - the checker every 60 s (a round never overlaps the next);
 *  - delivery of waiting alerts every 10 s (quiet hours, Telegram's pace);
 *  - housekeeping hourly (old alerts, expired link codes);
 *  - the Telegram bot.
 * One server process per database and bot token (see .env.example). CRYPY_WORKER=off turns all of it off.
 */
const CHECK_MS = 60_000;
const DELIVER_MS = 10_000;
const HOUSEKEEPING_MS = 60 * 60_000;

const startedKey = Symbol.for("crypy.alertsWorker");
const store = globalThis as typeof globalThis & { [startedKey]?: boolean };

/** Worker parts running right now (read by the opt-in memory log). */
const busyStore = globalThis as typeof globalThis & { __crypyWorkerBusy?: Set<string> };
const busy = (busyStore.__crypyWorkerBusy ??= new Set<string>());

function every(ms: number, task: () => Promise<unknown>, label: string, firstDelay = ms) {
  let running = false;
  let lastError = "";
  const tick = async () => {
    if (running) return;
    running = true;
    busy.add(label);
    try {
      await task();
      lastError = "";
    } catch (error) {
      const message = (error as Error)?.message ?? "failed";
      // The same error again isn't repeated in the log every minute.
      if (message !== lastError) console.warn(`[crypy] alerts ${label}: ${message}`);
      lastError = message;
    } finally {
      busy.delete(label);
      running = false;
    }
  };
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), ms).unref();
  }, firstDelay).unref();
}

/**
 * With the built-in database (PGlite, no DATABASE_URL), opens it while the server is still starting. On the owner's
 * Windows PC, opening PGlite (WebAssembly) for the first time while many heavy pages were loading crashed Node
 * (0xC0000409); opened before the first request, it is ready and idle when the load starts. Waits at most 20 s and
 * never throws (a failed open is retried on first use).
 */
export async function openDatabaseBeforeTraffic(): Promise<void> {
  if (serverEnv.CRYPY_WORKER === "off" || serverEnv.DATABASE_URL) return;
  const started = Date.now();
  await Promise.race([
    getDb().then(
      () => console.log(`[crypy] database ready in ${Date.now() - started} ms`),
      () => undefined,
    ),
    new Promise((resolve) => setTimeout(resolve, 20_000)),
  ]);
}

export function startAlertsWorker(): void {
  if (serverEnv.CRYPY_WORKER === "off" || store[startedKey]) return;
  store[startedKey] = true;
  // Diagnosis only: CRYPY_WORKER_SKIP=checker,delivery,bot leaves those parts off.
  const skip = new Set((process.env.CRYPY_WORKER_SKIP ?? "").split(",").map((p) => p.trim()));
  if (!skip.has("checker"))
    every(
      CHECK_MS,
      async () => {
        const { alerts, errors } = await checkRound();
        if (alerts) console.log(`[crypy] alerts checker: ${alerts} new alert(s)`);
        if (errors.length) throw new Error(errors.join("; "));
      },
      "checker",
      15_000,
    );
  if (!skip.has("delivery")) every(DELIVER_MS, () => deliverQueued(), "delivery");
  every(
    HOUSEKEEPING_MS,
    async () => {
      await pruneAlerts();
      await pruneLinkCodes();
    },
    "housekeeping",
  );
  if (!skip.has("bot")) startTelegramBot();
}
