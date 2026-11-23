import "server-only";

/**
 * Heartbeats of the background jobs (alerts checker, delivery, daily token checks), kept in memory by the worker.
 * The health round reads them, so checking that a job runs costs nothing.
 */
export interface JobHeartbeat {
  everyMs: number;
  startedAt: number;
  lastRunAt: number | null;
  lastOkAt: number | null;
  /** Keys already removed. */
  lastError: string | null;
}

const key = Symbol.for("crypy.jobHeartbeats");
const store = globalThis as typeof globalThis & { [key]?: Map<string, JobHeartbeat> };
const beats = (store[key] ??= new Map());

export function registerJob(label: string, everyMs: number, now = Date.now()): void {
  beats.set(label, { everyMs, startedAt: now, lastRunAt: null, lastOkAt: null, lastError: null });
}

export function noteJobRun(label: string, error: string | null, now = Date.now()): void {
  const beat = beats.get(label);
  if (!beat) return;
  beat.lastRunAt = now;
  if (error === null) {
    beat.lastOkAt = now;
    beat.lastError = null;
  } else {
    beat.lastError = error;
  }
}

export function jobHeartbeat(label: string): JobHeartbeat | undefined {
  return beats.get(label);
}

/** Test helper. */
export function resetJobHeartbeats(): void {
  beats.clear();
}
