import "server-only";
import type { NextRequest } from "next/server";
import { siteUrl } from "@/config/env";
import { SESSION_COOKIE, SESSION_DAYS, type SessionUser, sessionUser } from "./session";

/**
 * Request helpers for signed-in APIs (M8).
 * Requests that change something must come from CRYPY's own pages: the browser's Origin header has to match the host
 * the request was sent to (with SameSite=Lax cookies, this blocks cross-site request forgery).
 */
export function sameOrigin(request: NextRequest): { ok: true; origin: string; host: string } | { ok: false } {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return { ok: false };
  try {
    const url = new URL(origin);
    if (url.host !== host || (url.protocol !== "https:" && url.protocol !== "http:")) return { ok: false };
    return { ok: true, origin: url.origin, host };
  } catch {
    return { ok: false };
  }
}

export function sessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export async function currentUser(request: NextRequest): Promise<SessionUser | null> {
  return sessionUser(sessionToken(request));
}

/**
 * True when the visitor reached the site over https. Behind nginx on the VPS the app itself sees plain http, so the
 * proxy's `X-Forwarded-Proto` and the configured public address count too (security review, M9: without this the
 * session cookie would have lost its Secure flag in production).
 */
export function isHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  if (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  return siteUrl.protocol === "https:";
}

/** httpOnly session cookie; Secure on https (http://localhost is only used on the owner's PC). */
export function sessionCookie(request: NextRequest, token: string): string {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`;
}

export function clearedSessionCookie(request: NextRequest): string {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
