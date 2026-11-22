import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { type Address, getAddress, verifyMessage } from "viem";
import { getChainByEvmId } from "@/config/chains";
import { checkSignInMessage } from "@/lib/auth/sign-in-message";
import { getEvmClient } from "@/server/chains/evm/providers";
import { type Db, getDb } from "@/server/db/client";
import { accounts, sessions, signInNonces, users } from "@/server/db/schema";

/**
 * Sign-in sessions (M8). The visitor signs a fixed message in their wallet (no transaction). The server checks the
 * message (site, page, wording, time), uses up its one-time code, checks the signature (ordinary wallets locally;
 * smart-contract wallets through the chain, EIP-1271/6492), then sets an httpOnly cookie. Only the SHA-256 of the
 * cookie's token is stored.
 */
export const SESSION_COOKIE = "crypy_session";
export const SESSION_DAYS = 30;
const NONCE_TTL_MS = 10 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * One account per EVM address, whatever chain it signed on (an EVM address is the same on every EVM chain). Stored as
 * CAIP-10 on Ethereum's id, the convention for "this EVM address".
 */
export function accountIdFor(address: string): string {
  return `eip155:1:${address.toLowerCase()}`;
}

/** A fresh one-time code for a sign-in message (16 letters and digits). */
export async function createNonce(db?: Db): Promise<{ nonce: string; expiresAt: Date }> {
  const database = db ?? (await getDb());
  const bytes = randomBytes(16);
  const nonce = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await database.delete(signInNonces).where(lt(signInNonces.expiresAt, new Date()));
  await database.insert(signInNonces).values({ nonce, expiresAt });
  return { nonce, expiresAt };
}

export type SignInResult =
  | { ok: true; token: string; address: Address; expiresAt: Date }
  | { ok: false; reason: "message" | "nonce" | "signature" };

/** Checks a signed sign-in message and opens a session. `domain` and `origin` are this server's own. */
export async function signIn(
  input: { message: string; signature: string; domain: string; origin: string },
  options: { db?: Db; now?: Date; verifyOnChain?: typeof verifyOnChain } = {},
): Promise<SignInResult> {
  const db = options.db ?? (await getDb());
  const now = options.now ?? new Date();
  if (!/^0x[0-9a-fA-F]{2,20000}$/.test(input.signature)) return { ok: false, reason: "signature" };
  const check = checkSignInMessage(input.message, { domain: input.domain, origin: input.origin, now });
  if (!check.ok) return { ok: false, reason: "message" };
  const { address, nonce, chainId } = check.message;

  // The one-time code is used up before the signature is checked, so a message can never be replayed.
  const used = await db
    .delete(signInNonces)
    .where(and(eq(signInNonces.nonce, nonce), gt(signInNonces.expiresAt, now)))
    .returning();
  if (used.length === 0) return { ok: false, reason: "nonce" };

  const signature = input.signature as `0x${string}`;
  let valid = false;
  try {
    valid = await verifyMessage({ address, message: input.message, signature });
  } catch {
    valid = false;
  }
  if (!valid) valid = await (options.verifyOnChain ?? verifyOnChain)(chainId, address, input.message, signature);
  if (!valid) return { ok: false, reason: "signature" };

  const accountId = accountIdFor(address);
  const userId = await db.transaction(async (tx) => {
    const existing = await tx.select().from(accounts).where(eq(accounts.accountId, accountId));
    if (existing[0]) return existing[0].userId;
    const [user] = await tx.insert(users).values({}).returning();
    await tx.insert(accounts).values({ accountId, userId: user!.id });
    return user!.id;
  });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, accountId, expiresAt });
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
  return { ok: true, token, address: getAddress(address), expiresAt };
}

/** Smart-contract wallets (Safe, smart accounts): the chain says whether the signature is theirs. */
async function verifyOnChain(chainId: number, address: Address, message: string, signature: `0x${string}`) {
  const chain = getChainByEvmId(chainId);
  if (!chain) return false;
  try {
    return await getEvmClient(chain).verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}

export interface SessionUser {
  userId: string;
  accountId: string;
  address: Address;
}

/** The signed-in person for a request's cookie, or null. */
export async function sessionUser(token: string | undefined, options: { db?: Db; now?: Date } = {}) {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const db = options.db ?? (await getDb());
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, options.now ?? new Date())));
  if (!row) return null;
  return {
    userId: row.userId,
    accountId: row.accountId,
    address: getAddress(row.accountId.split(":")[2]!),
  } satisfies SessionUser;
}

export async function signOut(token: string | undefined, options: { db?: Db } = {}) {
  if (!token) return;
  const db = options.db ?? (await getDb());
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
