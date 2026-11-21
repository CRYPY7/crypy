/**
 * Next.js server start hook. Warms caches, watches for escaped network errors and (opt-in) logs memory; never blocks or
 * fails the start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
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
}
