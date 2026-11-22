import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";

describe("robots.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets crawlers read the site but not the result pages", () => {
    const result = robots();
    expect(result.rules).toMatchObject({ allow: "/" });
    expect(result.sitemap).toContain("/sitemap.xml");
  });

  it("blocks everything during the friends preview", () => {
    vi.stubEnv("CRYPY_PREVIEW", "1");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
