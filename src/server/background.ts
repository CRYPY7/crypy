import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks work that no visitor is waiting for (the alerts worker, health checks, daily token checks, the lock index
 * built at start), so shared free-plan budgets can keep a share for visitors. Everything started inside
 * `runInBackground` (including awaited calls and timers) counts as background.
 *
 * The store lives on globalThis: Next.js can load this module more than once (pages, API routes, instrumentation).
 */
const key = Symbol.for("crypy.backgroundWork");
const holder = globalThis as unknown as Record<symbol, AsyncLocalStorage<true> | undefined>;
const store: AsyncLocalStorage<true> = (holder[key] ??= new AsyncLocalStorage<true>());

export function runInBackground<T>(task: () => T): T {
  return store.run(true, task);
}

export function isBackground(): boolean {
  return store.getStore() === true;
}

/**
 * Runs a task with visitors' budgets even inside background work. Used by the health checks of tools, which exist to
 * see what a visitor would get (they are few: at most 2 per 5-minute round).
 */
export function runAsVisitor<T>(task: () => T): T {
  return store.exit(task);
}
