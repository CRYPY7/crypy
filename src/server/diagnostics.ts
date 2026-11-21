import "server-only";

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
