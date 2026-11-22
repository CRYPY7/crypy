import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, detectableLocales, isLocale } from "@/i18n/locales";
import { negotiateLocale } from "@/i18n/negotiate";
import { toolIds } from "@/config/tools";
import { guideSlugs } from "@/content/learn/slugs";
import { chainKeyFromSlug, chainSlugs, findCuratedToken } from "@/config/seo-pages";

/**
 * Sends visitors without a language prefix (e.g. "/tools") to their language ("/en/tools").
 * Only reviewed languages are auto-selected; others can still be opened directly by URL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  if (isLocale(firstSegment)) {
    // Unknown tool, guide, gas-chain and token-check addresses get a real 404 status. The tool route streams, so its own not-found answer would
    // already have sent 200 (a "soft 404" for search engines).
    const [, , section, id, ...rest] = pathname.split("/");
    const known: Record<string, readonly string[]> = {
      tools: toolIds,
      learn: guideSlugs,
      gas: Object.values(chainSlugs),
    };
    const unknownPage =
      (id && rest.length === 0 && known[section] && !known[section].includes(id)) ||
      // /tokens/<chain>/<token>: only curated tokens have a page.
      (section === "tokens" && Boolean(id) && !isCuratedPage(id!, rest));
    if (unknownPage) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment}/not-found`;
      return NextResponse.rewrite(url, { status: 404 });
    }
    return NextResponse.next();
  }

  // "/EN/tools" → "/en/tools" (one redirect instead of "/en/EN/tools").
  if (firstSegment && firstSegment !== firstSegment.toLowerCase() && isLocale(firstSegment.toLowerCase())) {
    const url = request.nextUrl.clone();
    url.pathname = `/${firstSegment.toLowerCase()}${pathname.slice(firstSegment.length + 1)}`;
    return NextResponse.redirect(url, 308);
  }

  const locale = negotiateLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language"),
    detectableLocales,
  );

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension (icons, robots.txt, sitemap.xml…).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

function isCuratedPage(chainSlug: string, rest: string[]): boolean {
  const chain = chainKeyFromSlug(chainSlug);
  return rest.length === 1 && chain !== undefined && findCuratedToken(chain, rest[0]!) !== undefined;
}
