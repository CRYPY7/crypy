import { afterAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildSignInMessage } from "@/lib/auth/sign-in-message";

process.env.PGLITE_DIR = "memory";
const { getDb, resetDb } = await import("@/server/db/client");
const { createNonce, sessionUser, signIn, signOut } = await import("@/server/auth/session");

/** A throwaway key made for this test only. */
const wallet = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const site = { domain: "crypy.org", origin: "https://crypy.org" };
const noChain = async () => false;

async function signed(nonce: string, signer = wallet, address = wallet.address) {
  const message = buildSignInMessage({ address, chainId: 56, nonce, ...site, now: new Date() });
  return { message, signature: await signer.signMessage({ message }) };
}

describe("sign-in sessions", () => {
  afterAll(() => resetDb());

  it("signs in with a valid signature, finds the session, and signs out", async () => {
    const db = await getDb();
    const { nonce } = await createNonce(db);
    const result = await signIn({ ...(await signed(nonce)), ...site }, { db, verifyOnChain: noChain });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.address).toBe(wallet.address);
    const user = await sessionUser(result.token, { db });
    expect(user?.address).toBe(wallet.address);
    await signOut(result.token, { db });
    expect(await sessionUser(result.token, { db })).toBeNull();
  });

  it("the same wallet signing in again gets the same account", async () => {
    const db = await getDb();
    const a = await signIn(
      { ...(await signed((await createNonce(db)).nonce)), ...site },
      { db, verifyOnChain: noChain },
    );
    const b = await signIn(
      { ...(await signed((await createNonce(db)).nonce)), ...site },
      { db, verifyOnChain: noChain },
    );
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    expect((await sessionUser(a.token, { db }))?.userId).toBe((await sessionUser(b.token, { db }))?.userId);
  });

  it("a one-time code works once: a replayed message is refused", async () => {
    const db = await getDb();
    const input = { ...(await signed((await createNonce(db)).nonce)), ...site };
    expect((await signIn(input, { db, verifyOnChain: noChain })).ok).toBe(true);
    expect(await signIn(input, { db, verifyOnChain: noChain })).toEqual({ ok: false, reason: "nonce" });
  });

  it("refuses a signature from another wallet, an unknown code, and a message for another site", async () => {
    const db = await getDb();
    const forged = await signed((await createNonce(db)).nonce, other, wallet.address);
    expect(await signIn({ ...forged, ...site }, { db, verifyOnChain: noChain })).toEqual({
      ok: false,
      reason: "signature",
    });
    const unknown = await signed("Zz9Yy8Xx7Ww6Vv5U");
    expect(await signIn({ ...unknown, ...site }, { db, verifyOnChain: noChain })).toEqual({
      ok: false,
      reason: "nonce",
    });
    const elsewhere = await signed((await createNonce(db)).nonce);
    expect(
      await signIn(
        { ...elsewhere, domain: "evil.example", origin: "https://evil.example" },
        { db, verifyOnChain: noChain },
      ),
    ).toEqual({ ok: false, reason: "message" });
  });

  it("ignores malformed or unknown session tokens", async () => {
    const db = await getDb();
    expect(await sessionUser(undefined, { db })).toBeNull();
    expect(await sessionUser("x'; drop table users; --", { db })).toBeNull();
    expect(await sessionUser("A".repeat(43), { db })).toBeNull();
  });
});
