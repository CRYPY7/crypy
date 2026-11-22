"use client";

import { Clock, ExternalLink, Mail, Moon, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatMinutes, parseMinutes } from "@/lib/alerts/quiet";
import { cn } from "@/lib/utils";
import { Panel, fill, inputClass } from "@/modules/tools/shared/ui";
import { type Strings, api, primaryButton, secondaryButton } from "./common";

/** Where alerts go (Telegram, quiet hours) and Recent alerts: approved boards 39–40. */

export interface AlertView {
  id: string;
  kind: string;
  severity: "info" | "good" | "warn" | "danger";
  chain: string;
  title: string;
  summary: string;
  path: string;
  status: string;
  createdAt: string;
}

export interface AlertsData {
  settings: {
    telegram: { connected: boolean; username: string | null; linkedAt: string | null };
    pendingCode: boolean;
    quiet: { on: boolean; start: number; end: number; timeZone: string };
  };
  alerts: AlertView[];
  bot: { available: boolean; username: string | null };
  checker: { running: boolean; chains: Record<string, { ok: boolean; at: number }> };
}

interface LinkCode {
  code: string;
  command: string;
  link: string;
  qr: string;
  bot: string;
  expiresAt: string;
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Loads alerts data: every 3 s while a Telegram code waits to be used (the page updates by itself), else every minute. */
export function useAlerts() {
  const [data, setData] = useState<AlertsData | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void api<AlertsData>("/api/v1/alerts").then((result) => {
      if (!active) return;
      setData(result.ok ? result.data : null);
      const waiting = result.ok && result.data.settings.pendingCode && !result.data.settings.telegram.connected;
      timer = setTimeout(refresh, waiting ? 3_000 : 60_000);
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [version, refresh]);
  return { data, refresh };
}

export function WhereAlertsGo({
  s,
  data,
  refresh,
  code,
  setCode,
}: {
  s: Strings;
  data: AlertsData;
  refresh: () => void;
  code: LinkCode | null;
  setCode: (code: LinkCode | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [editingQuiet, setEditingQuiet] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { telegram, quiet } = data.settings;
  const bot = data.bot.username;

  // Code expiry countdown (the code lasts 10 minutes).
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [code]);
  const expired = code ? new Date(code.expiresAt).getTime() <= now : false;

  const connect = async () => {
    setBusy(true);
    setNote(null);
    const result = await api<LinkCode>("/api/v1/alerts/telegram", {
      method: "POST",
      body: JSON.stringify({ timeZone: browserTimeZone() }),
    });
    setBusy(false);
    if (result.ok) {
      setCode(result.data);
      setNow(Date.now());
      refresh();
    } else setNote({ text: s.tgError!, error: true });
  };
  const sendTest = async () => {
    setBusy(true);
    const result = await api("/api/v1/alerts/telegram/test", { method: "POST" });
    setBusy(false);
    setNote(result.ok ? { text: s.tgTestSent!, error: false } : { text: s.tgError!, error: true });
    if (!result.ok) refresh();
  };
  const disconnect = async () => {
    setBusy(true);
    await api("/api/v1/alerts/telegram", { method: "DELETE" });
    setBusy(false);
    setConfirmDisconnect(false);
    setCode(null);
    refresh();
  };

  return (
    <Panel className="flex flex-col gap-3" data-testid="where-alerts-go">
      <h2 className="text-lg font-semibold">{s.whereTitle}</h2>
      {!data.bot.available ? (
        <p className="text-sm text-muted-foreground">{s.tgUnavailable}</p>
      ) : telegram.connected ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3">
            <Send className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm" data-testid="telegram-connected">
                <span className="font-medium">Telegram</span> ·{" "}
                {telegram.username ? fill(s.tgConnectedAs!, { name: `@${telegram.username}` }) : s.tgConnected}
              </p>
              <p className="text-xs text-muted-foreground">{fill(s.tgFromBot!, { bot: `@${bot}` })}</p>
            </div>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => void sendTest()}>
              {s.tgSendTest}
            </button>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Moon className="size-4" aria-hidden="true" />
            <span data-testid="quiet-hours">
              {quiet.on
                ? fill(s.quietOnText!, { start: formatMinutes(quiet.start), end: formatMinutes(quiet.end) })
                : s.quietOffText}
            </span>
            <span aria-hidden="true">·</span>
            <button type="button" className="text-primary hover:underline" onClick={() => setEditingQuiet(true)}>
              {s.quietChange}
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="text-primary hover:underline" onClick={() => setConfirmDisconnect(true)}>
              {s.tgDisconnect}
            </button>
          </p>
          {confirmDisconnect && (
            <div
              role="alertdialog"
              aria-label={s.tgDisconnectTitle}
              className="flex flex-col gap-2 rounded-xl border border-border p-3"
            >
              <p className="text-sm">{s.tgDisconnectText}</p>
              <div className="flex gap-2">
                <button type="button" className={secondaryButton} onClick={() => setConfirmDisconnect(false)}>
                  {s.cancel}
                </button>
                <button type="button" className={primaryButton} disabled={busy} onClick={() => void disconnect()}>
                  {s.tgDisconnectConfirm}
                </button>
              </div>
            </div>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="size-3.5" aria-hidden="true" />
            {s.emailLater}
          </p>
        </>
      ) : code && !expired ? (
        <div className="flex flex-col gap-3" data-testid="telegram-code">
          <p className="text-sm text-muted-foreground">{s.tgStepText}</p>
          <div className="flex flex-wrap items-center gap-4">
            {/* The QR code is drawn by CRYPY's server from the bot link; shown as an image, never as HTML.
                A small inline SVG: nothing for next/image to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.qr)}`}
              alt={s.tgQrAlt}
              width={120}
              height={120}
              className="rounded-lg bg-white p-1"
            />
            <div className="flex min-w-0 flex-col gap-2">
              <a href={code.link} target="_blank" rel="noopener noreferrer" className={cn(primaryButton, "w-fit")}>
                <Send className="size-4" aria-hidden="true" />
                {s.tgOpen}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              <p className="text-sm text-muted-foreground">
                {s.tgOrSend}{" "}
                <span className="technical text-foreground" dir="ltr" data-testid="telegram-command">
                  {code.command}
                </span>{" "}
                {fill(s.tgToBot!, { bot: `@${code.bot}` })}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.tgCode}{" "}
                <span className="technical font-medium text-foreground" dir="ltr">
                  {code.code}
                </span>
              </p>
            </div>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Clock className="size-4" aria-hidden="true" />
            {s.tgWaiting}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{expired ? s.tgExpired : s.tgConnectText}</p>
          <button type="button" className={cn(primaryButton, "w-fit")} disabled={busy} onClick={() => void connect()}>
            <Send className="size-4" aria-hidden="true" />
            {expired ? s.tgNewCode : s.tgConnect}
          </button>
          <p className="text-xs text-muted-foreground">{s.tgNeverAsks}</p>
        </div>
      )}
      {note && (
        <p role={note.error ? "alert" : "status"} className={cn("text-sm", note.error ? "text-critical" : "text-low")}>
          {note.text}
        </p>
      )}
      {editingQuiet && (
        <QuietDialog
          s={s}
          quiet={quiet}
          onClose={() => setEditingQuiet(false)}
          onSaved={() => {
            setEditingQuiet(false);
            refresh();
          }}
        />
      )}
    </Panel>
  );
}

function QuietDialog({
  s,
  quiet,
  onClose,
  onSaved,
}: {
  s: Strings;
  quiet: AlertsData["settings"]["quiet"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [on, setOn] = useState(quiet.on);
  const [error, setError] = useState<string | null>(null);
  const zone = browserTimeZone();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = parseMinutes(String(form.get("start") ?? ""));
    const end = parseMinutes(String(form.get("end") ?? ""));
    if (start === null || end === null) {
      setError(s.quietInvalid!);
      return;
    }
    const result = await api("/api/v1/alerts/settings", {
      method: "PATCH",
      body: JSON.stringify({ quiet: { on, start, end, timeZone: zone } }),
    });
    if (result.ok) onSaved();
    else setError(s.errSave!);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{s.quietTitle}</DialogTitle>
        <DialogDescription>{s.quietText}</DialogDescription>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
          <label className="flex items-center justify-between gap-3 text-sm">
            {s.quietUse}
            <input
              type="checkbox"
              role="switch"
              checked={on}
              onChange={(e) => setOn(e.target.checked)}
              className="size-5 accent-[var(--color-primary)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              {s.quietFrom}
              <input
                name="start"
                type="time"
                defaultValue={formatMinutes(quiet.start)}
                disabled={!on}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              {s.quietTo}
              <input
                name="end"
                type="time"
                defaultValue={formatMinutes(quiet.end)}
                disabled={!on}
                className={inputClass}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{fill(s.quietZone!, { zone })}</p>
          {error && (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={onClose}>
              {s.cancel}
            </button>
            <button type="submit" className={primaryButton}>
              {s.save}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DOT: Record<AlertView["severity"], string> = {
  info: "bg-primary",
  good: "bg-low",
  warn: "bg-medium",
  danger: "bg-critical",
};

export function RecentAlerts({ s, data, locale }: { s: Strings; data: AlertsData; locale: string }) {
  const [all, setAll] = useState(false);
  const [older, setOlder] = useState<AlertView[]>([]);
  const [end, setEnd] = useState(false);
  // "2 min ago" is measured from a clock that ticks once a minute (render stays pure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const list = [...data.alerts, ...older];
  const shown = all ? list : list.slice(0, 5);

  const loadOlder = async () => {
    const last = list.at(-1);
    if (!last) return;
    const result = await api<{ alerts: AlertView[] }>(`/api/v1/alerts?before=${encodeURIComponent(last.createdAt)}`);
    if (result.ok) {
      setOlder((prev) => [...prev, ...result.data.alerts]);
      if (result.data.alerts.length === 0) setEnd(true);
    }
  };
  const ago = (iso: string) => {
    const seconds = Math.min(0, Math.round((new Date(iso).getTime() - now) / 1000));
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const abs = Math.abs(seconds);
    if (abs < 60) return rtf.format(seconds, "second");
    if (abs < 3_600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3_600), "hour");
    return rtf.format(Math.round(seconds / 86_400), "day");
  };
  const statusText: Record<string, string | undefined> = {
    queued: s.statusWaiting,
    "no-channel": s.statusNoChannel,
    failed: s.statusFailed,
    muted: s.statusMuted,
  };

  return (
    <Panel className="flex flex-col gap-1" data-testid="recent-alerts">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{s.recentTitle}</h2>
        {list.length > 5 && (
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? s.recentFewer : s.recentAll}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{s.recentEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((a) => (
            <li key={a.id} className="flex gap-3 py-3" data-testid="alert-row">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[a.severity])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <a href={`/${locale}${a.path}`} className="font-medium hover:underline">
                  {a.title}
                </a>
                <p className="text-xs text-muted-foreground">{a.summary}</p>
                {statusText[a.status] && <p className="text-xs text-medium">{statusText[a.status]}</p>}
              </div>
              <time dateTime={a.createdAt} className="shrink-0 text-xs text-muted-foreground" title={a.createdAt}>
                {ago(a.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {all && !end && list.length >= 20 && (
        <button type="button" className={cn(secondaryButton, "mt-2 w-fit")} onClick={() => void loadOlder()}>
          {s.recentOlder}
        </button>
      )}
    </Panel>
  );
}
