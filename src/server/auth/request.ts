import "server-only";
import type { NextRequest } from "next/server";
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

/** httpOnly session cookie; Secure on https (http://localhost is only used on the owner's PC). */
export function sessionCookie(request: NextRequest, token: string): string {
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`;
}

export function clearedSessionCookie(request: NextRequest): string {
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
