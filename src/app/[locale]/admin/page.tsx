import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Lock, X } from "lucide-react";
import { AdminSignIn, SignOutButton, UpdateForm, UpdateStateButton } from "@/components/admin/admin-client";
import { StateChip } from "@/components/status/status-parts";
import { isLocale, type Locale } from "@/i18n/locales";
import { type CheckGroup, checkLabelKey, statusComponents } from "@/lib/health/checks";
import type { HealthState } from "@/lib/health/status";
import { updateStates } from "@/lib/health/updates";
import { numberFormat } from "@/lib/format/intl";
import { localePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { adminAccessFromCookies } from "@/server/admin/auth";
import { adminHealth } from "@/server/health/admin";
import { readTime } from "@/server/health/runner";
import { outcomesSince } from "@/server/outcomes/store";
import { publicUpdates } from "@/server/services/status-updates";

/**
 * Private admin dashboard (M9 Part 5, boards 53–54): only wallets listed in ADMIN_WALLETS, after the usual wallet
 * sign-in. Hidden from search engines (noindex, disallowed in robots.txt, not in the sitemap). Read-only apart from
 * status updates for the public page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ show?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div aria-hidden="true" className="min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
        <AdminGate locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const card = "rounded-2xl border bg-card";

async function AdminGate({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  await connection();
  const t = await getTranslations("admin");
  const access = await adminAccessFromCookies().catch(() => ({ kind: "signed-out" as const }));

  if (access.kind === "signed-out")
    return (
      <section aria-labelledby="admin-sign-in" className={cn(card, "mx-auto flex max-w-xl flex-col gap-4 p-6")}>
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <h1 id="admin-sign-in" className="text-2xl font-bold">
          {t("signIn.title")}
        </h1>
        <p className="text-muted-foreground">{t("signIn.text")}</p>
        <AdminSignIn strings={t.raw("signIn") as Record<string, string>} />
        <p className="text-sm text-muted-foreground">{t("signIn.hint")}</p>
      </section>
    );

  if (access.kind === "not-admin")
    return (
      <section aria-labelledby="admin-denied" className={cn(card, "mx-auto flex max-w-xl flex-col gap-4 p-6")}>
        <span className="grid size-11 place-items-center rounded-xl bg-critical/10 text-critical">
          <X className="size-5" aria-hidden="true" />
        </span>
        <h1 id="admin-denied" className="text-2xl font-bold">
          {t("denied.title")}
        </h1>
        <p className="text-muted-foreground">{t("denied.text", { address: short(access.user.address) })}</p>
        <div className="flex flex-wrap items-center gap-3">
          <SignOutButton label={t("signOut")} />
          <Link href={localePath(locale, "/status")} className="text-sm font-medium text-primary hover:underline">
            {t("denied.publicLink")}
          </Link>
        </div>
      </section>
    );

  const { show } = await searchParams;
  return <Dashboard locale={locale} address={access.user.address} show={show} />;
}

const groups: CheckGroup[] = ["website", "chain", "tool", "alerts", "data", "server"];

async function Dashboard({ locale, address, show }: { locale: Locale; address: string; show?: string }) {
  const t = await getTranslations();
  const now = readTime();
  const [health, updates, day, week] = await Promise.all([
    adminHealth(now),
    publicUpdates(now),
    outcomesSince(now - 86_400_000).catch(() => []),
    outcomesSince(now - 7 * 86_400_000).catch(() => []),
  ]);
  const weekOf = (tool: string) => week.find((w) => w.tool === tool);
  const n = numberFormat(locale);
  const percent = numberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const ago = (iso: string) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  const label = (id: string) => {
    const { key, chain } = checkLabelKey(id);
    return t(`admin.checks.label.${key}`, { chain: chain ? t(`chains.${chain}`) : "" });
  };
  const stateLabel = (state: HealthState | null) => (state ? t(`status.state.${state}`) : t("admin.checks.skipped"));

  const problems = health.checks.filter((c) => c.state === "degraded" || c.state === "down");
  const down = health.checks.filter((c) => c.state === "down").length;
  const working = health.checks.filter((c) => c.state === "operational").length;
  const skipped = health.checks.filter((c) => c.state === null).length;
  const filter = show === "problems" || groups.includes(show as CheckGroup) ? show : "all";
  const shown = health.checks.filter((c) =>
    filter === "all" ? true : filter === "problems" ? problems.includes(c) : c.group === filter,
  );
  const alchemy = health.providers.find((p) => p.provider === "alchemy");
  const alchemyShare = alchemy?.units !== undefined && alchemy.limit ? alchemy.units / alchemy.limit : null;
  const detailOf = (id: string) => health.checks.find((c) => c.id === id)?.detail ?? t("admin.server.unknown");
  const bytes = health.databaseBytes;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <span className="rounded-full border border-medium/50 px-2.5 py-0.5 text-xs font-semibold text-medium">
          {t("admin.badge")}
        </span>
        <nav aria-label={t("admin.nav.label")} className="flex flex-wrap gap-1">
          {(["health", "visitors", "providers", "updates"] as const).map((id) => (
            <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
              {t(`admin.nav.${id}`)}
            </a>
          ))}
        </nav>
        <span
          className="flex items-center gap-2 text-sm text-muted-foreground sm:ms-auto"
          data-testid="admin-signed-in"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-low" />
          {t("admin.signedInAs", { address: short(address) })}
        </span>
        <Link href={localePath(locale, "/status")} className="text-sm font-medium text-primary hover:underline">
          {t("admin.viewPublic")}
        </Link>
        <SignOutButton label={t("admin.signOut")} />
      </div>

      <header id="health" className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("admin.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("admin.intro")}</p>
        </div>
        <p className="text-sm text-muted-foreground sm:ms-auto">
          {health.lastRoundAt ? t("admin.lastRound", { minutes: ago(health.lastRoundAt) }) : t("admin.noRounds")}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t("admin.tiles.now")}
          value={problems.length ? t("admin.tiles.nowProblems", { count: problems.length }) : t("admin.tiles.nowAll")}
          tone={problems.length ? (down ? "text-critical" : "text-medium") : "text-low"}
          sub={t("admin.tiles.nowSub", { down, working, skipped })}
        />
        <Tile
          label={t("admin.tiles.day")}
          value={health.passed24h === null ? t("admin.tiles.dayNone") : percent.format(health.passed24h)}
          sub={t("admin.tiles.daySub")}
        />
        <Tile
          label={t("admin.tiles.alchemy")}
          value={health.alchemyConfigured ? percent.format(alchemyShare ?? 0) : t("admin.tiles.alchemyNone")}
          sub={t("admin.tiles.alchemySub")}
        />
        <Tile
          label={t("admin.tiles.telegram")}
          value={
            health.telegram.bot && health.telegram.chats ? t("admin.tiles.telegramOn") : t("admin.tiles.telegramOff")
          }
          tone={health.telegram.bot && health.telegram.chats ? "text-low" : "text-medium"}
          sub={
            !health.telegram.bot
              ? t("admin.tiles.telegramNoBot")
              : health.telegram.chats
                ? t("admin.tiles.telegramOnSub", { count: health.telegram.chats })
                : t("admin.tiles.telegramOffSub")
          }
        />
      </div>

      <section aria-labelledby="all-checks" className={cn(card, "overflow-hidden")}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <h2 id="all-checks" className="text-lg font-semibold">
            {t("admin.checks.title")}
          </h2>
          <span className="text-sm text-muted-foreground">{t("admin.checks.sub")}</span>
          <nav aria-label={t("admin.checks.filters")} className="flex flex-wrap gap-1.5 sm:ms-auto">
            {["all", "problems", ...groups].map((id) => (
              <Link
                key={id}
                href={id === "all" ? localePath(locale, "/admin") : `${localePath(locale, "/admin")}?show=${id}`}
                aria-current={filter === id ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg border px-3 text-sm",
                  filter === id ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                {id === "all"
                  ? t("admin.checks.all")
                  : id === "problems"
                    ? t("admin.checks.problems")
                    : t(`admin.checks.group.${id}`)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-labelledby="all-checks">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-start text-xs tracking-wide text-muted-foreground uppercase">
                {(["check", "type", "state", "took", "when", "reason"] as const).map((col) => (
                  <th key={col} scope="col" className="px-4 py-2 text-start font-semibold">
                    {t(`admin.checks.cols.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-t" data-testid={`check-${c.id}`}>
                  <th scope="row" className="px-4 py-2.5 text-start font-medium">
                    {label(c.id)}
                  </th>
                  <td className="px-4 py-2.5 text-muted-foreground">{t(`admin.checks.group.${c.group}`)}</td>
                  <td className="px-4 py-2.5">
                    {c.state ? (
                      <StateChip state={c.state} label={stateLabel(c.state)} />
                    ) : (
                      <span className="text-sm text-muted-foreground">{stateLabel(null)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{c.ms === null ? "—" : `${n.format(c.ms)} ms`}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {c.at ? t("admin.checks.ago", { minutes: ago(c.at) }) : t("admin.checks.never")}
                  </td>
                  <td className="max-w-[24rem] px-4 py-2.5 break-words text-muted-foreground">{c.detail ?? "—"}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr className="border-t">
                  <td colSpan={6} className="px-4 py-4 text-muted-foreground">
                    {t("admin.checks.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="visitors" aria-labelledby="visitors-title" className={cn(card, "overflow-hidden")}>
        <div className="px-4 py-4">
          <h2 id="visitors-title" className="text-lg font-semibold">
            {t("admin.outcomes.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.outcomes.sub")}</p>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-labelledby="visitors-title">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-start text-xs tracking-wide text-muted-foreground uppercase">
                {(["tool", "requests", "full", "partial", "errors", "slow", "average", "week", "reasons"] as const).map(
                  (col) => (
                    <th key={col} scope="col" className="px-4 py-2 text-start font-semibold">
                      {t(`admin.outcomes.cols.${col}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {day.map((o) => {
                const w = weekOf(o.tool);
                const share = (x: number, total: number) => (total ? percent.format(x / total) : "\u2014");
                return (
                  <tr key={o.tool} className="border-t align-top" data-testid={`outcome-${o.tool}`}>
                    <th scope="row" className="px-4 py-2 text-start font-medium">
                      {t(`admin.outcomes.tools.${o.tool}`)}
                    </th>
                    <td className="px-4 py-2 tabular-nums">{n.format(o.total)}</td>
                    <td className="px-4 py-2 tabular-nums">{share(o.full, o.total)}</td>
                    <td className={cn("px-4 py-2 tabular-nums", o.partial > 0 && "text-medium")}>
                      {share(o.partial, o.total)}
                    </td>
                    <td className={cn("px-4 py-2 tabular-nums", o.errors > 0 && "font-semibold text-critical")}>
                      {share(o.errors, o.total)}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{n.format(o.slow)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {o.averageMs === null ? "\u2014" : t("admin.outcomes.ms", { ms: n.format(o.averageMs) })}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {w
                        ? t("admin.outcomes.weekValue", { errors: share(w.errors, w.total), total: n.format(w.total) })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {o.reasons.length
                        ? o.reasons.map((r) => `${r.reason} \u00d7${n.format(r.count)}`).join(" \u00b7 ")
                        : "\u2014"}
                    </td>
                  </tr>
                );
              })}
              {day.length === 0 && (
                <tr className="border-t">
                  <td colSpan={9} className="px-4 py-4 text-muted-foreground">
                    {t("admin.outcomes.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="provider-health-title" className={cn(card, "overflow-hidden")}>
        <div className="px-4 py-4">
          <h2 id="provider-health-title" className="text-lg font-semibold">
            {t("admin.providerHealth.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.providerHealth.sub")}</p>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-labelledby="provider-health-title">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-start text-xs tracking-wide text-muted-foreground uppercase">
                {(
                  [
                    "provider",
                    "requests",
                    "answered",
                    "failed",
                    "limited",
                    "refused",
                    "average",
                    "now",
                    "worst",
                  ] as const
                ).map((col) => (
                  <th key={col} scope="col" className="px-4 py-2 text-start font-semibold">
                    {t(`admin.providerHealth.cols.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.providerHealth.map((p) => (
                <tr
                  key={`${p.chain}-${p.provider}`}
                  className="border-t align-top"
                  data-testid={`provider-health-${p.chain}-${p.provider}`}
                >
                  <th scope="row" className="px-4 py-2 text-start font-medium">
                    {t("admin.providerHealth.name", {
                      chain: t(`chains.${p.chain}`),
                      provider: p.provider,
                      kind: t(`admin.providerHealth.kinds.${p.kind}`),
                    })}
                  </th>
                  <td className="px-4 py-2 tabular-nums">{n.format(p.requests)}</td>
                  <td
                    className={cn(
                      "px-4 py-2 tabular-nums",
                      p.state === "poor" && "font-semibold text-critical",
                      p.state === "uneven" && "text-medium",
                    )}
                  >
                    {p.score === null ? "\u2014" : percent.format(p.score)}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{n.format(p.counts.failed)}</td>
                  <td className="px-4 py-2 tabular-nums">{n.format(p.counts.limited)}</td>
                  <td className="px-4 py-2 tabular-nums">{n.format(p.counts.refused)}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {p.averageMs === null ? "\u2014" : t("admin.outcomes.ms", { ms: n.format(p.averageMs) })}
                  </td>
                  <td className={cn("px-4 py-2", (p.restingUntil || p.restingMethods.length > 0) && "text-medium")}>
                    {p.restingUntil
                      ? t("admin.providerHealth.restingAll")
                      : p.restingMethods.length
                        ? t("admin.providerHealth.restingSome", { methods: p.restingMethods.join(", ") })
                        : t("admin.providerHealth.inUse")}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {p.worstMethods.length
                      ? p.worstMethods.map((m) => `${m.method} \u00d7${n.format(m.count)}`).join(" \u00b7 ")
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <section id="providers" aria-labelledby="providers-title" className={cn(card, "overflow-hidden")}>
          <div className="px-4 py-4">
            <h2 id="providers-title" className="text-lg font-semibold">
              {t("admin.providers.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("admin.providers.sub")}</p>
          </div>
          <ul>
            {health.providers.length === 0 && (
              <li className="border-t px-4 py-3 text-muted-foreground">{t("admin.providers.none")}</li>
            )}
            {health.providers.map((p) => {
              const used = p.units ?? p.requests;
              const share = p.limit ? Math.min(1, used / p.limit) : null;
              return (
                <li key={p.provider} className="flex flex-col gap-2 border-t px-4 py-3">
                  <span className="flex flex-wrap gap-2 text-sm">
                    <b>{p.provider.replace(/^public:/, "")}</b>
                    <span className="ms-auto">
                      {p.limit
                        ? t("admin.providers.usage", {
                            used: n.format(used),
                            limit: `${n.format(p.limit)} ${p.units !== undefined ? t("admin.providers.units") : t("admin.providers.requests")}`,
                          })
                        : t("admin.providers.usageNoLimit", { used: n.format(p.requests) })}
                    </span>
                  </span>
                  {share !== null && (
                    <span
                      role="meter"
                      aria-label={p.provider}
                      aria-valuenow={Math.round(share * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="flex h-2 rounded bg-muted"
                    >
                      <span
                        className={cn("rounded", share < 0.7 ? "bg-low" : share < 0.9 ? "bg-medium" : "bg-critical")}
                        style={{ width: `${Math.max(1, share * 100)}%` }}
                      />
                    </span>
                  )}
                  {p.alchemy && (
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span>
                        {t("admin.providers.alchemySplit", {
                          background: n.format(p.alchemy.backgroundUnits),
                          visitors: n.format(Math.max(0, used - p.alchemy.backgroundUnits)),
                        })}
                      </span>
                      <span>
                        {p.alchemy.fixedDaily
                          ? t("admin.providers.alchemyFixed")
                          : p.alchemy.usedEarlierThisMonth === null
                            ? t("admin.providers.alchemyMonthUnknown")
                            : t("admin.providers.alchemyMonth", {
                                monthly: n.format(p.alchemy.monthly),
                                earlier: n.format(p.alchemy.usedEarlierThisMonth),
                              })}
                      </span>
                      <span>
                        {t("admin.providers.alchemyTiers", {
                          ordinary: n.format(p.alchemy.ordinaryLimit),
                          background: n.format(p.alchemy.backgroundLimit),
                        })}
                      </span>
                      {p.alchemy.methods.length > 0 && (
                        <span>
                          {t("admin.providers.alchemyTop")}{" "}
                          {p.alchemy.methods
                            .slice(0, 6)
                            .map((m) => `${m.method} ${n.format(m.units)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <li className="flex flex-wrap gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t("admin.providers.goplus")}</span>
              <b className="ms-auto">
                {t("admin.providers.goplusValue", {
                  sent: n.format(health.counters["goplus.sent"]),
                  held: n.format(health.counters["goplus.heldBack"]),
                })}
              </b>
            </li>
            <li className="flex flex-wrap gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{t("admin.providers.rateLimit")}</span>
              <b className="ms-auto">{n.format(health.counters["rateLimit.refused"])}</b>
            </li>
          </ul>
        </section>

        <section aria-labelledby="server-title" className={cn(card, "overflow-hidden")}>
          <h2 id="server-title" className="px-4 py-4 text-lg font-semibold">
            {t("admin.server.title")}
          </h2>
          <dl>
            {[
              [t("admin.server.disk"), detailOf("server:disk")],
              [t("admin.server.memory"), detailOf("server:memory")],
              [t("admin.server.certificate"), detailOf("server:certificate")],
              [
                t("admin.server.database"),
                bytes === null ? t("admin.server.unknown") : `${n.format(Math.round(bytes / 1_048_576))} MB`,
              ],
              [t("admin.server.uptime"), t("admin.server.uptimeValue", { hours: Math.floor(health.uptimeHours) })],
              [
                t("admin.server.backups"),
                health.checks.find((c) => c.id === "server:backup")?.detail ?? t("admin.server.backupsNotInstalled"),
              ],
            ].map(([term, value]) => (
              <div key={term} className="flex flex-wrap gap-x-3 gap-y-1 border-t px-4 py-3 text-sm">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="ms-auto text-end font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="failures-title" className={cn(card, "overflow-hidden")}>
        <div className="px-4 py-4">
          <h2 id="failures-title" className="text-lg font-semibold">
            {t("admin.failures.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.failures.sub")}</p>
        </div>
        <ul>
          {health.failures.length === 0 && (
            <li className="border-t px-4 py-3 text-muted-foreground">{t("admin.failures.none")}</li>
          )}
          {health.failures.map((f) => (
            <li key={`${f.check}-${f.detail}`} className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-3 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground">
                {t("admin.checks.ago", { minutes: ago(f.lastAt) })}
              </span>
              <span className="font-medium">{label(f.check)}</span>
              <span className="technical min-w-0 flex-1 break-words text-muted-foreground" dir="ltr">
                {f.detail || "—"}
              </span>
              <span className="text-muted-foreground">{t("admin.failures.count", { count: f.count })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="updates" aria-labelledby="updates-title" className={cn(card, "flex flex-col gap-4 p-4")}>
        <h2 id="updates-title" className="text-lg font-semibold">
          {t("admin.updates.title")}
        </h2>
        <UpdateForm
          strings={t.raw("admin.updates") as Record<string, string>}
          states={updateStates.map((value) => ({ value, label: t(`status.updates.state.${value}`) }))}
          components={[
            { value: "", label: t("status.updates.wholeSite") },
            ...statusComponents.map((c) => ({
              value: c.id,
              label: c.tool
                ? t(`tools.${c.tool}.name`)
                : c.chain
                  ? t(`chains.${c.chain}`)
                  : t(`status.components.${c.id}`),
            })),
          ]}
        />
        <h3 className="mt-2 font-semibold">{t("admin.updates.recent")}</h3>
        {updates.length === 0 && <p className="text-muted-foreground">{t("admin.updates.none")}</p>}
        <ul className="flex flex-col">
          {updates.slice(0, 10).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 border-t py-3 text-sm">
              <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
                {t(`status.updates.state.${u.state}`)}
              </span>
              <span className="min-w-0 flex-1 font-medium break-words">{u.title}</span>
              {u.state !== "fixed" ? (
                <UpdateStateButton
                  id={u.id}
                  to="fixed"
                  label={t("admin.updates.markFixed")}
                  errorText={t("admin.updates.error")}
                />
              ) : (
                <UpdateStateButton
                  id={u.id}
                  to="ongoing"
                  label={t("admin.updates.markOngoing")}
                  errorText={t("admin.updates.error")}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className={cn(card, "flex flex-col gap-1 p-4")}>
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      <b className={cn("text-2xl", tone)}>{value}</b>
      <span className="text-sm text-muted-foreground">{sub}</span>
    </div>
  );
}
