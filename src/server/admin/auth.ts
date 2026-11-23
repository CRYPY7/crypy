import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth/request";
import { SESSION_COOKIE, type SessionUser, accountIdFor, sessionUser } from "@/server/auth/session";
import { serverEnv } from "@/server/env";

/**
 * Who may open the admin dashboard (M9 Part 5): a signed-in wallet (the existing Sign-In with Ethereum session) whose
 * address is listed in ADMIN_WALLETS on the server. No passwords; nothing about the list is sent to the browser.
 */
export function isAdminAddress(address: string, admins: readonly string[] = serverEnv.ADMIN_WALLETS): boolean {
  return admins.includes(address.toLowerCase());
}

export type AdminAccess =
  { kind: "signed-out" } | { kind: "not-admin"; user: SessionUser } | { kind: "admin"; user: SessionUser };

function access(user: SessionUser | null): AdminAccess {
  if (!user) return { kind: "signed-out" };
  return isAdminAddress(user.address) ? { kind: "admin", user } : { kind: "not-admin", user };
}

/** For the admin page (server component). */
export async function adminAccessFromCookies(): Promise<AdminAccess> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return access(await sessionUser(token));
}

/** For admin API routes. */
export async function adminAccessFromRequest(request: NextRequest): Promise<AdminAccess> {
  return access(await currentUser(request));
}

/** CAIP-10 account ids of the admin wallets (EVM), for finding their linked Telegram chats. */
export function adminAccountIds(admins: readonly string[] = serverEnv.ADMIN_WALLETS): string[] {
  return admins.map(accountIdFor);
}
