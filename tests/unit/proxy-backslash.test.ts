import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, stripBackslashes } from "@/proxy";

describe("stripBackslashes (B-033)", () => {
  it("leaves normal paths alone", () => {
    for (const path of ["/", "/en", "/en/tools/token-security", "/en/tokens/bsc/cake"]) {
      expect(stripBackslashes(path)).toBe(path);
    }
  });

  it("removes raw and encoded backslashes in any case", () => {
    expect(stripBackslashes("/en/tools/token-security%5C")).toBe("/en/tools/token-security");
    expect(stripBackslashes("/en/tools/token-security%5c")).toBe("/en/tools/token-security");
    expect(stripBackslashes("/en/tools/token-security\\")).toBe("/en/tools/token-security");
    expect(stripBackslashes("/en/%5C/tools")).toBe("/en/tools");
    expect(stripBackslashes("/%5C")).toBe("/");
    expect(stripBackslashes("%5C")).toBe("/");
  });
});

describe("proxy with a backslash in the path", () => {
  it("redirects once (308) to the clean address and keeps the query", () => {
    const answer = proxy(new NextRequest("https://crypy.org/en/tools/token-security%5C?chain=bsc"));
    expect(answer.status).toBe(308);
    const location = new URL(answer.headers.get("location")!);
    expect(location.pathname).toBe("/en/tools/token-security");
    expect(location.search).toBe("?chain=bsc");
  });

  it("still answers 404 for unknown tools and passes known ones through", () => {
    expect(proxy(new NextRequest("https://crypy.org/en/tools/not-a-real-tool")).status).toBe(404);
    expect(proxy(new NextRequest("https://crypy.org/en/tools/token-security")).headers.get("x-middleware-next")).toBe(
      "1",
    );
  });
});
