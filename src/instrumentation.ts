/** Next.js server start hook. Only warms caches; never blocks or fails the start. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { warmTokenSecurity } = await import("@/server/chains/evm/security/warm");
    warmTokenSecurity();
  } catch {
    // Ignored.
  }
}
