import "server-only";

/**
 * Stabilization S3: a health score per node provider, from the requests CRYPY really sent in the last hour (5-minute
 * buckets, in memory per process). Shown on /admin so the owner sees which provider fails, on which kind of request,
 * and whether it is resting now. Names only (host names), never URLs or keys.
 *
 * Outcomes: "ok" (an answer, including a node's own error such as a revert: the node worked), "failed" (timeout,
 * connection or HTTP failure, malformed answer), "limited" ("too many requests"), "refused" (the node declined that
 * kind of request, such as old data without an archive plan). Requests not sent (budget used, resting) aren't counted.
 */
export type ProviderOutcome = "ok" | "failed" | "limited" | "refused";

interface Bucket {
  start: number;
  counts: Record<ProviderOutcome, number>;
  okMs: number;
  failedByMethod: Map<string, number>;
}

const BUCKET_MS = 5 * 60_000;
const KEEP = 12;
const key = Symbol.for("crypy.providerHealth");
const store: Map<string, Bucket[]> = ((globalThis as Record<symbol, Map<string, Bucket[]>>)[key] ??= new Map());

export function recordOutcome(url: string, method: string, outcome: ProviderOutcome, ms: number, now = Date.now()) {
  const start = now - (now % BUCKET_MS);
  const list = store.get(url) ?? [];
  let bucket = list[list.length - 1];
  if (!bucket || bucket.start !== start) {
    bucket = {
      start,
      counts: { ok: 0, failed: 0, limited: 0, refused: 0 },
      okMs: 0,
      failedByMethod: new Map(),
    };
    list.push(bucket);
    while (list.length > KEEP) list.shift();
    store.set(url, list);
  }
  bucket.counts[outcome] += 1;
  if (outcome === "ok") bucket.okMs += ms;
  if (outcome !== "ok") bucket.failedByMethod.set(method, (bucket.failedByMethod.get(method) ?? 0) + 1);
}

export interface ProviderHealth {
  requests: number;
  counts: Record<ProviderOutcome, number>;
  /** Share of requests answered (ok); null without requests. */
  score: number | null;
  state: "good" | "uneven" | "poor" | "idle";
  averageMs: number | null;
  /** Kinds of request that went wrong most, largest first (at most 3). */
  worstMethods: { method: string; count: number }[];
}

/** The last hour for one provider. */
export function providerHealth(url: string, now = Date.now()): ProviderHealth {
  const recent = (store.get(url) ?? []).filter((b) => now - b.start < KEEP * BUCKET_MS);
  const counts: Record<ProviderOutcome, number> = { ok: 0, failed: 0, limited: 0, refused: 0 };
  let okMs = 0;
  const byMethod = new Map<string, number>();
  for (const b of recent) {
    for (const k of Object.keys(counts) as ProviderOutcome[]) counts[k] += b.counts[k];
    okMs += b.okMs;
    for (const [m, c] of b.failedByMethod) byMethod.set(m, (byMethod.get(m) ?? 0) + c);
  }
  const requests = counts.ok + counts.failed + counts.limited + counts.refused;
  // Refusals are a plan limit for one kind of request, not an outage: they don't lower the score.
  const scored = counts.ok + counts.failed + counts.limited;
  const score = scored ? counts.ok / scored : null;
  return {
    requests,
    counts,
    score,
    state: score === null ? "idle" : score >= 0.98 ? "good" : score >= 0.9 ? "uneven" : "poor",
    averageMs: counts.ok ? Math.round(okMs / counts.ok) : null,
    worstMethods: [...byMethod]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  };
}

/** For tests. */
export function resetProviderHealth() {
  store.clear();
}
