import type { ChainId } from "@/lib/chains/caip";

/**
 * Supported chains (browser-safe data only; RPC keys live on the server).
 * Adding an EVM chain = one entry here (+ its RPC settings on the server).
 * A chain is shown as supported only when `status` is "live".
 */
export type ChainFamily = "evm";
export type ChainKey = "ethereum" | "bsc" | "base" | "arbitrum" | "polygon";

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

/**
 * Base, Arbitrum and Polygon (M7): every tool. Token Security was switched on after its exchanges, trade test and
 * lockers were checked live on each chain (tests/unit/chains-live.test.ts, liquidity-live, security-live).
 */
const l2Capabilities: ChainCapabilities = {
  ...none,
  lookup: true,
  nativeBalance: true,
  tokenBalances: true,
  tokenSecurity: true,
  approvals: true,
  activity: true,
  fees: true,
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
      activity: true,
      fees: true,
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
      activity: true,
      fees: true,
    },
    status: "live",
  },
  {
    key: "base",
    caip2: "eip155:8453",
    family: "evm",
    name: "Base",
    evmChainId: 8453,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    explorer: { name: "BaseScan", url: "https://basescan.org" },
    publicRpcUrls: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
    alchemyNetwork: "base-mainnet",
    commonTokens: [
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // USDT
      "0x4200000000000000000000000000000000000006", // WETH
      "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
      "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USDbC
      "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
      "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
      "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", // wstETH
      "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
      "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", // DEGEN
    ],
    capabilities: { ...l2Capabilities },
    status: "live",
  },
  {
    key: "arbitrum",
    caip2: "eip155:42161",
    family: "evm",
    name: "Arbitrum",
    evmChainId: 42161,
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    explorer: { name: "Arbiscan", url: "https://arbiscan.io" },
    // Arbitrum's own node first: the PublicNode one refuses event searches over a few hours of blocks.
    publicRpcUrls: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
    alchemyNetwork: "arb-mainnet",
    commonTokens: [
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT (USD₮0)
      "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e (bridged)
      "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", // DAI
      "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
      "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
      "0x5979D7b546E38E414F7E9822514be443A4800529", // wstETH
      "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", // LINK
      "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", // GMX
    ],
    capabilities: { ...l2Capabilities },
    status: "live",
  },
  {
    key: "polygon",
    caip2: "eip155:137",
    family: "evm",
    name: "Polygon",
    evmChainId: 137,
    nativeSymbol: "POL",
    nativeDecimals: 18,
    explorer: { name: "PolygonScan", url: "https://polygonscan.com" },
    publicRpcUrls: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
    alchemyNetwork: "polygon-mainnet",
    commonTokens: [
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT (USDT0)
      "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WPOL
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (bridged)
      "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
      "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
      "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", // WBTC
      "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", // LINK
      "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", // AAVE
      "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", // UNI
    ],
    capabilities: { ...l2Capabilities },
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

/** A live EVM chain by its numeric chain id (e.g. from a signed message). */
export function getChainByEvmId(id: number): ChainConfig | undefined {
  return liveChains.find((chain) => chain.family === "evm" && chain.evmChainId === id);
}
