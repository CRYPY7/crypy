import { checkWalletInput, cleanLabel } from "./input";

/**
 * The Portfolio is kept in this browser only (no account): the wallets' public addresses, the visitor's own labels,
 * and the last total seen (for "since you last looked"). Read defensively: anything malformed is dropped.
 */
export const PORTFOLIO_KEY = "crypy.portfolio";
export const MAX_WALLETS = 20;
/** The "since you last looked" reference is kept for at least this long, so a refresh doesn't reset it. */
export const SNAPSHOT_MIN_AGE_MS = 60 * 60 * 1000;

export interface SavedWallet {
  address: string;
  label: string;
  addedAt: number;
}

export interface Snapshot {
  totalUsd: number;
  at: number;
}

export interface PortfolioData {
  wallets: SavedWallet[];
  snapshot: Snapshot | null;
}

export const emptyPortfolio: PortfolioData = { wallets: [], snapshot: null };

export function parsePortfolio(text: string | null): PortfolioData {
  if (!text) return emptyPortfolio;
  try {
    const raw = JSON.parse(text) as { v?: unknown; wallets?: unknown; snapshot?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.wallets)) return emptyPortfolio;
    const seen = new Set<string>();
    const wallets: SavedWallet[] = [];
    for (const w of raw.wallets as Record<string, unknown>[]) {
      if (!w || typeof w.address !== "string") continue;
      const checked = checkWalletInput(w.address);
      if (checked.kind !== "ok" || seen.has(checked.address)) continue;
      seen.add(checked.address);
      wallets.push({
        address: checked.address,
        label: typeof w.label === "string" ? cleanLabel(w.label) : "",
        addedAt: typeof w.addedAt === "number" && Number.isFinite(w.addedAt) ? w.addedAt : 0,
      });
      if (wallets.length >= MAX_WALLETS) break;
    }
    const s = raw.snapshot as Record<string, unknown> | null | undefined;
    const snapshot =
      s && typeof s.totalUsd === "number" && Number.isFinite(s.totalUsd) && typeof s.at === "number"
        ? { totalUsd: s.totalUsd, at: s.at }
        : null;
    return { wallets, snapshot };
  } catch {
    return emptyPortfolio;
  }
}

export function serializePortfolio(data: PortfolioData): string {
  return JSON.stringify({ v: 1, wallets: data.wallets, snapshot: data.snapshot });
}

/**
 * The reference to compare against, and the one to keep: the old snapshot stays until it is an hour old, so
 * refreshing the page doesn't turn "since you last looked" into "since a second ago".
 */
export function nextSnapshot(
  previous: Snapshot | null,
  totalUsd: number,
  now: number,
): { compareTo: Snapshot | null; keep: Snapshot } {
  if (!previous) return { compareTo: null, keep: { totalUsd, at: now } };
  if (now - previous.at < SNAPSHOT_MIN_AGE_MS) return { compareTo: previous, keep: previous };
  return { compareTo: previous, keep: { totalUsd, at: now } };
}
