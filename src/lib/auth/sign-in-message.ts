import { type SiweMessage, createSiweMessage, parseSiweMessage } from "viem/siwe";
import { liveChains } from "@/config/chains";

/**
 * The sign-in message (Sign-In with Ethereum, EIP-4361). Shared by the browser, which builds it, and the server, which
 * checks it. The text is fixed and says plainly that it isn't a transaction. A message for another site (different
 * domain), another page origin, or with other wording is refused on both sides.
 */
export const SIGN_IN_STATEMENT =
  "Sign in to CRYPY. This is a message, not a transaction: it costs nothing and can't move your funds.";
export const SIGN_IN_TTL_MS = 10 * 60_000;
/** Clock difference tolerated between the visitor's device and the server. */
const CLOCK_SKEW_MS = 5 * 60_000;

const signInChainIds = new Set(liveChains.filter((c) => c.family === "evm").map((c) => c.evmChainId));

export function buildSignInMessage(input: {
  address: `0x${string}`;
  chainId: number;
  nonce: string;
  /** The page's host, e.g. "crypy.org" or "localhost:3000". */
  domain: string;
  /** The page's origin, e.g. "https://crypy.org". */
  origin: string;
  now: Date;
}): string {
  return createSiweMessage({
    address: input.address,
    chainId: input.chainId,
    domain: input.domain,
    nonce: input.nonce,
    uri: input.origin,
    version: "1",
    statement: SIGN_IN_STATEMENT,
    issuedAt: input.now,
    expirationTime: new Date(input.now.getTime() + SIGN_IN_TTL_MS),
  });
}

export type SignInCheck =
  | { ok: true; message: SiweMessage & { address: `0x${string}`; nonce: string; chainId: number } }
  | {
      ok: false;
      reason: "unreadable" | "domain" | "origin" | "statement" | "chain" | "expired" | "early" | "version";
    };

/** Checks everything about a sign-in message except the signature itself. */
export function checkSignInMessage(text: string, expected: { domain: string; origin: string; now: Date }): SignInCheck {
  if (text.length > 2_000) return { ok: false, reason: "unreadable" };
  let m: Partial<SiweMessage>;
  try {
    m = parseSiweMessage(text);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!m.address || !m.nonce || !m.chainId || !m.issuedAt || !m.expirationTime)
    return { ok: false, reason: "unreadable" };
  // The message must be exactly what CRYPY builds: anything added (resources, request id) is refused.
  if (m.resources?.length || m.requestId || m.notBefore) return { ok: false, reason: "unreadable" };
  if (m.version !== "1") return { ok: false, reason: "version" };
  if (m.domain !== expected.domain) return { ok: false, reason: "domain" };
  if (m.uri !== expected.origin) return { ok: false, reason: "origin" };
  if (m.statement !== SIGN_IN_STATEMENT) return { ok: false, reason: "statement" };
  if (!signInChainIds.has(m.chainId)) return { ok: false, reason: "chain" };
  const now = expected.now.getTime();
  const issued = m.issuedAt.getTime();
  const expires = m.expirationTime.getTime();
  if (issued > now + CLOCK_SKEW_MS) return { ok: false, reason: "early" };
  if (expires <= now || expires - issued > SIGN_IN_TTL_MS + CLOCK_SKEW_MS) return { ok: false, reason: "expired" };
  const rebuilt = buildSignInMessage({
    address: m.address,
    chainId: m.chainId,
    nonce: m.nonce,
    domain: expected.domain,
    origin: expected.origin,
    now: m.issuedAt,
  });
  // Same fields, same layout: no extra lines hidden in the text the wallet showed.
  if (rebuilt.replace(/Expiration Time: .*/, "") !== text.replace(/Expiration Time: .*/, "")) {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true, message: m as SiweMessage & { address: `0x${string}`; nonce: string; chainId: number } };
}
