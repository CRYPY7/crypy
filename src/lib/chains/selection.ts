/**
 * Which chains an address tool scans (owner request 2026-11-21, design boards 34–35).
 *   used: only chains where the address shows any use (default; cheap check of every chain first)
 *   all:  every chain the tool supports
 *   pick: the chains the visitor ticked
 * Kept in the link (?chains=used|all|bsc,ethereum) and remembered on the device (cookie), link first.
 */
export type ChainSelection = { mode: "used" } | { mode: "all" } | { mode: "pick"; chains: string[] };

export const CHAINS_PARAM = "chains";
export const CHAINS_COOKIE = "crypy_chains";

/** null when the value isn't a valid selection (then the next source or the default applies). */
export function parseSelection(value: string | null | undefined, known: readonly string[]): ChainSelection | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "used") return { mode: "used" };
  if (v === "all") return { mode: "all" };
  const parts = [...new Set(v.split(",").map((p) => p.trim()))].filter((p) => known.includes(p));
  if (parts.length === 0) return null;
  // Keep the order of `known`, so the same choice always gives the same link and cache key.
  return { mode: "pick", chains: known.filter((k) => parts.includes(k)) };
}

export function formatSelection(selection: ChainSelection): string {
  return selection.mode === "pick" ? selection.chains.join(",") : selection.mode;
}

export interface ChainScope {
  selection: ChainSelection;
  /** Chains this tool will scan, in a stable order. */
  scan: string[];
  /** Chains where the address is used but which weren't scanned (the visitor narrowed the choice). */
  usedNotScanned: string[];
  /** Chains with no sign of use that weren't scanned. */
  unusedNotScanned: string[];
  /** Every chain the tool supports, with whether the address is used there. */
  chains: { key: string; used: boolean }[];
}

/** `capable`: chains the tool supports (in display order); `used`: chains where the address shows any use. */
export function resolveScope(
  selection: ChainSelection,
  capable: readonly string[],
  used: ReadonlySet<string>,
): ChainScope {
  const scan =
    selection.mode === "all"
      ? [...capable]
      : selection.mode === "used"
        ? capable.filter((c) => used.has(c))
        : capable.filter((c) => selection.chains.includes(c));
  const rest = capable.filter((c) => !scan.includes(c));
  return {
    selection,
    scan,
    usedNotScanned: rest.filter((c) => used.has(c)),
    unusedNotScanned: rest.filter((c) => !used.has(c)),
    chains: capable.map((key) => ({ key, used: used.has(key) })),
  };
}
