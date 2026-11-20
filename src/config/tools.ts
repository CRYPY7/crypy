/**
 * Tool registry. Navigation, the All tools menu, the home page grid and the
 * per-tool landing pages are all generated from this list.
 *
 * Adding a tool = one entry here + its texts in `messages/en.json` under `tools.<id>`.
 * `status` must stay "soon" until the tool works with real data and has been verified.
 */
export const toolCategories = ["security", "wallet", "network", "monitoring", "utilities"] as const;
export type ToolCategory = (typeof toolCategories)[number];

export const toolIds = [
  "token-security",
  "approval-checker",
  "balance-scanner",
  "address-analyzer",
  "portfolio",
  "tx-checker",
  "gas-tracker",
  "watchlist",
  "unit-converter",
  "hex-converter",
  "address-formatter",
  "timestamp-block",
  "tx-decoder",
] as const;
export type ToolId = (typeof toolIds)[number];

export type ToolStatus = "live" | "beta" | "soon";

export type ToolIconName =
  | "shield-alert"
  | "key-round"
  | "wallet"
  | "activity"
  | "chart-pie"
  | "receipt"
  | "fuel"
  | "bell"
  | "calculator"
  | "binary"
  | "at-sign"
  | "clock"
  | "code-xml";

export interface ToolDefinition {
  id: ToolId;
  category: ToolCategory;
  icon: ToolIconName;
  status: ToolStatus;
  /** Roadmap milestone in which the tool becomes available. */
  milestone: `M${number}`;
  /** Shown as a question tile on the home page. */
  featured?: boolean;
  requiresAccount?: boolean;
}

export const tools: readonly ToolDefinition[] = [
  { id: "token-security", category: "security", icon: "shield-alert", status: "soon", milestone: "M5", featured: true },
  { id: "approval-checker", category: "security", icon: "key-round", status: "soon", milestone: "M6", featured: true },
  { id: "balance-scanner", category: "wallet", icon: "wallet", status: "live", milestone: "M3", featured: true },
  { id: "address-analyzer", category: "wallet", icon: "activity", status: "soon", milestone: "M7" },
  { id: "portfolio", category: "wallet", icon: "chart-pie", status: "soon", milestone: "M8" },
  { id: "tx-checker", category: "network", icon: "receipt", status: "soon", milestone: "M4", featured: true },
  { id: "gas-tracker", category: "network", icon: "fuel", status: "soon", milestone: "M7" },
  { id: "watchlist", category: "monitoring", icon: "bell", status: "soon", milestone: "M8", requiresAccount: true },
  { id: "unit-converter", category: "utilities", icon: "calculator", status: "live", milestone: "M2.5" },
  { id: "hex-converter", category: "utilities", icon: "binary", status: "live", milestone: "M2.5" },
  { id: "address-formatter", category: "utilities", icon: "at-sign", status: "live", milestone: "M2.5" },
  { id: "timestamp-block", category: "utilities", icon: "clock", status: "soon", milestone: "M7" },
  { id: "tx-decoder", category: "utilities", icon: "code-xml", status: "live", milestone: "M2.5" },
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.id === id);
}

export const featuredTools = tools.filter((tool) => tool.featured);
