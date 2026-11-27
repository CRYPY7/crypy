import "server-only";
import { isWorkerOwner } from "@/server/worker-owner";
import { getDb } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { redactKeys } from "@/server/redact";
import { noteJobRun, registerJob } from "@/server/health/jobs";
import { pruneHealthChecks, runHealthRound } from "@/server/health/runner";
import { ROUND_MS } from "@/lib/health/checks";
import { pruneLinkCodes } from "@/server/services/telegram";
import { runDueTokenChecks } from "@/server/services/token-checks";
import { startTelegramBot } from "@/server/telegram/bot";
import { checkRound } from "./checker";
import { deliverQueued } from "./deliver";
import { pruneAlerts } from "./store";
import { runInBackground } from "@/server/background";
import { pruneProviderUsage, saveProviderUsage } from "@/server/chains/evm/usage-store";
import { pruneOutcomes } from "@/server/outcomes/store";
import { pruneSaved } from "@/server/saved/store";
import { pruneTokens } from "@/server/tokens/registry";
import { PRICE_JOB_MS, runPriceJob } from "@/server/tokens/price-job";
import { watchVisitorOutcomes } from "@/server/outcomes/watch";

/**
 * Runs the alerts inside the always-on server process (approved: a background checker about every minute):
 *  - the checker every 60 s (a round never overlaps the next);
 *  - delivery of waiting alerts every 10 s (quiet hours, Telegram's pace);
 *  - housekeeping hourly (old alerts, expired link codes, health results older than 90 days);
 *  - health checks every 5 minutes (status page and admin dashboard);
 *  - the Telegram bot.
 * One server process per database and bot token (see .env.example). CRYPY_WORKER=off turns all of it off.
 */
const CHECK_MS = 60_000;
const DELIVER_MS = 10_000;
const USAGE_MS = 60_000;
const HOUSEKEEPING_MS = 60 * 60_000;
const TOKEN_CHECKS_MS = 10 * 60_000;

const startedKey = Symbol.for("crypy.alertsWorker");
const store = globalThis as typeof globalThis & { [startedKey]?: boolean };

/** Worker parts running right now (read by the opt-in memory log). */
const busyStore = globalThis as typeof globalThis & { __crypyWorkerBusy?: Set<string> };
const busy = (busyStore.__crypyWorkerBusy ??= new Set<string>());

function every(ms: number, task: () => Promise<unknown>, label: string, firstDelay = ms, ownerOnly = true) {
  let running = false;
  let lastError = "";
  registerJob(label, ms);
  const tick = async () => {
    // During an update's switch two processes run: only the owner does the background work (worker-owner.ts).
    if (running || (ownerOnly && !isWorkerOwner())) return;
    running = true;
    busy.add(label);
    try {
      // Worker jobs are background work: free-plan budgets keep a share for visitors (server/background.ts).
      await runInBackground(task);
      lastError = "";
      noteJobRun(label, null);
    } catch (error) {
      const message = redactKeys((error as Error)?.message ?? "failed");
      noteJobRun(label, message);
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
      await pruneHealthChecks();
      await pruneProviderUsage();
      await pruneOutcomes();
      await pruneSaved();
      await pruneTokens();
    },
    "housekeeping",
  );
  // Free-plan counters saved every minute, so restarts keep the day's count and Alchemy's limit follows the month.
  // Every process saves its own counts (they are added up), so this runs in both during a switch.
  every(USAGE_MS, () => saveProviderUsage(), "usage", 5_000, false);
  // What visitors got from each tool (stabilization S0): saved every minute; the owner hears when a tool fails for them.
  every(USAGE_MS, () => watchVisitorOutcomes(), "outcomes", 30_000);
  // Daily security checks for the curated token pages (SEO Phase 3): a few every 10 minutes, oldest first.
  if (!skip.has("token-checks"))
    every(
      TOKEN_CHECKS_MS,
      async () => {
        const { checked, failed } = await runDueTokenChecks();
        if (checked) console.log(`[crypy] token checks: ${checked} saved`);
        if (failed.length) throw new Error(`not checked this round: ${failed.join(", ")}`);
      },
      "token-checks",
      60_000,
    );
  // Prices of tokens people looked at in the last week, kept fresh so pages rarely price live (R1 part 2).
  if (!skip.has("prices")) every(PRICE_JOB_MS, () => runPriceJob(), "prices", 45_000);
  // Health checks for the status page and admin dashboard (M9 Part 5): quick checks every round, real tool runs
  // about every 30 minutes, 2 at most per round. Results are saved; the pages only read them.
  if (!skip.has("health"))
    every(
      ROUND_MS,
      async () => {
        const { failed } = await runHealthRound();
        if (failed.length) console.warn(`[crypy] health: not passing: ${failed.join(", ")}`);
      },
      "health",
      90_000,
    );
  if (!skip.has("bot")) startTelegramBot();
}
