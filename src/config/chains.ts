import type { ChainId } from "@/lib/chains/caip";

/**
 * Supported chains (browser-safe data only; RPC keys live on the server).
 * Adding an EVM chain = one entry here (+ its RPC settings on the server).
 * A chain is shown as supported only when `status` is "live".
 */
export type ChainFamily = "evm";
export type ChainKey = "ethereum" | "bsc";

export interface ChainCapabilities {
  lookup: boolean;
  nativeBalance: boolean;
  tokenBalances: boolean;
  tokenSecurity: boolean;
  approvals: boolean;
  activity: boolean;
  fees: boolean;
}

export interface ChainConfig {
  key: ChainKey;
  caip2: ChainId;
  family: ChainFamily;
  name: string;
  /** EVM chain id, used by wallets. */
  evmChainId: number;
  nativeSymbol: string;
  nativeDecimals: number;
  explorer: { name: string; url: string };
  /** Free public RPC endpoints, used as fallbacks and by the browser wallet layer. */
  publicRpcUrls: string[];
  alchemyNetwork?: string;
  /**
   * Well-known tokens checked when the full token list isn't available (no Alchemy key or Alchemy down).
   * Checksummed; verified by a unit test.
   */
  commonTokens: readonly string[];
  capabilities: ChainCapabilities;
  status: "live" | "beta" | "planned";
}

const none: ChainCapabilities = {
  lookup: false,
  nativeBalance: false,
  tokenBalances: false,
  tokenSecurity: false,
  approvals: false,
  activity: false,
  fees: false,
};

export const chains: readonly ChainConfig[] = [
  {
    key: "ethereum",
    caip2: "eip155:1",
    family: "evm",
    name: "Ethereum",
    evmChainId: 1,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    explorer: { name: "Etherscan", url: "https://etherscan.io" },
    publicRpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    alchemyNetwork: "eth-mainnet",
    commonTokens: [
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", // stETH
      "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK
      "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI
      "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", // SHIB
      "0x6982508145454Ce325dDbE47a25d4ec3d2311933", // PEPE
    ],
    capabilities: {
      ...none,
      lookup: true,
      nativeBalance: true,
      tokenBalances: true,
      tokenSecurity: true,
      approvals: true,
    },
    status: "live",
  },
  {
    key: "bsc",
    caip2: "eip155:56",
    family: "evm",
    name: "BNB Chain",
    evmChainId: 56,
    nativeSymbol: "BNB",
    nativeDecimals: 18,
    explorer: { name: "BscScan", url: "https://bscscan.com" },
    publicRpcUrls: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
    alchemyNetwork: "bnb-mainnet",
    commonTokens: [
      "0x55d398326f99059fF775485246999027B3197955", // USDT (BSC-USD)
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
      "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", // FDUSD
      "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
      "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // ETH (Binance-Peg)
      "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB
      "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
      "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", // DAI (Binance-Peg)
      "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // XRP (Binance-Peg)
    ],
    capabilities: {
      ...none,
      lookup: true,
      nativeBalance: true,
      tokenBalances: true,
      tokenSecurity: true,
      approvals: true,
    },
    status: "live",
  },
];

export function getChain(key: string): ChainConfig | undefined {
  return chains.find((chain) => chain.key === key);
}

export function getChainByCaip(caip2: string): ChainConfig | undefined {
  return chains.find((chain) => chain.caip2 === caip2);
}

export const liveChains = chains.filter((chain) => chain.status === "live");
