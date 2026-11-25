import { afterEach, describe, expect, it } from "vitest";
import {
  COOL_DOWN_MS,
  isConnectionFailure,
  isCoolingDown,
  rankProviders,
  resetCoolDown,
  restAfterFailure,
  wakeOneIfAllResting,
} from "@/server/chains/evm/providers";

const a = { name: "a", kind: "public" as const, url: "https://a.test" };
const b = { name: "b", kind: "public" as const, url: "https://b.test" };
const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error("x"), { name, ...extra });
const timeout = named("TimeoutError");

describe("per-method provider rest (S3)", () => {
  afterEach(resetCoolDown);

  it("a timeout on one method rests only that method", () => {
    restAfterFailure(a, "eth_getLogs", timeout);
    expect(isCoolingDown(a, Date.now(), "eth_getLogs")).toBe(true);
    expect(isCoolingDown(a, Date.now(), "eth_blockNumber")).toBe(false);
    expect(isCoolingDown(a)).toBe(false);
    expect(isCoolingDown(a, Date.now() + COOL_DOWN_MS + 1, "eth_getLogs")).toBe(false);
  });

  it("a second method failing in the same minute rests the whole provider", () => {
    restAfterFailure(a, "eth_getLogs", timeout);
    restAfterFailure(a, "eth_call", named("HttpRequestError", { status: 502 }));
    expect(isCoolingDown(a)).toBe(true);
    expect(isCoolingDown(a, Date.now(), "eth_blockNumber")).toBe(true);
    // The same method failing again is still just that method.
    restAfterFailure(b, "eth_getLogs", timeout);
    restAfterFailure(b, "eth_getLogs", timeout);
    expect(isCoolingDown(b, Date.now(), "eth_chainId")).toBe(false);
  });

  it("connection failures and 'too many requests' rest the whole provider at once", () => {
    expect(isConnectionFailure(named("HttpRequestError"))).toBe(true);
    expect(isConnectionFailure(named("HttpRequestError", { status: 429 }))).toBe(true);
    expect(isConnectionFailure(named("HttpRequestError", { status: 503 }))).toBe(false);
    expect(isConnectionFailure(timeout)).toBe(false);
    restAfterFailure(a, "eth_getLogs", named("HttpRequestError", { status: 429 }));
    expect(isCoolingDown(a, Date.now(), "eth_blockNumber")).toBe(true);
  });

  it("ranking and waking look at the method being asked", () => {
    restAfterFailure(a, "eth_getLogs", timeout);
    // a is faster by default order but rests for logs: b first for logs, a still first-class for other methods.
    expect(rankProviders([a, b], Date.now(), "eth_getLogs").map((p) => p.name)).toEqual(["b", "a"]);
    expect(rankProviders([a, b], Date.now(), "eth_blockNumber")[0]?.name).not.toBeUndefined();
    expect(isCoolingDown(a, Date.now(), "eth_blockNumber")).toBe(false);
    // Everyone resting for this method: the one whose rest ends soonest is woken for it.
    restAfterFailure(b, "eth_getLogs", timeout);
    wakeOneIfAllResting([a, b], Date.now(), "eth_getLogs");
    expect([a, b].filter((p) => !isCoolingDown(p, Date.now(), "eth_getLogs"))).toHaveLength(1);
  });
});
