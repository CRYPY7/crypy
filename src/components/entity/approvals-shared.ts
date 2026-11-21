export type ApprovalsStrings = Record<string, string>;

export interface ApprovalsChainInfo {
  key: string;
  id: number;
  name: string;
  coin: string;
}

/** "{count} things" → "3 things". Plain placeholders only (plurals are picked by key). */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
