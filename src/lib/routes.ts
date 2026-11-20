import type { Locale } from "@/i18n/locales";
import type { ToolId } from "@/config/tools";

/** Builds a locale-prefixed path, e.g. localePath("en", "/tools") → "/en/tools". */
export function localePath(locale: Locale, path = ""): string {
  const clean = path === "/" ? "" : path;
  return `/${locale}${clean}`;
}

export function toolPath(locale: Locale, id: ToolId): string {
  return localePath(locale, `/tools/${id}`);
}

/** Replaces the locale segment of a pathname, keeping the rest of the path. */
export function switchLocalePath(pathname: string, next: Locale): string {
  const parts = pathname.split("/");
  parts[1] = next;
  return parts.join("/") || `/${next}`;
}
