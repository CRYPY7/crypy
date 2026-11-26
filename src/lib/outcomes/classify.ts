/**
 * What a visitor got from each tool (stabilization S0): a full result, a partial one (something missing, and the
 * page says so), or an error. Pure and unit-tested; reasons are short codes with chain names only, never an address,
 * a hash or anything the visitor typed.
 */
export type Outcome = "full" | "partial" | "error";

export interface Classified {
  outcome: Outcome;
  reasons: string[];
}

export type OutcomeTool =
  | "search"
  | "balances"
  | "approvals"
  | "activity"
  | "token-security"
  | "transaction"
  | "gas"
  | "batch-balance"
  | "portfolio"
  | "portfolio-safety"
  | "timestamp-block"
  | "token-info"
  | "account"
  | "pages";

/** Tool ids in the order the admin dashboard lists them. */
export const OUTCOME_TOOLS: readonly OutcomeTool[] = [
  "search",
  "balances",
  "approvals",
  "activity",
  "token-security",
  "transaction",
  "gas",
  "batch-balance",
  "portfolio",
  "portfolio-safety",
  "timestamp-block",
  "token-info",
  "account",
  "pages",
];

const full = (): Classified => ({ outcome: "full", reasons: [] });
const partialOrFull = (reasons: string[]): Classified =>
  reasons.length ? { outcome: "partial", reasons } : { outcome: "full", reasons: [] };

/** Removes anything that could identify what a visitor looked up: addresses, hashes, long numbers, URLs. */
export function cleanReason(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/0x[0-9a-fA-F]{6,}/g, "0x…")
    .replace(/\b\d{7,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function errorOutcome(error: unknown): Classified {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  return { outcome: "error", reasons: [cleanReason(message)] };
}

export function classifyOverview(o: {
  chains: { chain: string; coverage: string }[];
  unavailable: readonly string[];
  pricesAvailable: boolean;
}): Classified {
  if (o.chains.length === 0 && o.unavailable.length > 0)
    return { outcome: "error", reasons: ["all chains unavailable"] };
  const reasons = [
    ...o.unavailable.map((c) => `chain unavailable: ${c}`),
    ...o.chains.filter((c) => c.coverage !== "full").map((c) => `token list ${c.coverage}: ${c.chain}`),
    ...(o.pricesAvailable ? [] : ["prices unavailable"]),
  ];
  return partialOrFull(reasons);
}

export function classifyApprovals(r: {
  chains: { chain: string; sources: { goplus: string; recentLogs: boolean; knownSpenders?: boolean } }[];
  unavailable: readonly string[];
}): Classified {
  if (r.chains.length === 0 && r.unavailable.length > 0)
    return { outcome: "error", reasons: ["all chains unavailable"] };
  const reasons = [
    ...r.unavailable.map((c) => `chain unavailable: ${c}`),
    ...r.chains.filter((c) => c.sources.goplus !== "ok").map((c) => `goplus ${c.sources.goplus}: ${c.chain}`),
    // Recent events are searched per held token: with none held there is nothing to search (the page says nothing).
    ...r.chains
      .filter((c) => c.sources.knownSpenders !== false && !c.sources.recentLogs)
      .map((c) => `recent events not searched: ${c.chain}`),
  ];
  return partialOrFull(reasons);
}

export function classifyActivity(page: { chains: { chain: string; source: string }[] }): Classified {
  if (page.chains.length > 0 && page.chains.every((c) => c.source === "unavailable"))
    return { outcome: "error", reasons: ["all chains unavailable"] };
  return partialOrFull(page.chains.filter((c) => c.source !== "history").map((c) => `history ${c.source}: ${c.chain}`));
}

export function classifyTokenSecurity(
  report: { facts: { externalStatus: string; trade?: { outcome?: string } | null } } | null,
): Classified {
  // No report = the address isn't a token on that chain (the page says so). Failures throw and are counted as errors.
  if (!report) return { outcome: "full", reasons: [] };
  const reasons: string[] = [];
  if (report.facts.externalStatus === "unavailable") reasons.push("goplus unavailable");
  return partialOrFull(reasons);
}

export function classifyGas(g: { chains: unknown[]; unavailable: readonly string[] }): Classified {
  if (g.chains.length === 0) return { outcome: "error", reasons: ["all chains unavailable"] };
  return partialOrFull(g.unavailable.map((c) => `chain unavailable: ${c}`));
}

export function classifySearch(r: { status: string; unavailable?: readonly string[] }): Classified {
  if (r.status === "unavailable") return { outcome: "error", reasons: ["all chains unavailable"] };
  return partialOrFull((r.unavailable ?? []).map((c) => `chain unavailable: ${c}`));
}

/** A transaction that isn't found is an answer, not a failure (the page explains it). */
export function classifyTransaction(): Classified {
  return full();
}

/** For tools whose answer has no partial state: it either came back or it threw. */
export function classifyDone(): Classified {
  return full();
}

/** Which tool a route belongs to, from Next.js's route pattern (for server errors reported by Next.js). */
export function toolForRoute(routePath: string): OutcomeTool | null {
  const p = routePath.replace(/^\/\[locale\]/, "");
  const rules: [RegExp, OutcomeTool][] = [
    [/^\/address\/\[address\]\/approvals/, "approvals"],
    [/^\/address\/\[address\]\/activity/, "activity"],
    [/^\/address\/\[address\]/, "balances"],
    [/^\/token\//, "token-security"],
    [/^\/tx\//, "transaction"],
    [/^\/search/, "search"],
    [/^\/api\/v1\/address\/\[address\]\/approvals/, "approvals"],
    [/^\/api\/v1\/address\/\[address\]\/activity/, "activity"],
    [/^\/api\/v1\/address\/\[address\]\/portfolio/, "portfolio"],
    [/^\/api\/v1\/token\//, "token-security"],
    [/^\/api\/v1\/tx\//, "transaction"],
    [/^\/api\/v1\/gas/, "gas"],
    [/^\/api\/v1\/search/, "search"],
    [/^\/api\/v1\/batch-balances/, "batch-balance"],
    [/^\/api\/v1\/blocks/, "timestamp-block"],
    [/^\/api\/v1\/token-info/, "token-info"],
    [/^\/api\/v1\/(account|auth|watchlist|alerts|portfolio)/, "account"],
  ];
  return rules.find(([pattern]) => pattern.test(p))?.[1] ?? null;
}

/** Portfolio, part 1: one wallet's balances (B-034). */
export function classifyPortfolioBalances(r: { overview: Parameters<typeof classifyOverview>[0] }): Classified {
  return classifyOverview(r.overview);
}

/** Portfolio, part 2: the wallet's approvals and GoPlus-flagged tokens. */
export function classifyPortfolioSafety(r: {
  approvals: { partial: boolean } | null;
  flagged: { skipped: number } | null;
}): Classified {
  return partialOrFull([
    ...(r.approvals === null ? ["approvals not checked"] : r.approvals.partial ? ["approvals partial"] : []),
    ...(r.flagged === null ? ["token flags not checked"] : r.flagged.skipped > 0 ? ["token flags partly skipped"] : []),
  ]);
}
