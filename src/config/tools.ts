/**
 * Tool registry. Navigation, the All tools menu, the home page grid and the
 * per-tool landing pages are all generated from this list.
 *
 * Adding a tool = one entry here + its texts in `messages/en.json` under `tools.<id>`.
 * `status` must stay "soon" until the tool works with real data and has been verified.
 */
export const toolCategories = ["security", "wallet", "network", "monitoring", "calculators", "utilities"] as const;
export type ToolCategory = (typeof toolCategories)[number];

export const toolIds = [
  "token-security",
  "approval-checker",
  "balance-scanner",
  "batch-balance",
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
  "token-valuation",
  "apy-calculator",
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
  | "code-xml"
  | "layers"
  | "coins"
  | "percent";

export interface ToolDefinition {
  id: ToolId;
  category: ToolCategory;
  icon: ToolIconName;
  status: ToolStatus;
  /** Roadmap milestone in which the tool becomes available. */
  milestone: `M${number}` | `U${number}`;
  /** Shown as a question tile on the home page. */
  featured?: boolean;
  requiresAccount?: boolean;
  /** Shows a "New" badge in navigation for a while after launch. */
  isNew?: boolean;
}

export const tools: readonly ToolDefinition[] = [
  {
    id: "token-security",
    category: "security",
    icon: "shield-alert",
    status: "live",
    milestone: "M5",
    featured: true,
    isNew: true,
  },
  {
    id: "approval-checker",
    category: "security",
    icon: "key-round",
    status: "live",
    milestone: "M6",
    featured: true,
    isNew: true,
  },
  { id: "balance-scanner", category: "wallet", icon: "wallet", status: "live", milestone: "M3", featured: true },
  { id: "batch-balance", category: "wallet", icon: "layers", status: "live", milestone: "M4.5", isNew: true },
  {
    id: "address-analyzer",
    category: "wallet",
    icon: "activity",
    status: "live",
    milestone: "M7",
    featured: true,
    isNew: true,
  },
  { id: "portfolio", category: "wallet", icon: "chart-pie", status: "live", milestone: "M8", isNew: true },
  { id: "tx-checker", category: "network", icon: "receipt", status: "live", milestone: "M4", featured: true },
  {
    id: "gas-tracker",
    category: "network",
    icon: "fuel",
    status: "live",
    milestone: "M7",
    isNew: true,
  },
  { id: "watchlist", category: "monitoring", icon: "bell", status: "live", milestone: "M8", requiresAccount: true },
  { id: "unit-converter", category: "utilities", icon: "calculator", status: "live", milestone: "M2.5" },
  { id: "hex-converter", category: "utilities", icon: "binary", status: "live", milestone: "M2.5" },
  { id: "address-formatter", category: "utilities", icon: "at-sign", status: "live", milestone: "M2.5" },
  {
    id: "timestamp-block",
    category: "utilities",
    icon: "clock",
    status: "live",
    milestone: "M7",
    isNew: true,
  },
  { id: "tx-decoder", category: "utilities", icon: "code-xml", status: "live", milestone: "M2.5" },
  { id: "token-valuation", category: "calculators", icon: "coins", status: "live", milestone: "U1", isNew: true },
  { id: "apy-calculator", category: "calculators", icon: "percent", status: "live", milestone: "U1", isNew: true },
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.id === id);
}

export const featuredTools = tools.filter((tool) => tool.featured);
