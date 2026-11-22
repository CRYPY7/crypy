import type { ToolId } from "./tools";

/** "Related tools" at the bottom of each tool page (SEO_ROADMAP.md, Phase 2): the next useful step from each tool. */
export const relatedTools: Record<ToolId, readonly [ToolId, ToolId, ToolId]> = {
  "token-security": ["approval-checker", "tx-checker", "balance-scanner"],
  "approval-checker": ["token-security", "address-analyzer", "portfolio"],
  "balance-scanner": ["portfolio", "batch-balance", "address-analyzer"],
  "batch-balance": ["balance-scanner", "portfolio", "address-formatter"],
  "address-analyzer": ["balance-scanner", "approval-checker", "tx-checker"],
  portfolio: ["balance-scanner", "watchlist", "approval-checker"],
  "tx-checker": ["tx-decoder", "gas-tracker", "address-analyzer"],
  "gas-tracker": ["unit-converter", "tx-checker", "timestamp-block"],
  watchlist: ["portfolio", "approval-checker", "address-analyzer"],
  "unit-converter": ["gas-tracker", "hex-converter", "tx-decoder"],
  "hex-converter": ["unit-converter", "tx-decoder", "timestamp-block"],
  "address-formatter": ["batch-balance", "balance-scanner", "address-analyzer"],
  "timestamp-block": ["tx-checker", "gas-tracker", "hex-converter"],
  "tx-decoder": ["tx-checker", "hex-converter", "approval-checker"],
};
