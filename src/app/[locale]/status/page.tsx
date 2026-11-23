import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ChainIcon } from "@/components/chain-icon";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { DayBars, LegendSwatch, StateChip, StateIcon, stateText } from "@/components/status/status-parts";
import { siteUrl } from "@/config/env";
import { type ToolId, tools } from "@/config/tools";
import { isLocale, type Locale } from "@/i18n/locales";
import type { ComponentGroup } from "@/lib/health/checks";
import type { DayBar, HealthState } from "@/lib/health/status";
import type { StatusUpdate } from "@/lib/health/updates";
import { numberFormat } from "@/lib/format/intl";
import { pageAlternates } from "@/lib/metadata";
import { localePath, toolPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type PublicComponentStatus, publicStatus, readTime } from "@/server/health/runner";
import { publicUpdates } from "@/server/services/status-updates";

/** Public status page (M9 Part 5, boards 51–52). Reads saved health results only; never calls a data provider. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("status");
  return { title: { absolute: t("seoTitle") }, description: t("seoDescription"), ...pageAlternates(locale, "/status") };
}

export default async function StatusPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
            { "@type": "ListItem", position: 2, name: t("status.title"), item: url("/status") },
          ],
        }}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[{ label: t("nav.home"), href: localePath(locale) }, { label: t("nav.status") }]}
      />
      <header className="mt-4">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{t("status.title")}</h1>
        <p className="mt-3 text-muted-foreground sm:text-lg">{t("status.intro")}</p>
      </header>
      <Suspense fallback={<div aria-hidden="true" className="mt-6 min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
        <LiveStatus locale={locale} />
      </Suspense>
      <p className="mt-8 max-w-3xl text-sm text-muted-foreground">{t("status.howItWorks")}</p>
    </div>
  );
}

const banner: Record<HealthState, string> = {
  operational: "border-low/40 bg-low/8",
  degraded: "border-medium/40 bg-medium/8",
  down: "border-critical/40 bg-critical/8",
  unknown: "border-border bg-card",
};

async function LiveStatus({ locale }: { locale: Locale }) {
  await connection();
  const t = await getTranslations();
  const now = readTime();
  const [status, updates] = await Promise.all([publicStatus(now), publicUpdates(now)]);
  const percent = numberFormat(locale, { style: "percent", maximumFractionDigits: 2 });
  const dayFormat = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

  const name = (c: Pick<PublicComponentStatus, "id" | "tool" | "chain">) =>
    c.tool ? t(`tools.${c.tool}.name`) : c.chain ? t(`chains.${c.chain}`) : t(`status.components.${c.id}`);
  const problems = status.components.filter((c) => c.state === "degraded" || c.state === "down");
  const unchecked = status.components.filter((c) => c.state === "unknown").length;
  const minutes = status.checkedAt ? Math.max(0, Math.floor((now - Date.parse(status.checkedAt)) / 60_000)) : null;
  const titleFor = (bar: DayBar) => {
    const day = dayFormat.format(new Date(`${bar.day}T00:00:00Z`));
    return bar.uptime === null
      ? t("status.dayNone", { day })
      : t("status.dayTitle", { day, percent: percent.format(bar.uptime) });
  };

  const groups: ComponentGroup[] = ["core", "tools", "chains", "alerts"];
  const ongoing = updates.filter((u) => u.state !== "fixed");
  const earlier = updates.filter((u) => u.state === "fixed");
  const liveTools = tools.filter((tool) => tool.status !== "soon");

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section
        role="status"
        aria-label={t("status.headline." + status.overall)}
        className={cn("flex flex-wrap items-center gap-4 rounded-2xl border p-5", banner[status.overall])}
      >
        <span className={cn("grid size-10 place-items-center rounded-full bg-muted", stateText[status.overall])}>
          <StateIcon state={status.overall} className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-lg font-semibold">{t(`status.headline.${status.overall}`)}</p>
          <p className="text-muted-foreground">
            {status.overall === "degraded"
              ? t("status.headlineText.degraded", {
                  names: problems.map(name).join(", "),
                  count: problems.length,
                })
              : status.overall === "operational" && unchecked
                ? t("status.headlineText.partial", { count: unchecked })
                : t(`status.headlineText.${status.overall}`)}
          </p>
        </div>
        {minutes !== null && (
          <p className="w-full text-sm text-muted-foreground sm:w-auto sm:text-end">
            {t("status.lastChecked", { minutes })}
            <br />
            {t("status.checksEvery")}
          </p>
        )}
      </section>

      <section aria-labelledby="updates" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <h2 id="updates" className="text-lg font-semibold">
          {t("status.updates.title")}
        </h2>
        {updates.length === 0 && <p className="text-muted-foreground">{t("status.updates.none")}</p>}
        {ongoing.map((u) => (
          <UpdateItem key={u.id} update={u} locale={locale} name={name} />
        ))}
        {earlier.length > 0 && (
          <details className="group" open={ongoing.length === 0}>
            <summary className="cursor-pointer text-sm font-medium text-primary">{t("status.updates.earlier")}</summary>
            <div className="mt-3 flex flex-col gap-3">
              {earlier.map((u) => (
                <UpdateItem key={u.id} update={u} locale={locale} name={name} />
              ))}
            </div>
          </details>
        )}
      </section>

      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
        aria-label={t("status.legendLabel")}
        role="group"
      >
        {(["operational", "degraded", "down", "none"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-2">
            <LegendSwatch state={state} />
            {t(`status.legend.${state}`)}
          </span>
        ))}
      </div>

      {groups.map((group) => {
        const items = status.components.filter((c) => c.group === group);
        const sub = t(`status.groups.${group}.sub`);
        return (
          <section
            key={group}
            aria-labelledby={`group-${group}`}
            className="overflow-hidden rounded-2xl border bg-card"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4">
              <h2 id={`group-${group}`} className="text-lg font-semibold">
                {t(`status.groups.${group}.title`)}
              </h2>
              {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
            </div>
            <ul>
              {items.map((c) => {
                const uptime =
                  c.uptime === null ? t("status.noUptime") : t("status.uptime", { percent: percent.format(c.uptime) });
                const label = name(c);
                return (
                  <li
                    key={c.id}
                    className="grid gap-2 border-t px-5 py-3 md:grid-cols-[15rem_1fr_10rem] md:items-center md:gap-5"
                    data-testid={`status-${c.id}`}
                  >
                    <span className="flex items-center justify-between gap-2 font-medium md:justify-start">
                      <span className="flex min-w-0 items-center gap-2">
                        {c.chain && <ChainIcon chain={c.chain} size={20} />}
                        {c.tool ? (
                          <Link href={toolPath(locale, c.tool as ToolId)} className="hover:text-primary">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </span>
                      <StateChip state={c.state} label={t(`status.state.${c.state}`)} className="md:hidden" />
                    </span>
                    <span className="flex flex-col gap-1">
                      <DayBars bars={c.bars} summary={`${label}: ${uptime}`} titleFor={titleFor} />
                      <span className="flex justify-between text-xs text-muted-foreground">
                        <span className="hidden sm:inline">{t("status.daysAgo")}</span>
                        <span>{uptime}</span>
                        <span>{t("status.today")}</span>
                      </span>
                    </span>
                    <StateChip
                      state={c.state}
                      label={t(`status.state.${c.state}`)}
                      className="hidden justify-self-end md:inline-flex"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section aria-labelledby="features" className="flex flex-col gap-3">
        <h2 id="features" className="text-lg font-semibold">
          {t("status.features.title")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureList
            label={t("status.features.live")}
            tone="text-low border-low/40"
            items={[
              t("status.features.liveTools", { count: liveTools.length }),
              t("status.features.liveChains"),
              t("status.features.liveAlerts"),
            ]}
          />
          <FeatureList
            label={t("status.features.beta")}
            tone="text-primary border-primary/40"
            items={[t("status.features.betaSite")]}
          />
          <FeatureList
            label={t("status.features.soon")}
            tone="text-medium border-medium/40"
            items={(t.raw("status.features.soonItems") as string[]).map(String)}
          />
        </div>
      </section>
    </div>
  );
}

async function UpdateItem({
  update,
  locale,
  name,
}: {
  update: StatusUpdate;
  locale: Locale;
  name: (c: { id: string; tool?: string; chain?: string }) => string;
}) {
  const t = await getTranslations();
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    new Date(update.createdAt),
  );
  const tone = {
    ongoing: "text-medium border-medium/40",
    planned: "text-primary border-primary/40",
    fixed: "text-low border-low/40",
  }[update.state];
  const component = update.component;
  const affects = component
    ? name({
        id: component,
        ...(component.startsWith("tool:") ? { tool: component.slice(5) } : {}),
        ...(component.startsWith("chain:") ? { chain: component.slice(6) } : {}),
      })
    : t("status.updates.wholeSite");
  return (
    <article className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", tone)}>
          {t(`status.updates.state.${update.state}`)}
        </span>
        <span className="text-muted-foreground">{t("status.updates.affects", { name: affects })}</span>
        <time dateTime={update.createdAt} className="text-muted-foreground sm:ms-auto">
          {when} UTC
        </time>
      </div>
      <h3 className="font-semibold">{update.title}</h3>
      <p className="whitespace-pre-line text-muted-foreground">{update.body}</p>
    </article>
  );
}

function FeatureList({ label, tone, items }: { label: string; tone: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <span className={cn("self-start rounded-full border px-2.5 py-0.5 text-xs font-semibold", tone)}>{label}</span>
      <ul className="flex list-disc flex-col gap-1.5 ps-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
