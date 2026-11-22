/**
 * Alert records and how they look in Telegram (approved board 40, step 4). Pure: tested without Telegram.
 *
 * Every message links only to CRYPY's own pages and never asks to connect a wallet or sign anything, so a fake
 * "CRYPY" bot asking for either is easy to spot (said on the page too).
 */
export type AlertKind = "sent" | "received" | "moved" | "approval" | "value-drop" | "security" | "liquidity";
export type AlertSeverity = "info" | "good" | "warn" | "danger";

export interface AlertDetails {
  /** One line under the title (Recent alerts on the page). */
  summary: string;
  /** More lines in the Telegram message. */
  lines: string[];
  /** CRYPY page for "Open in CRYPY", without the language prefix (e.g. "/tx/0x…?chain=bsc"). */
  path: string;
  /** The watched item "Mute this wallet" mutes; null when the alert isn't about one item. */
  muteItemId: string | null;
}

export interface AlertRecord {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  details: AlertDetails;
}

export interface TelegramButton {
  text: string;
  url?: string;
  callback_data?: string;
}

const ICON: Record<AlertKind, string> = {
  sent: "🔴",
  received: "🟢",
  moved: "🔁",
  approval: "🟠",
  "value-drop": "📉",
  security: "⚠️",
  liquidity: "⚠️",
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram only accepts link buttons to public https sites; on a local test server the link goes in the text. */
export function isPublicSite(site: URL): boolean {
  return site.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(site.hostname);
}

export function alertLink(site: URL, path: string): string {
  return new URL(`/en${path}`, site).toString();
}

export function telegramAlert(alert: AlertRecord, site: URL): { html: string; buttons: TelegramButton[][] } {
  const link = alertLink(site, alert.details.path);
  const lines = [`<b>${ICON[alert.kind]} ${escapeHtml(alert.title)}</b>`, ...alert.details.lines.map(escapeHtml)];
  const row: TelegramButton[] = [];
  if (isPublicSite(site)) row.push({ text: "Open in CRYPY", url: link });
  else lines.push(escapeHtml(`Open in CRYPY: ${link}`));
  if (alert.details.muteItemId)
    row.push({ text: "Mute this wallet", callback_data: `mute:${alert.details.muteItemId}` });
  return { html: lines.join("\n"), buttons: row.length ? [row] : [] };
}

/** After quiet hours or a burst: more than MAX_SINGLE waiting alerts for one person go out as one summary message. */
export const MAX_SINGLE = 5;

export function telegramDigest(alerts: AlertRecord[], site: URL): { html: string; buttons: TelegramButton[][] } {
  const shown = alerts.slice(0, MAX_SINGLE);
  const lines = [
    `<b>🔔 ${alerts.length} alerts while you were away</b>`,
    ...shown.map((a) => `${ICON[a.kind]} ${escapeHtml(a.title)}`),
  ];
  if (alerts.length > shown.length) lines.push(escapeHtml(`…and ${alerts.length - shown.length} more.`));
  const link = alertLink(site, "/tools/watchlist");
  if (isPublicSite(site)) return { html: lines.join("\n"), buttons: [[{ text: "See all in CRYPY", url: link }]] };
  lines.push(escapeHtml(`See all in CRYPY: ${link}`));
  return { html: lines.join("\n"), buttons: [] };
}

/** The "Send test" button on the page. */
export function telegramTest(site: URL): { html: string; buttons: TelegramButton[][] } {
  return telegramAlert(
    {
      kind: "received",
      severity: "info",
      title: "Test alert from CRYPY",
      details: {
        summary: "",
        lines: [
          "Alerts for your watchlist will arrive here.",
          "CRYPY never asks you to connect a wallet or sign here.",
        ],
        path: "/tools/watchlist",
        muteItemId: null,
      },
    },
    site,
  );
}
