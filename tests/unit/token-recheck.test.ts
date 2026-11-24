/** B-010: one node's bad answer must not turn a real token into "not a token". */
import { describe, expect, it } from "vitest";
import {
  type TokenBasics,
  type TokenReader,
  firstValidToken,
  isTokenAnswer,
} from "@/server/chains/evm/security/token-basics";

const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ok = (result: unknown) => ({ status: "success" as const, result });
const failed = { status: "failure" as const };
const token: TokenBasics = { code: "0x6080", meta: [ok("Tether USD"), ok("USDT"), ok(6), ok(10n ** 15n)] };
const noCode: TokenBasics = { code: "0x", meta: [failed, failed, failed, failed] };
const badDecimals: TokenBasics = { code: "0x6080", meta: [ok("Tether USD"), ok("USDT"), failed, ok(10n ** 15n)] };
const later =
  (basics: TokenBasics, ms: number): TokenReader =>
  () =>
    new Promise((r) => setTimeout(() => r(basics), ms));

describe("token recheck", () => {
  it("knows a full answer from a broken one", () => {
    expect(isTokenAnswer(token)).toBe(true);
    expect(isTokenAnswer(noCode)).toBe(false);
    expect(isTokenAnswer(badDecimals)).toBe(false);
    expect(isTokenAnswer({ ...token, code: null })).toBe(false);
  });

  it("takes the provider that answers properly when another returns empty code", async () => {
    const result = await firstValidToken([later(noCode, 1), later(token, 20)], USDT, 1_000);
    expect(result).toEqual(token);
  });

  it("takes a proper answer when another node fails the decimals read or throws", async () => {
    const broken: TokenReader = () => Promise.reject(new Error("timeout"));
    expect(await firstValidToken([later(badDecimals, 1), broken, later(token, 10)], USDT, 1_000)).toEqual(token);
  });

  it("concludes 'not a token' only when every provider agrees", async () => {
    expect(await firstValidToken([later(noCode, 1), later(noCode, 5)], USDT, 1_000)).toBeNull();
    expect(await firstValidToken([], USDT, 1_000)).toBeNull();
  });

  it("doesn't wait forever for a hanging node", async () => {
    const hang: TokenReader = () => new Promise(() => {});
    const start = Date.now();
    expect(await firstValidToken([later(noCode, 1), hang], USDT, 50)).toBeNull();
    expect(Date.now() - start).toBeLessThan(500);
  });
});
