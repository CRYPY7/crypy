/**
 * Runs a revoke in the user's wallet. The ONLY module allowed to ask the wallet to send a transaction
 * (eslint.config.mjs; ARCHITECTURE.md §10, M6 review). Every step:
 *   1. the connected account must be the wallet that gave the approval;
 *   2. the wallet must be on the approval's chain (the wallet asks to switch; nothing is signed);
 *   3. the calldata is built and checked by revoke.ts (zeroing calls only, value 0);
 *   4. the exact transaction is tested first with eth_call; if it would fail, the wallet isn't opened;
 *   5. the user confirms in their wallet;
 *   6. after the receipt, the allowance is read again from the chain.
 */
import type { Config } from "wagmi";
import {
  call,
  estimateGas,
  getConnection,
  getGasPrice,
  readContract,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
} from "wagmi/actions";
import { formatEther, getAddress, parseAbi } from "viem";
import type { RevokeOutcome, RevokePreview, RevokeRequest, RevokeStep } from "../types";
import { assertRevoke, buildRevoke, describeRevoke } from "./revoke";

const readAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

type ChainId = Config["chains"][number]["id"];

function isRejection(error: unknown): boolean {
  const e = error as { code?: number; name?: string; cause?: { code?: number } } | null;
  return (
    e?.code === 4001 ||
    e?.cause?.code === 4001 ||
    e?.name === "UserRejectedRequestError" ||
    /reject|denied|cancel/i.test(String((error as Error)?.message ?? ""))
  );
}

export async function previewRevoke(config: Config, r: RevokeRequest): Promise<RevokePreview> {
  const tx = buildRevoke(r);
  const chainId = r.chainId as ChainId;
  let tested = false;
  let fee: string | null = null;
  try {
    await call(config, { chainId, account: getAddress(r.owner), to: tx.to, data: tx.data, value: 0n });
    tested = true;
    const [gas, price] = await Promise.all([
      estimateGas(config, { chainId, account: getAddress(r.owner), to: tx.to, data: tx.data, value: 0n }),
      getGasPrice(config, { chainId }),
    ]);
    fee = formatEther(gas * price);
  } catch {
    // Not tested: the dialog says so, and revoke() will refuse to open the wallet.
  }
  return { to: tx.to, call: describeRevoke(r), fee, tested };
}

export async function runRevoke(
  config: Config,
  r: RevokeRequest,
  onStep: (step: RevokeStep) => void,
): Promise<RevokeOutcome> {
  onStep("checking");
  const connection = getConnection(config);
  if (connection.status !== "connected" || !connection.address) return { status: "wrong-account", connected: null };
  if (connection.address.toLowerCase() !== r.owner.toLowerCase())
    return { status: "wrong-account", connected: connection.address };
  const chainId = r.chainId as ChainId;
  if (connection.chainId !== r.chainId) {
    onStep("switching");
    try {
      await switchChain(config, { chainId });
    } catch {
      return { status: "wrong-network" };
    }
  }

  const tx = buildRevoke(r);
  assertRevoke(tx, r);
  const account = getAddress(r.owner);

  onStep("testing");
  try {
    await call(config, { chainId, account, to: tx.to, data: tx.data, value: 0n });
  } catch {
    return { status: "test-failed" };
  }

  onStep("confirm");
  let hash: `0x${string}`;
  try {
    hash = await sendTransaction(config, { chainId, account, to: tx.to, data: tx.data, value: 0n });
  } catch (error) {
    return isRejection(error) ? { status: "rejected" } : { status: "failed" };
  }

  onStep("pending");
  let receipt;
  try {
    receipt = await waitForTransactionReceipt(config, { chainId, hash });
  } catch {
    return { status: "failed", hash };
  }
  if (receipt.status !== "success") return { status: "failed", hash };

  onStep("verifying");
  const feePaid =
    receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined
      ? formatEther(receipt.gasUsed * receipt.effectiveGasPrice)
      : null;
  let cleared = false;
  try {
    const at = { chainId, blockNumber: receipt.blockNumber } as const;
    if (r.kind === "token")
      cleared =
        (await readContract(config, {
          ...at,
          address: getAddress(r.token),
          abi: readAbi,
          functionName: "allowance",
          args: [account, getAddress(r.spender)],
        })) === 0n;
    else if (r.kind === "nft-all")
      cleared = !(await readContract(config, {
        ...at,
        address: getAddress(r.token),
        abi: readAbi,
        functionName: "isApprovedForAll",
        args: [account, getAddress(r.spender)],
      }));
    else {
      const [amount] = await readContract(config, {
        ...at,
        address: getAddress(r.permit2!),
        abi: readAbi,
        functionName: "allowance",
        args: [account, getAddress(r.token), getAddress(r.spender)],
      });
      cleared = amount === 0n;
    }
  } catch {
    cleared = false;
  }
  return { status: "revoked", hash, block: receipt.blockNumber.toString(), feePaid, cleared };
}
