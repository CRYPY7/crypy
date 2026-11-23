import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/env";

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
      disallow: ["/api/", "/*/address/", "/*/tx/", "/*/token/", "/*/search", "/*/admin"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
