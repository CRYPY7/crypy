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

/** One approval to revoke. `owner` is the wallet that gave it; only that wallet can revoke it. */
export interface RevokeRequest {
  chainId: number;
  owner: string;
  kind: "token" | "nft-all" | "permit2";
  /** Token or NFT collection contract. */
  token: string;
  spender: string;
}

export type RevokeStep = "checking" | "switching" | "testing" | "confirm" | "pending" | "verifying";

export type RevokeOutcome =
  | { status: "revoked"; hash: string; block: string; feePaid: string | null; cleared: boolean }
  | { status: "wrong-account"; connected: string | null }
  | { status: "wrong-network" }
  | { status: "rejected" }
  | { status: "test-failed" }
  | { status: "failed"; hash?: string };

/** A preview of the exact transaction, shown before the wallet opens. */
export interface RevokePreview {
  to: string;
  /** e.g. "approve(0x9f3c…, 0)". */
  call: string;
  /** Estimated network fee in the chain's coin (decimal string), when the wallet's node answered. */
  fee: string | null;
  /** The exact transaction was tested first (eth_call) and succeeded. */
  tested: boolean;
}

/** Wallet actions, available once the wallet runtime has loaded. Only these may ask the wallet for anything. */
export interface WalletActions {
  previewRevoke(request: RevokeRequest): Promise<RevokePreview>;
  revoke(request: RevokeRequest, onStep: (step: RevokeStep) => void): Promise<RevokeOutcome>;
}
