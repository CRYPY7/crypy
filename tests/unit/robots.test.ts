import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets crawlers read the site but not the result pages", () => {
    const result = robots();
    expect(result.rules).toMatchObject({ allow: "/" });
    expect(result.sitemap).toContain("/sitemap.xml");
  });

  it("names every language's result pages, not only wildcards", () => {
    const rules = robots().rules as { disallow: string[] };
    for (const path of ["/*/address/", "/en/address/", "/zh-CN/address/", "/ru/tx/", "/pt-BR/token/", "/es/search"]) {
      expect(rules.disallow).toContain(path);
    }
    expect(rules.disallow).not.toContain("/en/");
  });

  it("blocks everything during the friends preview", () => {
    vi.stubEnv("CRYPY_PREVIEW", "1");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
