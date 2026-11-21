/**
 * Well-known tokens offered in the Batch Balance Scanner's picker. One entry can live on several chains with a
 * different contract and different decimals (USDT has 6 on Ethereum and 18 on BNB Chain).
 * Every address and decimals value is checked on-chain by tests/unit/batch-live.test.ts.
 * Visitors can also paste any token contract; this list only saves typing.
 */
export interface BatchAssetDeployment {
  address: string;
  decimals: number;
}

export interface BatchAssetDef {
  key: string;
  symbol: string;
  name: string;
  chains: Partial<Record<string, BatchAssetDeployment>>;
}

export const batchAssets: readonly BatchAssetDef[] = [
  {
    key: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    chains: {
      ethereum: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      bsc: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
      base: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
      arbitrum: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      polygon: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    },
  },
  {
    key: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    chains: {
      ethereum: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      bsc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      arbitrum: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      polygon: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    },
  },
  {
    key: "dai",
    symbol: "DAI",
    name: "Dai Stablecoin",
    chains: {
      ethereum: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      bsc: { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
      base: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
      arbitrum: { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
      polygon: { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
    },
  },
  {
    key: "fdusd",
    symbol: "FDUSD",
    name: "First Digital USD",
    chains: { bsc: { address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", decimals: 18 } },
  },
  {
    key: "busd",
    symbol: "BUSD",
    name: "Binance-Peg BUSD",
    chains: { bsc: { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 } },
  },
  {
    key: "weth",
    symbol: "WETH",
    name: "Wrapped Ether",
    chains: {
      ethereum: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
      base: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
      arbitrum: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
      polygon: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    },
  },
  {
    key: "wbnb",
    symbol: "WBNB",
    name: "Wrapped BNB",
    chains: { bsc: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 } },
  },
  {
    key: "wbtc",
    symbol: "WBTC",
    name: "Wrapped BTC",
    chains: {
      ethereum: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      arbitrum: { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
      polygon: { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
    },
  },
  {
    key: "cbbtc",
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    chains: { base: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 } },
  },
  {
    key: "wpol",
    symbol: "WPOL",
    name: "Wrapped POL",
    chains: { polygon: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 } },
  },
  {
    key: "arb",
    symbol: "ARB",
    name: "Arbitrum",
    chains: { arbitrum: { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 } },
  },
  {
    key: "btcb",
    symbol: "BTCB",
    name: "Binance-Peg BTCB",
    chains: { bsc: { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 } },
  },
  {
    key: "cake",
    symbol: "CAKE",
    name: "PancakeSwap Token",
    chains: { bsc: { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 } },
  },
  {
    key: "link",
    symbol: "LINK",
    name: "Chainlink",
    chains: {
      ethereum: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
      arbitrum: { address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18 },
      polygon: { address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18 },
    },
  },
  {
    key: "uni",
    symbol: "UNI",
    name: "Uniswap",
    chains: {
      ethereum: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
      polygon: { address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18 },
    },
  },
  {
    key: "shib",
    symbol: "SHIB",
    name: "Shiba Inu",
    chains: { ethereum: { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 } },
  },
  {
    key: "pepe",
    symbol: "PEPE",
    name: "Pepe",
    chains: { ethereum: { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 } },
  },
];
