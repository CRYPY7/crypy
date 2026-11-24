/**
 * Next.js server start hook. Makes outbound requests use HTTP/1.1 (see server/http/agent.ts), warms caches, watches
 * for escaped network errors and (opt-in) logs memory, opens the built-in database before the first request when the
 * alerts worker will use it (at most 20 s), and starts the alerts worker. Never fails the start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { preferHttp1 } = await import("@/server/http/agent");
    const protocol = await preferHttp1();
    if (!protocol.startsWith("http/1.1") || process.env.CRYPY_DEBUG_MEMORY === "1")
      console.warn(`[crypy] outbound HTTP version: ${protocol}`);
  } catch {
    // Ignored.
  }
  try {
    const { watchMemory, watchNetworkErrors } = await import("@/server/diagnostics");
    watchNetworkErrors();
    watchMemory();
  } catch {
    // Ignored.
  }
  try {
    const { warmTokenSecurity } = await import("@/server/chains/evm/security/warm");
    const { runInBackground } = await import("@/server/background");
    // The lock index is background work: it may not use the share of free plans kept for visitors.
    runInBackground(() => warmTokenSecurity());
  } catch {
    // Ignored.
  }
  try {
    const { startAlertsWorker, openDatabaseBeforeTraffic } = await import("@/server/alerts/worker");
    await openDatabaseBeforeTraffic();
    startAlertsWorker();
  } catch (error) {
    const { redactKeys } = await import("@/server/redact");
    console.warn(`[crypy] alerts didn't start: ${redactKeys((error as Error).message)}`);
  }
}

/**
 * Every error that reaches Next.js while serving a visitor (stabilization S0): counted under "Server errors" with
 * the tool its page belongs to and a cleaned message (no addresses, hashes, URLs or keys). Never throws.
 */
export async function onRequestError(
  error: unknown,
  _request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { cleanReason, errorOutcome, toolForRoute } = await import("@/lib/outcomes/classify");
    const { recordOutcome } = await import("@/server/outcomes/record");
    const tool = toolForRoute(context.routePath);
    const { reasons } = errorOutcome(error);
    recordOutcome(
      "pages",
      { outcome: "error", reasons: [cleanReason(`${tool ?? context.routeType}: ${reasons[0] ?? ""}`)] },
      0,
    );
  } catch {
    // Ignored: counting must never add a second error.
  }
}
