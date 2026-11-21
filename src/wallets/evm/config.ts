import { createConfig, createStorage, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { type ChainKey, chains } from "@/config/chains";
import { publicEnv } from "@/config/env";

const rpc = (key: ChainKey) => chains.find((chain) => chain.key === key)?.publicRpcUrls[0];

/**
 * Browser wallet configuration.
 * - EIP-6963 discovery lists every installed browser wallet (MetaMask, Trust Wallet extension, Rabby…).
 * - WalletConnect (mobile wallets) only when a project ID is configured.
 * - Read-only public RPCs; secrets never reach the browser.
 */
export function createWalletConfig() {
  const projectId = publicEnv.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  return createConfig({
    chains: [mainnet, bsc, base, arbitrum, polygon],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected({ shimDisconnect: true }),
      ...(projectId
        ? [
            walletConnect({
              projectId,
              showQrModal: false,
              metadata: {
                name: "CRYPY",
                description: "Wallet safety and research toolkit",
                url: publicEnv.NEXT_PUBLIC_SITE_URL,
                icons: [`${publicEnv.NEXT_PUBLIC_SITE_URL}/icon.svg`],
              },
            }),
          ]
        : []),
    ],
    transports: {
      [mainnet.id]: http(rpc("ethereum")),
      [bsc.id]: http(rpc("bsc")),
      [base.id]: http(rpc("base")),
      [arbitrum.id]: http(rpc("arbitrum")),
      [polygon.id]: http(rpc("polygon")),
    },
    storage: createStorage({ storage: typeof window === "undefined" ? undefined : window.localStorage, key: "crypy" }),
    // "ssr: true" makes wagmi restore sessions after rendering, avoiding render-time state updates.
    ssr: true,
  });
}
