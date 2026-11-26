/**
 * Portfolio safety results remembered in this browser (owner decision 2026-11-26, B-034): a wallet's approval and
 * flagged-token checks run by themselves the first time, then their result is reused for SAFETY_TTL_MS, so opening
 * the Portfolio again costs no GoPlus calls. "Check again" re-runs one wallet. Only complete results are kept, so a
 * check that didn't finish is tried again on the next visit. Stored apart from the portfolio list (never synced to
 * an account); read defensively, since anything in localStorage can be stale or edited.
 */
export const SAFETY_KEY = "crypy.portfolio.safety";
export const SAFETY_TTL_MS = 6 * 3_600_000;
const MAX_ENTRIES = 40;

export interface SafetyFlag {
  chain: string;
  address: string;
  symbol: string;
  reason: "honeypot" | "sell-tax";
  sellTax: number | null;
}

export interface SafetyReport {
  approvals: { attention: number; chains: string[]; partial: boolean } | null;
  flagged: { tokens: SafetyFlag[]; checked: number; skipped: number } | null;
}

export interface SafetyEntry {
  at: number;
  report: SafetyReport;
}

export type SafetyCache = Record<string, SafetyEntry>;

/** Every check ran and every token was asked about: the only results worth remembering. */
export const isComplete = (r: SafetyReport) =>
  r.approvals !== null && !r.approvals.partial && r.flagged !== null && r.flagged.skipped === 0;

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e6;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function readFlag(v: unknown): SafetyFlag | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  if (!isText(f.chain, 32) || !isText(f.symbol, 64) || !isText(f.address, 42) || !/^0x[0-9a-fA-F]{40}$/.test(f.address))
    return null;
  if (f.reason !== "honeypot" && f.reason !== "sell-tax") return null;
  const sellTax = typeof f.sellTax === "number" && f.sellTax >= 0 && f.sellTax <= 1 ? f.sellTax : null;
  return { chain: f.chain, address: f.address, symbol: f.symbol, reason: f.reason, sellTax };
}

function readReport(v: unknown): SafetyReport | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const a = r.approvals as Record<string, unknown> | null | undefined;
  const f = r.flagged as Record<string, unknown> | null | undefined;
  if (!a || !f) return null;
  if (!isCount(a.attention) || typeof a.partial !== "boolean" || !Array.isArray(a.chains)) return null;
  if (!a.chains.every((c) => isText(c, 32))) return null;
  if (!isCount(f.checked) || !isCount(f.skipped) || !Array.isArray(f.tokens) || f.tokens.length > 50) return null;
  const tokens = f.tokens.map(readFlag);
  if (tokens.some((t) => t === null)) return null;
  return {
    approvals: { attention: a.attention, chains: a.chains as string[], partial: a.partial },
    flagged: { tokens: tokens as SafetyFlag[], checked: f.checked, skipped: f.skipped },
  };
}

/** Reads the saved results; anything malformed is dropped. */
export function parseSafetyCache(raw: string | null): SafetyCache {
  if (!raw) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!json || typeof json !== "object" || (json as { v?: unknown }).v !== 1) return {};
  const entries = (json as { entries?: unknown }).entries;
  if (!entries || typeof entries !== "object") return {};
  const cache: SafetyCache = {};
  for (const [address, value] of Object.entries(entries as Record<string, unknown>)) {
    if (!/^0x[0-9a-f]{40}$/.test(address) || !value || typeof value !== "object") continue;
    const at = (value as { at?: unknown }).at;
    const report = readReport((value as { report?: unknown }).report);
    if (typeof at === "number" && Number.isFinite(at) && report && isComplete(report)) cache[address] = { at, report };
  }
  return cache;
}

/** A remembered result young enough to show instead of checking again. */
export function freshEntry(cache: SafetyCache, address: string, now: number): SafetyEntry | null {
  const entry = cache[address.toLowerCase()];
  if (!entry) return null;
  const age = now - entry.at;
  return age >= 0 && age < SAFETY_TTL_MS ? entry : null;
}

/** Keeps a complete result (others are not remembered), drops expired ones, keeps the newest MAX_ENTRIES. */
export function rememberSafety(cache: SafetyCache, address: string, report: SafetyReport, now: number): SafetyCache {
  const next: SafetyCache = {};
  for (const [a, e] of Object.entries(cache)) if (now - e.at < SAFETY_TTL_MS) next[a] = e;
  if (isComplete(report)) next[address.toLowerCase()] = { at: now, report };
  else delete next[address.toLowerCase()];
  const newest = Object.entries(next)
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(newest);
}

export function forgetSafety(cache: SafetyCache, address: string): SafetyCache {
  const next = { ...cache };
  delete next[address.toLowerCase()];
  return next;
}

export const serializeSafetyCache = (cache: SafetyCache) => JSON.stringify({ v: 1, entries: cache });
