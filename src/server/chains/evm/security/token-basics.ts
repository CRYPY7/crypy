import type { Hex } from "viem";

/** A token's code plus the results of name/symbol/decimals/totalSupply, as one multicall returns them. */
export interface TokenBasics {
  code: Hex | null;
  meta: ReadonlyArray<{ status: "success" | "failure"; result?: unknown }>;
}

export type TokenReader = (token: `0x${string}`) => Promise<TokenBasics>;

/** A full answer: contract code, and decimals and total supply both read. */
export function isTokenAnswer(basics: TokenBasics | null): basics is TokenBasics {
  if (!basics || !basics.code || basics.code === "0x") return false;
  const [, , decimals, supply] = basics.meta;
  return decimals?.status === "success" && supply?.status === "success";
}

/**
 * Ask every reader at once; resolve with the first full answer, or null when none gives one within `ms`
 * (all said "no code", failed or were too slow). A bad node can't invent a valid answer, so any full one is trusted.
 */
export function firstValidToken(readers: TokenReader[], token: `0x${string}`, ms: number): Promise<TokenBasics | null> {
  if (readers.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = readers.length;
    const timer = setTimeout(() => resolve(null), ms);
    const settle = (basics: TokenBasics | null) => {
      if (isTokenAnswer(basics)) {
        clearTimeout(timer);
        resolve(basics);
        return;
      }
      pending -= 1;
      if (pending === 0) {
        clearTimeout(timer);
        resolve(null);
      }
    };
    for (const read of readers) read(token).then(settle, () => settle(null));
  });
}
