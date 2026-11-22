import { describe, expect, it } from "vitest";
import { fail, ok } from "@/server/http/response";
import { clientKey, createRateLimiter, normalizeIp } from "@/server/rate-limit";

describe("API envelope", () => {
  it("wraps data with sources and time, and is never cached", async () => {
    const response = ok({ a: 1 }, { sources: ["rpc"] });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { a: 1 }, meta: { sources: ["rpc"] } });
    expect(Date.parse(body.meta.fetchedAt)).not.toBeNaN();
  });

  it("returns error codes, not text, with the right status and retry hint", async () => {
    const cases = [
      ["INVALID_INPUT", 400, false],
      ["RATE_LIMITED", 429, true],
      ["NOT_FOUND", 404, false],
      ["UPSTREAM_UNAVAILABLE", 503, true],
      ["INTERNAL", 500, false],
    ] as const;
    for (const [code, status, retryable] of cases) {
      const response = fail(code);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, error: { code, retryable } });
    }
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then reports when to retry", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 10_000 });
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 1).allowed).toBe(true);
    const blocked = check("a", 2_000);
    expect(blocked).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 8 });
    expect(check("b", 2_000).allowed).toBe(true);
    expect(check("a", 10_001).allowed).toBe(true);
  });

  it("keeps memory bounded", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (let i = 0; i < 100; i++) check(`k${i}`, 0);
    expect(check("k99", 1).allowed).toBe(false);
  });

  it("uses the address our proxy set, never one the visitor can pick", () => {
    // A visitor-supplied first entry is ignored; the proxy appends the real address last.
    expect(clientKey(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
    // X-Real-IP (set by nginx / Vercel) wins over X-Forwarded-For.
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.4" }))).toBe("203.0.113.4");
    expect(clientKey(new Headers())).toBe("unknown");
  });

  it("counts IPv6 visitors per /64 network", () => {
    expect(normalizeIp("2001:db8:abcd:12:1:2:3:4")).toBe("2001:db8:abcd:12::/64");
    expect(normalizeIp("2001:db8:abcd:12::99")).toBe("2001:db8:abcd:12::/64");
    expect(normalizeIp("[2001:0DB8:0000:0012::1]")).toBe("2001:db8:0:12::/64");
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(normalizeIp("::ffff:192.0.2.7")).toBe("192.0.2.7");
    expect(normalizeIp("198.51.100.3")).toBe("198.51.100.3");
    expect(clientKey(new Headers({ "x-real-ip": "2001:db8:1:2:aaaa::1" }))).toBe(
      clientKey(new Headers({ "x-real-ip": "2001:db8:1:2:bbbb::9" })),
    );
  });
});
