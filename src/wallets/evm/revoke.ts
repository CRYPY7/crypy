/**
 * Revoke transactions — the only transactions CRYPY's own code ever builds (M6).
 *
 * Three shapes are allowed, each setting a permission to zero:
 *   ERC-20     approve(spender, 0)                       0x095ea7b3   to: the token
 *   NFT        setApprovalForAll(operator, false)        0xa22cb465   to: the collection
 *   Permit2    approve(token, spender, 0, 0)             0x87517c45   to: Permit2
 * Value is always 0. `assertRevoke` decodes the final calldata again and refuses anything else, so a bug elsewhere
 * can't turn a revoke into a different transaction. Unit-tested (revoke.test.ts).
 */
import { type Hex, decodeFunctionData, encodeFunctionData, getAddress, isAddress, parseAbi } from "viem";
import type { RevokeRequest } from "../types";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const revokeAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
]);
export const permit2RevokeAbi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export const REVOKE_SELECTORS = {
  approve: "0x095ea7b3",
  setApprovalForAll: "0xa22cb465",
  permit2: "0x87517c45",
} as const;

export interface RevokeTx {
  to: `0x${string}`;
  data: Hex;
  value: 0n;
}

function checkRequest(r: RevokeRequest) {
  if (!Number.isInteger(r.chainId) || r.chainId <= 0) throw new Error("Revoke: bad chain");
  for (const a of [r.owner, r.token, r.spender])
    if (!isAddress(a, { strict: false })) throw new Error("Revoke: bad address");
}

export function buildRevoke(r: RevokeRequest): RevokeTx {
  checkRequest(r);
  const token = getAddress(r.token);
  const spender = getAddress(r.spender);
  let tx: RevokeTx;
  if (r.kind === "token")
    tx = {
      to: token,
      data: encodeFunctionData({ abi: revokeAbi, functionName: "approve", args: [spender, 0n] }),
      value: 0n,
    };
  else if (r.kind === "nft-all")
    tx = {
      to: token,
      data: encodeFunctionData({ abi: revokeAbi, functionName: "setApprovalForAll", args: [spender, false] }),
      value: 0n,
    };
  else
    tx = {
      to: PERMIT2_ADDRESS,
      data: encodeFunctionData({ abi: permit2RevokeAbi, functionName: "approve", args: [token, spender, 0n, 0] }),
      value: 0n,
    };
  assertRevoke(tx, r);
  return tx;
}

/** Throws unless `tx` is exactly the zeroing call for `r`. */
export function assertRevoke(tx: { to: string; data: string; value?: bigint }, r: RevokeRequest): void {
  checkRequest(r);
  if ((tx.value ?? 0n) !== 0n) throw new Error("Revoke: value must be 0");
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const selector = tx.data.slice(0, 10).toLowerCase();
  if (r.kind === "permit2") {
    if (!same(tx.to, PERMIT2_ADDRESS) || selector !== REVOKE_SELECTORS.permit2)
      throw new Error("Revoke: not a Permit2 revoke");
    const { args } = decodeFunctionData({ abi: permit2RevokeAbi, data: tx.data as Hex });
    if (!same(args[0], r.token) || !same(args[1], r.spender) || args[2] !== 0n || args[3] !== 0)
      throw new Error("Revoke: Permit2 arguments");
  } else {
    if (!same(tx.to, r.token)) throw new Error("Revoke: wrong contract");
    const want = r.kind === "token" ? REVOKE_SELECTORS.approve : REVOKE_SELECTORS.setApprovalForAll;
    if (selector !== want) throw new Error("Revoke: wrong function");
    const { functionName, args } = decodeFunctionData({ abi: revokeAbi, data: tx.data as Hex });
    if (functionName === "approve" ? args[1] !== 0n : args[1] !== false) throw new Error("Revoke: must set to zero");
    if (!same(args[0], r.spender)) throw new Error("Revoke: wrong spender");
  }
  // Re-encoding must give the same bytes (no trailing data).
  const again =
    r.kind === "permit2"
      ? encodeFunctionData({
          abi: permit2RevokeAbi,
          functionName: "approve",
          args: [getAddress(r.token), getAddress(r.spender), 0n, 0],
        })
      : r.kind === "token"
        ? encodeFunctionData({ abi: revokeAbi, functionName: "approve", args: [getAddress(r.spender), 0n] })
        : encodeFunctionData({
            abi: revokeAbi,
            functionName: "setApprovalForAll",
            args: [getAddress(r.spender), false],
          });
  if (again.toLowerCase() !== tx.data.toLowerCase()) throw new Error("Revoke: extra data");
}

/** "approve(0x9f3c…a21b, 0)" — what the wallet will show, for the preview. */
export function describeRevoke(r: RevokeRequest): string {
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  if (r.kind === "token") return `approve(${short(r.spender)}, 0)`;
  if (r.kind === "nft-all") return `setApprovalForAll(${short(r.spender)}, false)`;
  return `approve(${short(r.token)}, ${short(r.spender)}, 0, 0)`;
}
