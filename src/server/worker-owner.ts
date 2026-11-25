import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stabilization S4 (B-023): updates without a gap. On the server, update.sh starts the new version beside the old
 * one on the other port (crypy@3000 / crypy@3001), moves nginx to it once it answers, and only then stops the old
 * one. For those seconds two processes run; the background worker (alerts checker and delivery, Telegram bot,
 * health checks, daily token checks, housekeeping) must run in only one of them, or alerts could go out twice and
 * two processes would read the bot's messages.
 *
 * So, on the server, each process knows its port (CRYPY_INSTANCE_PORT, set by the systemd unit) and runs the worker
 * only while `.crypy-worker` in the app folder names that port; update.sh rewrites the file at the switch. The file is
 * read at most every 5 s. Without CRYPY_INSTANCE_PORT (the owner's PC, tests, the old single service) or without the
 * file, the process is the owner, as before.
 */
const READ_EVERY_MS = 5_000;
let cached: { at: number; owner: boolean } | null = null;

export function isWorkerOwner(now = Date.now()): boolean {
  const port = process.env.CRYPY_INSTANCE_PORT?.trim();
  if (!port) return true;
  if (cached && now - cached.at < READ_EVERY_MS) return cached.owner;
  let owner = true;
  try {
    const named = readFileSync(join(process.cwd(), ".crypy-worker"), "utf8").trim();
    owner = named === "" || named === port;
  } catch {
    owner = true;
  }
  if (cached && cached.owner !== owner)
    console.log(`[crypy] background worker ${owner ? "taken over by" : "handed over from"} this process (${port})`);
  cached = { at: now, owner };
  return owner;
}

/** For tests. */
export function resetWorkerOwner() {
  cached = null;
}
