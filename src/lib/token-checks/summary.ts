import type { SecurityReport, TradeOutcome } from "@/lib/security/types";

/** What the list of token checks shows for "Can be sold (test)". Pure, unit-tested. */
export type SellStatus = "yes" | "no" | "no-pool" | "unchecked";

const noPool: readonly TradeOutcome[] = ["no-pool", "no-liquidity"];
const notRun: readonly TradeOutcome[] = ["unsupported-pool", "quote-failed", "error"];

export function sellStatus(report: SecurityReport): SellStatus {
  const outcome = report.facts.trade.outcome;
  if (outcome === "ok") return "yes";
  if (noPool.includes(outcome)) return "no-pool";
  if (notRun.includes(outcome)) return "unchecked";
  return "no";
}

/** Measured taxes (fractions 0–1), only when the whole test trade ran. */
export function measuredTaxes(report: SecurityReport): { buy: number; sell: number; transfer: number } | null {
  const { outcome, buyTax, sellTax, transferTax } = report.facts.trade;
  if (outcome !== "ok" || buyTax === null || sellTax === null) return null;
  return { buy: buyTax, sell: sellTax, transfer: transferTax ?? 0 };
}

export function formatTax(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(value);
}

/** Tailwind classes for each headline level, the same tones as the token page. */
export const levelTone: Record<SecurityReport["level"], string> = {
  serious: "bg-critical/12 text-critical",
  risks: "bg-high/12 text-high",
  warnings: "bg-medium/12 text-medium",
  "none-found": "bg-low/12 text-low",
};
