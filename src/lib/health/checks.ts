import { liveChains } from "@/config/chains";
import type { ToolId } from "@/config/tools";

/**
 * Health checks (M9 Part 5). The server runs these small real checks on a schedule and saves each result; the public
 * status page and the admin dashboard only read what was saved, so opening them never calls a data provider.
 *
 * Shared by the server (which runs them) and the pages (which show them). No secrets, URLs or provider names here.
 */

export type CheckGroup = "website" | "chain" | "tool" | "alerts" | "data" | "server";

export interface CheckDefinition {
  id: string;
  group: CheckGroup;
  /** How often the check runs. */
  everyMs: number;
  /** A passing check that took longer than this is saved as "slow". */
  slowMs: number;
}

const MINUTE = 60_000;
/** The health round runs every 5 minutes; quick checks run every round. */
export const ROUND_MS = 5 * MINUTE;
/** Checks that use a data provider's allowance (a real tool run) run about every 30 minutes, at most 2 per round. */
export const TOOL_EVERY_MS = 30 * MINUTE;
export const TOOL_CHECKS_PER_ROUND = 2;

const quick = (id: string, group: CheckGroup, slowMs = 3_000): CheckDefinition => ({
  id,
  group,
  everyMs: ROUND_MS,
  slowMs,
});
const tool = (id: string, slowMs = 10_000): CheckDefinition => ({ id, group: "tool", everyMs: TOOL_EVERY_MS, slowMs });

export const checkDefinitions: readonly CheckDefinition[] = [
  quick("website", "website", 4_000),
  ...liveChains.map((chain) => quick(`chain:${chain.key}`, "chain")),
  tool("tool:search", 5_000),
  tool("tool:balances"),
  tool("tool:tx"),
  tool("tool:token-security"),
  tool("tool:approvals", 15_000),
  tool("tool:activity"),
  tool("tool:gas", 6_000),
  tool("tool:block-time", 8_000),
  quick("job:checker", "alerts"),
  quick("job:delivery", "alerts"),
  quick("bot", "alerts"),
  quick("job:token-checks", "data"),
  quick("database", "data", 1_000),
  quick("server:memory", "server"),
  quick("server:disk", "server"),
  { id: "server:certificate", group: "server", everyMs: 6 * 60 * MINUTE, slowMs: 3_000 },
];

export const checkIds = checkDefinitions.map((c) => c.id);

export function findCheck(id: string): CheckDefinition | undefined {
  return checkDefinitions.find((c) => c.id === id);
}

/**
 * What the public status page shows: things a visitor uses, never server internals. Each component's state comes
 * from the checks it depends on.
 */
export type ComponentGroup = "core" | "tools" | "chains" | "alerts";
export interface StatusComponent {
  id: string;
  group: ComponentGroup;
  /** Tool components use the tool's own name and link. */
  tool?: ToolId;
  chain?: string;
  /** All of these must work: the component is as bad as the worst of them. */
  checks: readonly string[];
  /** Alternatives (one per chain): down only when all are down, degraded when some are. */
  someOf?: readonly string[];
}

const chainChecks = liveChains.map((c) => `chain:${c.key}`);
const toolComponent = (id: ToolId, checks: readonly string[], someOf?: readonly string[]): StatusComponent => ({
  id: `tool:${id}`,
  group: "tools",
  tool: id,
  checks: ["website", ...checks],
  ...(someOf ? { someOf } : {}),
});

export const statusComponents: readonly StatusComponent[] = [
  { id: "website", group: "core", checks: ["website"] },
  { id: "search", group: "core", checks: ["website", "tool:search"] },
  toolComponent("token-security", ["tool:token-security"]),
  toolComponent("approval-checker", ["tool:approvals"]),
  toolComponent("balance-scanner", ["tool:balances"]),
  toolComponent("batch-balance", [], chainChecks),
  toolComponent("address-analyzer", ["tool:activity"]),
  toolComponent("portfolio", ["tool:balances", "database"]),
  toolComponent("tx-checker", ["tool:tx"]),
  toolComponent("gas-tracker", ["tool:gas"]),
  toolComponent("watchlist", ["database", "job:checker"]),
  toolComponent("timestamp-block", ["tool:block-time"]),
  // These run in the visitor's browser: they work whenever the website does.
  toolComponent("unit-converter", []),
  toolComponent("hex-converter", []),
  toolComponent("address-formatter", []),
  toolComponent("tx-decoder", []),
  ...liveChains.map((c) => ({
    id: `chain:${c.key}`,
    group: "chains" as const,
    chain: c.key,
    checks: [`chain:${c.key}`],
  })),
  { id: "alerts", group: "alerts", checks: ["database", "job:checker", "job:delivery", "bot"] },
  { id: "token-checks", group: "alerts", checks: ["database", "job:token-checks"] },
];

/** Dictionary key for a check's name under `admin.checks.label` (chains share one text with the chain's name). */
export function checkLabelKey(id: string): { key: string; chain?: string } {
  if (id.startsWith("chain:")) return { key: "chain", chain: id.slice(6) };
  return { key: id.replace(":", "_") };
}
