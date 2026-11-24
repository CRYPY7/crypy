import "server-only";
import { type Hex, erc20Abi } from "viem";
import type { ChainConfig } from "@/config/chains";
import { clientFor, isCoolingDown, providersFor, rankProviders } from "../providers";
import { type TokenBasics, type TokenReader, firstValidToken } from "./token-basics";

/** How many other providers are asked before concluding that an address is not a token. */
const RECHECK_PROVIDERS = 3;
const RECHECK_MS = 4_000;

function readerFor(chain: ChainConfig, provider: Parameters<typeof clientFor>[1]): TokenReader {
  return async (token) => {
    const client = clientFor(chain, provider);
    const [code, meta] = await Promise.all([
      client.getCode({ address: token }),
      client.multicall({
        allowFailure: true,
        contracts: (["name", "symbol", "decimals", "totalSupply"] as const).map((functionName) => ({
          address: token,
          abi: erc20Abi,
          functionName,
        })),
      }),
    ]);
    return { code: (code ?? null) as Hex | null, meta };
  };
}

/**
 * B-010: one node answering a token's code or decimals badly used to make CRYPY say "not a token" (seen for USDT).
 * Before that conclusion, the same reads go to up to three providers at once; the first full answer wins.
 */
export function recheckToken(chain: ChainConfig, token: `0x${string}`): Promise<TokenBasics | null> {
  const providers = rankProviders(providersFor(chain).filter((provider) => !isCoolingDown(provider)));
  const readers = providers.slice(0, RECHECK_PROVIDERS).map((provider) => readerFor(chain, provider));
  return firstValidToken(readers, token, RECHECK_MS);
}
