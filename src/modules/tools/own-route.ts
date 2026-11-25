import type { ToolId } from "@/config/tools";

/** Working tools with their own route folder (app/[locale]/tools/<id>/), so each page loads only its own code. */
export const ownRouteTools: readonly ToolId[] = [
  "balance-scanner",
  "batch-balance",
  "token-security",
  "approval-checker",
  "address-analyzer",
  "gas-tracker",
  "portfolio",
  "watchlist",
  "timestamp-block",
  "tx-checker",
  "unit-converter",
  "hex-converter",
  "address-formatter",
  "tx-decoder",
  "token-valuation",
  "apy-calculator",
];
