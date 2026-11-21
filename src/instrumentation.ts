/** Next.js server start hook. Warms caches and watches for escaped network errors; never blocks or fails the start. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { watchNetworkErrors } = await import("@/server/diagnostics");
    watchNetworkErrors();
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
