/** Shared by the Watchlist panel and its alert parts (client code). */
export type Strings = Record<string, string>;
export const AMOUNTS = [null, 100, 1_000, 10_000, 100_000, 1_000_000] as const;
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
    return body?.ok && body.data !== undefined ? { ok: true, data: body.data } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const primaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
export const secondaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";
