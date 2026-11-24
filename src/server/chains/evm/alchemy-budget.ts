/**
 * Alchemy's free plan is a monthly allowance (30M compute units). CRYPY spreads what is left of the month over the
 * days left, so a quiet day leaves more for the next ones, but one busy day can never use up the month:
 *
 *   today's limit = (monthly plan × 90% − units spent earlier this month) ÷ days left in the month (today included),
 *   at least 0 and at most twice a normal day (monthly plan ÷ days in the month).
 *
 * The 10% margin is for use the server can't see: the same key on the owner's PC (tests, development). Pure and
 * unit-tested; the server keeps "units spent earlier this month" in the database (usage-store.ts).
 */
export const MONTH_MARGIN = 0.9;
export const MAX_DAY_FACTOR = 2;

export function daysInMonth(now: number): number {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Today's date (UTC) and the first day of this month, as YYYY-MM-DD. */
export function monthDays(now: number): { today: string; monthStart: string } {
  const today = new Date(now).toISOString().slice(0, 10);
  return { today, monthStart: `${today.slice(0, 8)}01` };
}

export interface DailyLimitInput {
  monthly: number;
  /** Units spent before today this month; null when not known (database not read yet): a normal day is used. */
  usedEarlierThisMonth: number | null;
  now: number;
}

export function alchemyDailyLimit({ monthly, usedEarlierThisMonth, now }: DailyLimitInput): number {
  const days = daysInMonth(now);
  const normalDay = Math.floor(monthly / days);
  if (usedEarlierThisMonth === null) return normalDay;
  const daysLeft = days - new Date(now).getUTCDate() + 1;
  const spread = Math.floor((monthly * MONTH_MARGIN - usedEarlierThisMonth) / daysLeft);
  return Math.max(0, Math.min(normalDay * MAX_DAY_FACTOR, spread));
}
