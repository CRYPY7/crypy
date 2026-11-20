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
    },
  },
  {
    key: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    chains: {
      ethereum: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      bsc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    },
  },
  {
    key: "dai",
    symbol: "DAI",
    name: "Dai Stablecoin",
    chains: {
      ethereum: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
      bsc: { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
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
    chains: { ethereum: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 } },
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
    chains: { ethereum: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 } },
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
    chains: { ethereum: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 } },
  },
  {
    key: "uni",
    symbol: "UNI",
    name: "Uniswap",
    chains: { ethereum: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 } },
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
