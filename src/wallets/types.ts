/** Wallet state shared with the whole app. Family-neutral so Tron/Solana wallets can join later. */
export interface WalletState {
  status: "disconnected" | "connecting" | "reconnecting" | "connected";
  family?: "evm";
  address?: string;
  /** EVM chain id of the wallet's current network. */
  chainId?: number;
  walletName?: string;
}

export interface WalletStrings {
  connect: string;
  connecting: string;
  title: string;
  intro: string;
  detected: string;
  noneDetected: string;
  walletConnect: string;
  walletConnectUnavailable: string;
  scanQr: string;
  /** Contains "{wallet}". */
  openIn: string;
  copyLink: string;
  back: string;
  connectedAs: string;
  network: string;
  unsupportedNetwork: string;
  viewMyAddress: string;
  disconnect: string;
  close: string;
  rejected: string;
  failed: string;
  chains: Record<number, string>;
}

/** Remembered only so a returning user is reconnected silently; holds no keys or addresses. */
export const WALLET_FLAG_KEY = "crypy.wallet.used";
