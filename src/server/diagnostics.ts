import "server-only";
import { freemem } from "node:os";
import { Server } from "node:http";
import { Worker } from "node:worker_threads";
import { inFlightHosts, takeFetchStats } from "@/server/http/limit";

/** Removes provider keys from text before it is logged (Alchemy keys sit in URL paths: /v2/<key>). */
export function redactKeys(text: string): string {
  return text
    .replace(/\/v2\/[A-Za-z0-9_-]{8,}/g, "/v2/[key]")
    .replace(/([?&](?:key|apikey|api_key|token)=)[^&\s]+/gi, "$1[key]");
}

/**
 * Network errors that escape every handler (seen on the owner's PC: undici "socket idle timeout", only with an Alchemy
 * key set, not reproducible without one). Next.js prints them with library frames hidden, so the source can't be
 * found from its log. This monitor only observes (it never changes how the error is handled) and prints the full
 * stack and cause once per kind, with keys removed, so the next run shows where it comes from.
 */
export function watchNetworkErrors(): void {
  const seen = new Set<string>();
  process.on("uncaughtExceptionMonitor", (error: Error & { code?: string; cause?: unknown }) => {
    if (typeof error?.code !== "string" || !error.code.startsWith("UND_ERR")) return;
    const key = `${error.code}:${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    const cause = error.cause instanceof Error ? `\nCaused by: ${error.cause.stack ?? error.cause.message}` : "";
    console.error(
      redactKeys(`[crypy] network error escaped its handler (${error.code}):\n${error.stack ?? error.message}${cause}`),
    );
  });
}

/**
 * Opt-in memory log (set CRYPY_DEBUG_MEMORY=1): every 30 s, the server's memory in MB. Used to find whether the
 * server grows until it crashes under load. Prints numbers only.
 */
export function watchMemory(): void {
  if (process.env.CRYPY_DEBUG_MEMORY !== "1") return;
  const mb = (n: number) => Math.round(n / 1_048_576);
  let lastRss = 0;
  let lastLog = 0;
  // Checked every 2 s; logged every 30 s, or at once when the process grew by 300 MB or more since the last line.
  const timer = setInterval(() => {
    const m = process.memoryUsage();
    const now = Date.now();
    const jump = m.rss - lastRss >= 300 * 1_048_576;
    if (!jump && now - lastLog < 30_000) return;
    lastRss = m.rss;
    lastLog = now;
    const f = takeFetchStats();
    const busy = [...((globalThis as { __crypyWorkerBusy?: Set<string> }).__crypyWorkerBusy ?? [])];
    console.warn(
      `[crypy] memory${jump ? " JUMP" : ""}: rss ${mb(m.rss)} MB, heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB, ` +
        `external ${mb(m.external)} MB, buffers ${mb(m.arrayBuffers)} MB; ` +
        `requests in flight ${f.active}, most ${f.peak}, waited ${f.queued}; alerts busy: ${busy.join(", ") || "none"}`,
    );
  }, 2_000);
  timer.unref();
  watchSystemMemory();
  watchMainThread();
}

/**
 * Diagnosis for the owner's Windows PC: while the server's memory grew by GBs, no timer of the server ran, so its own
 * JavaScript was likely busy without a pause. A small watchdog thread (separate from the server's main thread) checks
 * a heartbeat every second; when the main thread hasn't answered for 3 s, it briefly pauses it through Node's built-in
 * inspector and writes which functions were running (names, files and lines only) to the log and to .crash-reports.
 */
function watchMainThread(): void {
  const beat = new Float64Array(new SharedArrayBuffer(8));
  // What the server was doing: pages and API calls in progress, and the last ones finished (paths only, kept
  // current every 250 ms). The watchdog prints it when the main thread stops answering.
  const note = new Uint8Array(new SharedArrayBuffer(16_384));
  const active = new Map<object, { path: string; start: number }>();
  const done: string[] = [];
  const emit = Server.prototype.emit;
  Server.prototype.emit = function (this: Server, event: string, ...args: unknown[]) {
    if (event === "request") {
      const [req, res] = args as [{ url?: string; method?: string }, { once(e: string, f: () => void): void }];
      const entry = { path: `${req.method ?? ""} ${(req.url ?? "").slice(0, 140)}`, start: Date.now() };
      active.set(req, entry);
      const finish = () => {
        if (!active.delete(req)) return;
        done.push(`${entry.path} ${Date.now() - entry.start} ms`);
        if (done.length > 15) done.shift();
      };
      res.once("finish", finish);
      res.once("close", finish);
    }
    return (emit as (...a: unknown[]) => boolean).call(this, event, ...args);
  } as typeof Server.prototype.emit;
  const encoder = new TextEncoder();
  const tick = setInterval(() => {
    const now = Date.now();
    beat[0] = now;
    const text = [
      `in progress (${active.size}):`,
      ...[...active.values()].slice(0, 40).map((a) => `  ${a.path} (${Math.round((now - a.start) / 1000)} s)`),
      "last finished:",
      ...done.map((d) => `  ${d}`),
    ].join("\n");
    const bytes = encoder.encode(text).slice(0, note.length - 1);
    note.fill(0);
    note.set(bytes);
  }, 250);
  tick.unref();
  beat[0] = Date.now();
  const code = `
    const { workerData } = require("node:worker_threads");
    const fs = require("node:fs");
    const path = require("node:path");
    const { Session } = require("node:inspector");
    const beat = new Float64Array(workerData.buffer);
    const note = new Uint8Array(workerData.note);
    const readNote = () => {
      const copy = note.slice();
      const end = copy.indexOf(0);
      return new TextDecoder().decode(end === -1 ? copy : copy.subarray(0, end));
    };
    const mb = (n) => Math.round(n / 1048576);
    const write = (text) => {
      try { fs.writeSync(2, text + "\\n"); } catch {}
      try {
        fs.mkdirSync(".crash-reports", { recursive: true });
        fs.appendFileSync(path.join(".crash-reports", "blocked-main-thread.txt"), text + "\\n");
      } catch {}
    };
    let session = null;
    let urlOf = (f) => f.url || "?";
    let lastReport = 0;
    setInterval(() => {
      const stalled = Date.now() - beat[0];
      if (stalled < 3000 || Date.now() - lastReport < 5000) return;
      lastReport = Date.now();
      const m = process.memoryUsage();
      write("[crypy] MAIN THREAD BUSY for " + Math.round(stalled / 1000) + " s (process rss " + mb(m.rss) + " MB); pausing it to see where");
      if (!session) write("[crypy] what the server was doing when it stopped answering:\\n" + readNote());
      try {
        if (!session) {
          session = new Session();
          session.connectToMainThread();
          const urls = new Map();
          session.on("Debugger.scriptParsed", (message) => urls.set(message.params.scriptId, message.params.url));
          urlOf = (f) => f.url || urls.get(f.location.scriptId) || "?";
          session.on("Debugger.paused", (message) => {
            const frames = message.params.callFrames.slice(0, 30).map((f) =>
              "  at " + (f.functionName || "(anonymous)") + " " + urlOf(f) + ":" + (f.location.lineNumber + 1) + ":" + (f.location.columnNumber + 1));
            write("[crypy] main thread was running:\\n" + frames.join("\\n"));
            session.post("Debugger.resume", () => {});
          });
          session.post("Debugger.enable", () => session.post("Debugger.pause", () => {}));
        } else {
          session.post("Debugger.pause", () => {});
        }
      } catch (error) {
        write("[crypy] couldn't pause the main thread: " + (error && error.message));
      }
    }, 1000);
  `;
  try {
    const worker = new Worker(code, { eval: true, workerData: { buffer: beat.buffer, note: note.buffer } });
    worker.unref();
    worker.on("error", (error) => console.warn(`[crypy] main-thread watchdog stopped: ${error.message}`));
  } catch (error) {
    console.warn(`[crypy] main-thread watchdog didn't start: ${(error as Error).message}`);
  }
}

/**
 * Diagnosis for the owner's Windows PC: the server's committed memory there grew by several GB in seconds (outside the
 * JavaScript heap) and Node then aborted. Checked every second; when the computer's free memory falls by 700 MB or
 * more within 2 s, logs what this server is doing and (once) writes a Node diagnostic report.
 */
function watchSystemMemory(): void {
  const history: number[] = [];
  let reported = false;
  const mb = (n: number) => Math.round(n / 1_048_576);
  const timer = setInterval(() => {
    const free = freemem();
    history.push(free);
    if (history.length > 3) history.shift();
    const drop = (history[0] ?? free) - free;
    if (drop < 700 * 1_048_576) return;
    history.length = 0;
    const m = process.memoryUsage();
    const counts = new Map<string, number>();
    for (const r of process.getActiveResourcesInfo()) counts.set(r, (counts.get(r) ?? 0) + 1);
    const busy = [...((globalThis as { __crypyWorkerBusy?: Set<string> }).__crypyWorkerBusy ?? [])];
    console.warn(
      `[crypy] SYSTEM MEMORY DROP ${mb(drop)} MB in 2 s (free ${mb(free)} MB): server rss ${mb(m.rss)} MB, ` +
        `heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB, external ${mb(m.external)} MB, buffers ${mb(m.arrayBuffers)} MB; ` +
        `waiting on: ${inFlightHosts()}; resources: ${[...counts].map(([k, n]) => `${k} ${n}`).join(", ")}; ` +
        `alerts busy: ${busy.join(", ") || "none"}`,
    );
    if (!reported && process.report) {
      reported = true;
      try {
        console.warn(`[crypy] diagnostic report written: ${process.report.writeReport()}`);
      } catch {
        // Ignored.
      }
    }
  }, 1_000);
  timer.unref();
}

/** Opt-in timing log (set CRYPY_DEBUG_TIMING=1): where slow pages spend their time. Durations and counts only. */
export function logTiming(message: string): void {
  if (process.env.CRYPY_DEBUG_TIMING === "1") console.warn(`[crypy] timing ${message}`);
}
