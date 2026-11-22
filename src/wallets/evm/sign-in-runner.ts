/**
 * Sign-in with the connected wallet (M8, reviewed like revoke-runner.ts). The ONLY module besides the revoke runner
 * allowed to ask the wallet for anything, and it may ask for exactly one thing: a plain-text signature (personal_sign)
 * on CRYPY's sign-in message. Never a transaction, typed data or permit.
 *
 * Steps, each started by the person's click:
 *   1. the server hands out a one-time code;
 *   2. the message is built here for this page's own site and checked again (checkSignInMessage), so the text the
 *      wallet shows always names this site and says it isn't a transaction;
 *   3. the wallet shows the message and the person signs or declines;
 *   4. the server checks the message and signature and sets the session cookie.
 */
import type { Config } from "wagmi";
import { getConnection, signMessage } from "wagmi/actions";
import { getAddress } from "viem";
import { buildSignInMessage, checkSignInMessage } from "@/lib/auth/sign-in-message";
import type { SignInOutcome } from "../types";

function isRejection(error: unknown): boolean {
  const e = error as { code?: number; name?: string; cause?: { code?: number } } | null;
  return (
    e?.code === 4001 ||
    e?.cause?.code === 4001 ||
    e?.name === "UserRejectedRequestError" ||
    /reject|denied|cancel/i.test(String((error as Error)?.message ?? ""))
  );
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
}

export async function runSignIn(config: Config): Promise<SignInOutcome> {
  const connection = getConnection(config);
  if (connection.status !== "connected" || !connection.address || !connection.chainId) return { status: "no-wallet" };
  const address = getAddress(connection.address);

  const nonceResponse = await post("/api/v1/auth/nonce");
  if (!nonceResponse.ok) return { status: nonceResponse.status === 429 ? "rate-limited" : "failed" };
  const { data } = (await nonceResponse.json()) as { data: { nonce: string } };

  const site = { domain: window.location.host, origin: window.location.origin };
  const now = new Date();
  const message = buildSignInMessage({ address, chainId: connection.chainId, nonce: data.nonce, ...site, now });
  // The wallet only ever sees a message that passes the same check the server applies.
  const check = checkSignInMessage(message, { ...site, now });
  if (!check.ok) return { status: check.reason === "chain" ? "unsupported-chain" : "failed" };

  let signature: `0x${string}`;
  try {
    signature = await signMessage(config, { account: address, message });
  } catch (error) {
    return { status: isRejection(error) ? "rejected" : "failed" };
  }

  const response = await post("/api/v1/auth/sign-in", { message, signature });
  if (!response.ok) return { status: response.status === 429 ? "rate-limited" : "failed" };
  return { status: "signed-in", address };
}
