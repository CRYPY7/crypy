import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * SEO guard (SEO_ROADMAP.md, Phase 1): every page in the sitemap must keep a search-ready title and description,
 * one H1, a canonical link to itself and valid structured data, so a later change can't quietly break search.
 */

// Search titles: long enough to say what the page is, short enough not to be cut in results (~60 characters).
const TITLE = { min: 15, max: 60 };
// Descriptions: Google shows about 150–160 characters. Legal pages may be shorter.
const DESCRIPTION = { min: 110, max: 160, legalMin: 70 };

test.describe("search engine readiness", () => {
  // The same HTML is served to every screen size: one run is enough.
  test.skip(({ isMobile }) => isMobile, "checked once, on the desktop profile");

  test("every sitemap page has a good title, description, one H1, canonical link and valid structured data", async ({
    request,
  }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
    expect(paths.length).toBeGreaterThan(15);
    expect(paths, "personal pages stay out of the sitemap").not.toContain("/en/settings");

    const titles = new Map<string, string>();
    const problems: string[] = [];
    for (const path of paths) {
      const response = await request.get(path);
      if (response.status() !== 200) {
        problems.push(`${path}: status ${response.status()}`);
        continue;
      }
      const html = await response.text();
      const title = decode(html.match(/<title>(.*?)<\/title>/)?.[1] ?? "");
      const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
      const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
      const legal = path.includes("/legal/");

      if (title.length < TITLE.min || title.length > TITLE.max) problems.push(`${path}: title ${title.length} chars`);
      const min = legal ? DESCRIPTION.legalMin : DESCRIPTION.min;
      if (description.length < min || description.length > DESCRIPTION.max)
        problems.push(`${path}: description ${description.length} chars`);
      if (h1s !== 1) problems.push(`${path}: ${h1s} H1 headings`);
      if (!canonical || new URL(canonical, "http://x").pathname !== path)
        problems.push(`${path}: canonical ${canonical}`);
      if (/<meta name="robots" content="[^"]*noindex/.test(html)) problems.push(`${path}: noindex in the sitemap`);
      for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
          JSON.parse(json);
        } catch {
          problems.push(`${path}: structured data isn't valid JSON`);
        }
      }
      const previous = titles.get(title);
      if (previous) problems.push(`${path}: same title as ${previous}`);
      titles.set(title, path);
    }
    expect(problems).toEqual([]);
  });

  test("unknown tool addresses answer 404, and settings aren't indexed", async ({ request }) => {
    expect((await request.get("/en/tools/not-a-real-tool")).status()).toBe(404);
    const settings = await (await request.get("/en/settings")).text();
    expect(settings).toMatch(/<meta name="robots" content="noindex, follow"/);
  });

  test("icons, manifest and the IndexNow key are served", async ({ request }) => {
    for (const path of ["/favicon.ico", "/apple-icon.png", "/manifest.webmanifest", "/icons/icon-512.png"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
    const home = await (await request.get("/en")).text();
    expect(home).toContain('rel="apple-touch-icon"');
    expect(home).toContain('rel="manifest"');
    const key = readdirSync("public").find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
    expect(key, "IndexNow key file in public/").toBeTruthy();
    expect(await (await request.get(`/${key}`)).text()).toBe(key!.replace(".txt", ""));
  });
});

function decode(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
