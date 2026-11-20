import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, detectableLocales, isLocale } from "@/i18n/locales";
import { negotiateLocale } from "@/i18n/negotiate";

/**
 * Sends visitors without a language prefix (e.g. "/tools") to their language ("/en/tools").
 * Only reviewed languages are auto-selected; others can still be opened directly by URL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  if (isLocale(firstSegment)) return NextResponse.next();

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
