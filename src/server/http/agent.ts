import "server-only";

/**
 * Outbound requests use HTTP/1.1, as before Node.js 26.
 *
 * Node.js 26's built-in fetch (undici 8) uses HTTP/2 whenever a server offers it (Alchemy, dRPC, Ankr and others do).
 * Found on the owner's Windows PC: under load, with many HTTP/2 sessions open, the server's main thread got stuck
 * outside JavaScript for a minute while its memory grew by GBs, then Node aborted (0xC0000409). HTTP/1.1 is what
 * every earlier Node.js version used here, and what the per-process request cap (http/limit.ts) was tuned with.
 *
 * Node keeps its fetch dispatcher on globalThis under a well-known symbol ("undici.globalDispatcher.<n>", documented
 * by undici for replacing it). It is created on the first fetch, so a fetch that needs no network creates it; each one
 * found is replaced by the same class with HTTP/2 off. CRYPY_HTTP2=on keeps Node's default (diagnosis only).
 */
type DispatcherClass = new (options: { allowH2: boolean }) => object;

const slot = (key: symbol) => Number(/(\d+)$/.exec(key.description ?? "")?.[1] ?? 0);

const dispatcherKeys = () =>
  Object.getOwnPropertySymbols(globalThis).filter(
    (s) =>
      /^undici\.globalDispatcher\.\d+$/.test(s.description ?? "") &&
      (globalThis as unknown as Record<symbol, unknown>)[s] != null,
  );

export async function preferHttp1(): Promise<string> {
  if (process.env.CRYPY_HTTP2 === "on") return "default kept";
  const store = globalThis as unknown as Record<symbol, { constructor?: unknown } | undefined>;
  try {
    if (dispatcherKeys().length === 0)
      await fetch("data:text/plain,")
        .then((r) => r.text())
        .catch(() => undefined);
    // Some fetch wrappers answer data: URLs themselves; a refused local connection reaches Node's dispatcher.
    if (dispatcherKeys().length === 0) await fetch("http://127.0.0.1:9/").catch(() => undefined);
    const replaced: string[] = [];
    // Newest slot first: in undici 8 the older slot (".1") holds a compatibility wrapper around the newer dispatcher.
    const keys = dispatcherKeys().sort((a, b) => slot(b) - slot(a));
    let agent: object | null = null;
    for (const key of keys) {
      const Ctor = store[key]?.constructor;
      if (typeof Ctor !== "function" || Ctor === Object) continue;
      let next: object | null = null;
      try {
        next = new (Ctor as DispatcherClass)({ allowH2: false });
      } catch {
        // A wrapper takes the dispatcher it wraps.
        if (agent) next = new (Ctor as unknown as new (inner: object) => object)(agent);
      }
      if (!next) continue;
      agent ??= next;
      store[key] = next as { constructor?: unknown };
      replaced.push(key.description ?? "");
    }
    if (replaced.length) return `http/1.1 (${replaced.join(", ")})`;
    const seen = Object.getOwnPropertySymbols(globalThis)
      .map((s) => s.description ?? "")
      .filter((d) => /undici|dispatcher/i.test(d));
    return `unavailable (symbols: ${seen.join(", ") || "none"})`;
  } catch (error) {
    return `unavailable (${(error as Error)?.message ?? "failed"})`;
  }
}
