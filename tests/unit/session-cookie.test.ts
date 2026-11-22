import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { clearedSessionCookie, sessionCookie } from "@/server/auth/request";

describe("session cookie", () => {
  it("is Secure behind an https proxy (the app itself sees http)", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/v1/auth/sign-in", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(sessionCookie(request, "t")).toMatch(/; Secure$/);
    expect(clearedSessionCookie(request)).toMatch(/; Secure$/);
  });

  it("is Secure on https, always httpOnly and SameSite=Lax", () => {
    const cookie = sessionCookie(new NextRequest("https://crypy.org/api"), "t");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toMatch(/; Secure$/);
  });

  it("stays usable on http://localhost (the owner's PC)", () => {
    expect(sessionCookie(new NextRequest("http://localhost:3000/api"), "t")).not.toContain("Secure");
  });
});
