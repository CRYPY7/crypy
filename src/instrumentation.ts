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
    warmTokenSecurity();
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
