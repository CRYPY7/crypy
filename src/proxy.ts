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

  // A backslash in the path ("/en/tools/x%5C") is never a real page. On the server (Node 26) the 404 rewrite below fails
  // for these and answers 500, so send them once to the same path without it (Next already does this for a raw "\").
  const cleaned = stripBackslashes(pathname);
  if (cleaned !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = cleaned;
    return NextResponse.redirect(url, 308);
  }

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

/** Removes raw and percent-encoded backslashes and the empty segments they leave behind. */
export function stripBackslashes(pathname: string): string {
  if (!/\\|%5c/i.test(pathname)) return pathname;
  const cleaned = pathname.replace(/\\|%5c/gi, "").replace(/\/{2,}/g, "/");
  const trimmed = cleaned.length > 1 ? cleaned.replace(/\/+$/, "") : cleaned;
  return trimmed === "" ? "/" : trimmed;
}
