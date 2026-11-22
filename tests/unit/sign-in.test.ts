import { describe, expect, it } from "vitest";
import { SIGN_IN_TTL_MS, buildSignInMessage, checkSignInMessage } from "@/lib/auth/sign-in-message";

const now = new Date("2026-11-22T10:00:00Z");
const base = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const,
  chainId: 56,
  nonce: "8f3k2LqZp9Xa1bC2",
  domain: "crypy.org",
  origin: "https://crypy.org",
  now,
};
const expected = { domain: "crypy.org", origin: "https://crypy.org", now };

describe("sign-in message", () => {
  it("says it is a message, not a transaction, and passes the check", () => {
    const text = buildSignInMessage(base);
    expect(text).toMatch(/^crypy\.org wants you to sign in with your Ethereum account:/);
    expect(text).toContain("This is a message, not a transaction");
    const check = checkSignInMessage(text, expected);
    expect(check.ok).toBe(true);
  });

  it("refuses a message made for another site or page", () => {
    expect(checkSignInMessage(buildSignInMessage({ ...base, domain: "crypy-login.xyz" }), expected)).toEqual({
      ok: false,
      reason: "domain",
    });
    expect(checkSignInMessage(buildSignInMessage({ ...base, origin: "https://evil.example" }), expected)).toEqual({
      ok: false,
      reason: "origin",
    });
  });

  it("refuses changed wording, extra lines, unknown chains and old or future messages", () => {
    const text = buildSignInMessage(base);
    expect(checkSignInMessage(text.replace("costs nothing", "costs 1 ETH"), expected).ok).toBe(false);
    expect(checkSignInMessage(`${text}\nResources:\n- https://evil.example/permit`, expected).ok).toBe(false);
    expect(checkSignInMessage(buildSignInMessage({ ...base, chainId: 999999 }), expected)).toEqual({
      ok: false,
      reason: "chain",
    });
    const later = { ...expected, now: new Date(now.getTime() + SIGN_IN_TTL_MS + 1) };
    expect(checkSignInMessage(text, later)).toEqual({ ok: false, reason: "expired" });
    const future = buildSignInMessage({ ...base, now: new Date(now.getTime() + 60 * 60_000) });
    expect(checkSignInMessage(future, expected)).toEqual({ ok: false, reason: "early" });
    expect(checkSignInMessage("hello", expected)).toEqual({ ok: false, reason: "unreadable" });
  });
});
