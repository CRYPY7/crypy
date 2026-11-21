import { getEvmApprovals } from "./approvals";
import { getEvmTokenSecurity } from "./security/token-security";
import "server-only";
import { getEvmBalances } from "./balances";
import { type Hex, type PublicClient, erc20Abi, getAddress, isAddress } from "viem";
import { sanitizeTokenText } from "@/lib/chains/sanitize";
import type {
  AddressLookup,
  ChainFamilyAdapter,
  ParsedAddress,
  ProviderCheck,
  TokenInfo,
  TxLookup,
} from "@/lib/chains/types";
import { getEvmTxDetails } from "./tx";
import { getOnchainPrices } from "./prices";
import { alchemyProvider, clientFor, getEvmClient, providersFor } from "./providers";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
/** EIP-7702: an account's code set to 0xef0100 + 20-byte address means it delegates to a contract. */
const EIP7702_PREFIX = "0xef0100";

async function readToken(client: PublicClient, address: Hex): Promise<TokenInfo | undefined> {
  const [name, symbol, decimals, totalSupply] = await client.multicall({
    allowFailure: true,
    contracts: [
      { address, abi: erc20Abi, functionName: "name" },
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "decimals" },
      { address, abi: erc20Abi, functionName: "totalSupply" },
    ],
  });
  // A token must at least answer decimals, symbol and totalSupply.
  if (decimals.status !== "success" || symbol.status !== "success" || totalSupply.status !== "success") {
    return undefined;
  }
  const dec = Number(decimals.result);
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) return undefined;
  return {
    name: sanitizeTokenText(name.status === "success" ? name.result : "", 64),
    symbol: sanitizeTokenText(symbol.result, 32),
    decimals: dec,
    totalSupply: { raw: totalSupply.result.toString(), decimals: dec },
  };
}

export const evmAdapter: ChainFamilyAdapter = {
  family: "evm",

  parseAddress(input: string): ParsedAddress | null {
    if (!EVM_ADDRESS.test(input)) return null;
    const lower = input.toLowerCase();
    const hasCase = input !== lower && input !== `0x${input.slice(2).toUpperCase()}`;
    return {
      normalized: getAddress(lower),
      checksumValid: hasCase ? isAddress(input, { strict: true }) : null,
    };
  },

  parseTxId(input: string): string | null {
    return EVM_HASH.test(input) ? input.toLowerCase() : null;
  },

  explorerUrl(chain, kind, id) {
    const path = kind === "tx" ? "tx" : kind === "token" ? "token" : "address";
    return `${chain.explorer.url}/${path}/${id}`;
  },

  async getHead(chain) {
    const started = Date.now();
    const blockNumber = await getEvmClient(chain).getBlockNumber();
    return { chain: chain.key, blockNumber: blockNumber.toString(), latencyMs: Date.now() - started };
  },

  async getBalances(chain, address) {
    return getEvmBalances(getEvmClient(chain), chain, address, alchemyProvider(chain));
  },

  /** Approvals: GoPlus leads plus CRYPY's own checks, every allowance re-read on-chain (approvals.ts). */
  getApprovals(chain, owner, heldTokens) {
    return getEvmApprovals(chain, owner, heldTokens);
  },

  /** Prices from on-chain DEX pools (our own engine; no price API). */
  async getUsdPrices(chain, tokens) {
    const prices = await getOnchainPrices(getEvmClient(chain), chain, tokens);
    const map = new Map<string, { usd: number }>(prices.tokens);
    if (prices.native) map.set("native", prices.native);
    return map;
  },

  /** Tests each configured provider on its own, so the health page can show which ones work. */
  async checkProviders(chain): Promise<ProviderCheck[]> {
    const configured = providersFor(chain);
    const checks = await Promise.all(
      configured.map(async (provider) => {
        const started = Date.now();
        try {
          await clientFor(chain, provider).getBlockNumber({ cacheTime: 0 });
          return { name: provider.name, ok: true, latencyMs: Date.now() - started };
        } catch {
          return { name: provider.name, ok: false };
        }
      }),
    );
    const alchemyConfigured = configured.some((provider) => provider.kind === "alchemy");
    return alchemyConfigured ? checks : [{ name: "alchemy", ok: false, notConfigured: true }, ...checks];
  },

  async lookupAddress(chain, address): Promise<AddressLookup> {
    const client = getEvmClient(chain);
    const target = address as Hex;
    const [code, nonce, balance] = await Promise.all([
      client.getCode({ address: target }),
      client.getTransactionCount({ address: target }),
      client.getBalance({ address: target }),
    ]);
    const nativeBalance = { raw: balance.toString(), decimals: chain.nativeDecimals };
    const hasCode = Boolean(code && code !== "0x");
    if (!hasCode) return { chain: chain.key, kind: "account", hasActivity: nonce > 0, nativeBalance };
    if (code && code.toLowerCase().startsWith(EIP7702_PREFIX) && code.length === 48) {
      return { chain: chain.key, kind: "account", hasActivity: true, delegated: true, nativeBalance };
    }
    const token = await readToken(client, target).catch(() => undefined);
    return token
      ? { chain: chain.key, kind: "token", hasActivity: true, token, nativeBalance }
      : { chain: chain.key, kind: "contract", hasActivity: true, nativeBalance };
  },

  getTransactionDetails(chain, hash) {
    return getEvmTxDetails(getEvmClient(chain), chain, hash as Hex);
  },

  getTokenSecurity(chain, address) {
    return getEvmTokenSecurity(chain, address);
  },

  async lookupTransaction(chain, hash): Promise<TxLookup | null> {
    const client = getEvmClient(chain);
    const tx = await client.getTransaction({ hash: hash as Hex }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TransactionNotFoundError") return null;
      throw error;
    });
    if (!tx) return null;
    let status: TxLookup["status"] = "pending";
    if (tx.blockNumber !== null) {
      const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
      status = receipt.status === "success" ? "success" : "reverted";
    }
    return {
      chain: chain.key,
      hash: tx.hash,
      status,
      blockNumber: tx.blockNumber?.toString() ?? null,
      from: getAddress(tx.from),
      to: tx.to ? getAddress(tx.to) : null,
    };
  },
};
