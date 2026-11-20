/** Recently viewed entities, kept only in this browser (localStorage). Never sent anywhere. */
export type RecentItem = {
  path: string;
  kind: "address" | "token" | "tx";
  value: string;
  chain?: string;
  label?: string;
};

const KEY = "crypy.recent";
const MAX = 8;
export const recentEvent = "crypy:recent";

function isRecentItem(item: unknown): item is RecentItem {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.path === "string" &&
    /^\/(address|token|tx)\/[\w/]+(\?chain=[a-z0-9-]+)?$/.test(candidate.path) &&
    typeof candidate.value === "string" &&
    (candidate.kind === "address" || candidate.kind === "token" || candidate.kind === "tx") &&
    (candidate.chain === undefined || (typeof candidate.chain === "string" && /^[a-z0-9-]+$/.test(candidate.chain))) &&
    (candidate.label === undefined || typeof candidate.label === "string")
  );
}

export function readRecent(): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(item: RecentItem): void {
  try {
    const next = [item, ...readRecent().filter((existing) => existing.path !== item.path)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(recentEvent));
  } catch {
    // Storage blocked or full: the recent list is a convenience only.
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(recentEvent));
  } catch {
    // Ignore: nothing to clear.
  }
}
