/**
 * What the Transaction Checker does on each network. Only tested features are "supported"; nothing is advertised
 * before its adapter is built and verified. New chains are added here when they ship.
 */
export type SupportLevel = "supported" | "partial" | "planned";

export const txFeatures = [
  "lookup",
  "status",
  "assets",
  "decoding",
  "failure",
  "fees",
  "pricesAtTx",
  "actions",
  "permissions",
  "pools",
  "routerReports",
  "smartWallets",
  "coinsInside",
] as const;
export type TxFeature = (typeof txFeatures)[number];

/** Same reader on every EVM chain; differences are in the data each chain's free nodes keep. */
const evmDefault: Record<TxFeature, SupportLevel> = {
  lookup: "supported",
  status: "supported",
  assets: "supported",
  decoding: "partial",
  failure: "partial",
  fees: "supported",
  pricesAtTx: "partial",
  actions: "supported",
  permissions: "supported",
  pools: "partial",
  routerReports: "partial",
  smartWallets: "partial",
  coinsInside: "partial",
};

export const txSupport: Record<string, Record<TxFeature, SupportLevel>> = {
  // Base: the fee includes the Ethereum data fee from the receipt. Arbitrum: its gas already includes that part.
  base: evmDefault,
  arbitrum: evmDefault,
  polygon: evmDefault,
  ethereum: {
    lookup: "supported",
    status: "supported",
    assets: "supported",
    decoding: "partial",
    failure: "partial",
    fees: "supported",
    pricesAtTx: "partial",
    actions: "supported",
    permissions: "supported",
    pools: "partial",
    routerReports: "partial",
    smartWallets: "partial",
    coinsInside: "partial",
  },
  bsc: {
    lookup: "supported",
    status: "supported",
    assets: "supported",
    decoding: "partial",
    failure: "partial",
    fees: "supported",
    pricesAtTx: "partial",
    actions: "supported",
    permissions: "supported",
    pools: "partial",
    routerReports: "partial",
    smartWallets: "partial",
    coinsInside: "partial",
  },
};

/** Why a feature is only partial (message key under utilities.tx-checker.notes). */
export const partialNotes: Partial<Record<TxFeature, string>> = {
  decoding: "decoding",
  failure: "failure",
  pricesAtTx: "pricesAtTx",
  pools: "pools",
  routerReports: "routerReports",
  smartWallets: "smartWallets",
  coinsInside: "coinsInside",
};
