import "server-only";

/**
 * One cap on how many outbound requests (blockchain nodes, Alchemy, GoPlus, Sourcify) this server has in flight at
 * once. Extra requests wait their turn. Found on the owner's Windows PC: with the Portfolio's checks running beside many
 * page loads, Node itself aborted (exit code 0xC0000409, no JavaScript error, normal memory). Each part alone never
 * crashed; together they did. Keeping the number of open requests bounded also spares the free providers.
 */
export const MAX_IN_FLIGHT = (() => {
  // Diagnosis only (scripts/full-check-cap16.cmd): a different cap without a code change. Bounded 4–64.
  const n = Number(process.env.CRYPY_MAX_IN_FLIGHT);
  return Number.isInteger(n) && n >= 4 && n <= 64 ? n : 32;
})();

interface Gate {
  active: number;
  peak: number;
  queued: number;
  waiting: (() => void)[];
}

const state = globalThis as typeof globalThis & { __crypyFetchGate?: Gate };
const gate = () => (state.__crypyFetchGate ??= { active: 0, peak: 0, queued: 0, waiting: [] });

async function acquire(): Promise<void> {
  const g = gate();
  if (g.active < MAX_IN_FLIGHT) {
    g.active += 1;
  } else {
    g.queued += 1;
    // The releasing request hands its slot straight to the next waiter, so `active` stays unchanged.
    await new Promise<void>((resolve) => g.waiting.push(resolve));
  }
  g.peak = Math.max(g.peak, g.active);
}

function release(): void {
  const g = gate();
  const next = g.waiting.shift();
  if (next) next();
  else g.active -= 1;
}

/**
 * `fetch` with the shared cap. The slot is held until the response headers arrive (or the request fails): the
 * waiting-for-an-answer part is what piles up under load, and releasing here can never leak a slot.
 */
export async function limitedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  await acquire();
  const host = hostOf(input);
  hosts.set(host, (hosts.get(host) ?? 0) + 1);
  try {
    return capBody(await fetch(input, init), host, init?.body);
  } finally {
    const left = (hosts.get(host) ?? 1) - 1;
    if (left > 0) hosts.set(host, left);
    else hosts.delete(host);
    release();
  }
}

/**
 * Largest answer read from any provider. Real answers are far smaller (a full token list is a few MB); found on the
 * owner's PC: the server's main thread stuck for a minute while its memory grew by GBs, then Node aborted. A body
 * parsed as JSON in one piece can't be interrupted, so an oversized answer is cut off here as a failed request
 * (callers already treat failures as "this source didn't answer") and logged with its host and method.
 */
export const MAX_RESPONSE_BYTES = 32 * 1_048_576;

const logged = new Set<string>();

function capBody(response: Response, host: string, requestBody: unknown): Response {
  if (!response.body) return response;
  const length = Number(response.headers.get("content-length"));
  const method =
    typeof requestBody === "string"
      ? (/"method"\s*:\s*"([^"]{1,60})"/.exec(requestBody.slice(0, 2_000))?.[1] ?? "")
      : "";
  const tooLarge = (bytes: number) => {
    const key = `${host} ${method}`;
    if (!logged.has(key)) {
      logged.add(key);
      console.warn(
        `[crypy] answer too large from ${host}${method ? ` (${method})` : ""}: over ${Math.round(bytes / 1_048_576)} MB, not read`,
      );
    }
    return new Error(`answer from ${host} is larger than ${MAX_RESPONSE_BYTES / 1_048_576} MB`);
  };
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    void response.body.cancel().catch(() => undefined);
    throw tooLarge(length);
  }
  let seen = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_RESPONSE_BYTES) controller.error(tooLarge(seen));
        else controller.enqueue(chunk);
      },
      flush() {
        // Opt-in log of large (but allowed) answers, to see which sources send the most.
        if (seen > 8 * 1_048_576 && process.env.CRYPY_DEBUG_MEMORY === "1")
          console.warn(
            `[crypy] large answer from ${host}${method ? ` (${method})` : ""}: ${Math.round(seen / 1_048_576)} MB`,
          );
      },
    }),
  );
  return new Response(counted, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Requests waiting for an answer, by host name only (no paths: they can hold API keys). For the opt-in memory log. */
const hostStore = globalThis as typeof globalThis & { __crypyFetchHosts?: Map<string, number> };
const hosts = (hostStore.__crypyFetchHosts ??= new Map<string, number>());

function hostOf(input: string | URL | Request): string {
  try {
    return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).hostname;
  } catch {
    return "?";
  }
}

export function inFlightHosts(): string {
  return [...hosts].map(([h, n]) => `${h} ${n}`).join(", ") || "none";
}

/** For the opt-in memory log and tests: requests in flight now, the most at once since the last read, and how many waited. */
export function takeFetchStats(): { active: number; peak: number; queued: number } {
  const g = gate();
  const stats = { active: g.active, peak: g.peak, queued: g.queued };
  g.peak = g.active;
  g.queued = 0;
  return stats;
}

/** For tests. */
export function resetFetchGate(): void {
  state.__crypyFetchGate = { active: 0, peak: 0, queued: 0, waiting: [] };
}
