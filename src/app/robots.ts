import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/env";
import { locales } from "@/i18n/locales";

/** Result pages that call blockchain providers on every visit. */
const RESULT_PAGES = ["address", "tx", "token", "search", "admin"];

/**
 * Crawlers may read the site, but not the infinite result pages (addresses, transactions,
 * uncurated tokens, searches). Those pages call blockchain providers on every visit and are noindex anyway.
 */
export default function robots(): MetadataRoute.Robots {
  // Friends preview before the official launch (CRYPY_PREVIEW=1 when building): nothing may be indexed yet.
  if (process.env.CRYPY_PREVIEW === "1") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Wildcard lines for Google and Bing, plus one line per language for crawlers that don't
      // understand "*" in the middle of a path (Meta's crawler kept opening /en/address/... pages).
      disallow: [
        "/api/",
        ...RESULT_PAGES.map((page) => `/*/${page}${page === "search" || page === "admin" ? "" : "/"}`),
        ...locales.flatMap((locale) =>
          RESULT_PAGES.map((page) => `/${locale}/${page}${page === "search" || page === "admin" ? "" : "/"}`),
        ),
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
