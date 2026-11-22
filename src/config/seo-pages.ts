/**
 * Indexable data pages (SEO_ROADMAP.md, Phase 3; design boards 46–50).
 * Chain addresses use readable names in links (/gas/bnb-chain), mapped to the chain keys used everywhere else.
 */
export const chainSlugs: Record<string, string> = {
  ethereum: "ethereum",
  bsc: "bnb-chain",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon",
};

export function chainKeyFromSlug(slug: string): string | undefined {
  return Object.keys(chainSlugs).find((key) => chainSlugs[key] === slug);
}

export interface CuratedToken {
  /** Lower-case, unique per chain; the last part of /tokens/<chain>/<slug>. */
  slug: string;
  symbol: string;
  address: string;
}

/**
 * Tokens with a daily security check page: each chain's well-known tokens (the same contracts as its `commonTokens`,
 * which tests/unit/chains-live.test.ts checks on-chain). Chosen by CRYPY for liquidity and use; nobody can pay to be
 * listed or to change a result.
 */
export const curatedTokens: Record<string, readonly CuratedToken[]> = {
  ethereum: [
    { slug: "usdt", symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    { slug: "usdc", symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { slug: "weth", symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    { slug: "dai", symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
    { slug: "wbtc", symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
    { slug: "steth", symbol: "stETH", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" },
    { slug: "link", symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" },
    { slug: "uni", symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
    { slug: "shib", symbol: "SHIB", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE" },
    { slug: "pepe", symbol: "PEPE", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" },
  ],
  bsc: [
    { slug: "usdt", symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
    { slug: "usdc", symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
    { slug: "wbnb", symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
    { slug: "fdusd", symbol: "FDUSD", address: "0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409" },
    { slug: "busd", symbol: "BUSD", address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56" },
    { slug: "eth", symbol: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" },
    { slug: "btcb", symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
    { slug: "cake", symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" },
    { slug: "dai", symbol: "DAI", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3" },
    { slug: "xrp", symbol: "XRP", address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE" },
  ],
  base: [
    { slug: "usdc", symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { slug: "usdt", symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" },
    { slug: "weth", symbol: "WETH", address: "0x4200000000000000000000000000000000000006" },
    { slug: "dai", symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" },
    { slug: "usdbc", symbol: "USDbC", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" },
    { slug: "cbbtc", symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
    { slug: "cbeth", symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" },
    { slug: "wsteth", symbol: "wstETH", address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" },
    { slug: "aero", symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
    { slug: "degen", symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" },
  ],
  arbitrum: [
    { slug: "usdc", symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    { slug: "usdt", symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
    { slug: "weth", symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
    { slug: "usdc-e", symbol: "USDC.e", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" },
    { slug: "dai", symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
    { slug: "wbtc", symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" },
    { slug: "arb", symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548" },
    { slug: "wsteth", symbol: "wstETH", address: "0x5979D7b546E38E414F7E9822514be443A4800529" },
    { slug: "link", symbol: "LINK", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4" },
    { slug: "gmx", symbol: "GMX", address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" },
  ],
  polygon: [
    { slug: "usdc", symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    { slug: "usdt", symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
    { slug: "wpol", symbol: "WPOL", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" },
    { slug: "usdc-e", symbol: "USDC.e", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" },
    { slug: "weth", symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
    { slug: "dai", symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
    { slug: "wbtc", symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
    { slug: "link", symbol: "LINK", address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39" },
    { slug: "aave", symbol: "AAVE", address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B" },
    { slug: "uni", symbol: "UNI", address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f" },
  ],
};

export function findCuratedToken(chainKey: string, slug: string): CuratedToken | undefined {
  return curatedTokens[chainKey]?.find((token) => token.slug === slug);
}

/** Every curated token with its chain, in list order. */
export function allCuratedTokens(): (CuratedToken & { chain: string })[] {
  return Object.entries(curatedTokens).flatMap(([chain, list]) => list.map((token) => ({ ...token, chain })));
}
