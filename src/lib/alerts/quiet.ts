/**
 * Quiet hours (approved default 23:00–07:00 in the person's own time zone): alerts found then wait and are sent when
 * the quiet hours end. Pure, so the browser and the server agree.
 */
export interface QuietHours {
  on: boolean;
  /** Minutes after local midnight. start > end means the quiet hours cross midnight. */
  start: number;
  end: number;
  timeZone: string;
}
/** Minutes after midnight at `now` in `timeZone` (UTC when the zone is unknown). */
export function localMinutes(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  }
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

export function isQuietNow(quiet: QuietHours, now: Date): boolean {
  if (!quiet.on || quiet.start === quiet.end) return false;
  const m = localMinutes(now, quiet.timeZone);
  return quiet.start < quiet.end ? m >= quiet.start && m < quiet.end : m >= quiet.start || m < quiet.end;
}

/** "23:00" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "23:00" → 1380; null for anything else. */
export function parseMinutes(text: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
