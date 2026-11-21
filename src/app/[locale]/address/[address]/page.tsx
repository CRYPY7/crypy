import type { Metadata } from "next";
import { RecordVisit } from "@/components/recent/recent";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ChainIcon } from "@/components/chain-icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AddressTabs } from "@/components/entity/address-tabs";
import { EntityHeader, EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { ChainHoldingsSection, TotalValue } from "@/components/entity/holdings";
import { type ChainKey, getChain } from "@/config/chains";
import { type Locale, isLocale } from "@/i18n/locales";
import { type AddressLookup, isActiveLookup } from "@/lib/chains/types";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import type { ChainHoldings } from "@/lib/portfolio/holdings";
import { localePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { pageRequestAllowed } from "@/server/page-guard";
import { cachedResolve, explorerLink } from "@/server/services/lookups";
import { type AddressOverview, cachedAddressOverview } from "@/server/services/overview";

type Props = PageProps<"/[locale]/address/[address]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const t = await getTranslations("entity.address");
  // Result pages are infinite and personal: never indexed.
  return { title: t("metaTitle", { short: shortenId(address) }), robots: { index: false, follow: false } };
}

export default function AddressPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <AddressContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** One chain as shown on this page: what the address is there, and what it holds. */
interface ChainView {
  chain: ChainKey;
  lookup?: AddressLookup;
  holdings?: ChainHoldings;
  active: boolean;
}

function buildViews(lookups: AddressLookup[], overview: AddressOverview): ChainView[] {
  const keys = [...new Set([...lookups.map((l) => l.chain), ...overview.chains.map((c) => c.chain)])];
  return keys.map((chain) => {
    const lookup = lookups.find((l) => l.chain === chain);
    const holdings = overview.chains.find((c) => c.chain === chain);
    // In use: code, sent transactions, a coin balance, or any non-spam token.
    const holdsSomething = Boolean(
      holdings && (holdings.visible.length > 1 || holdings.visible.some((h) => h.amount.raw !== "0")),
    );
    return { chain, lookup, holdings, active: (lookup ? isActiveLookup(lookup) : false) || holdsSomething };
  });
}

async function AddressContent({
  params,
  searchParams,
}: {
  params: Props["params"];
  searchParams: Props["searchParams"];
}) {
  const [{ address }, query, locale] = await Promise.all([params, searchParams, localeParam()]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();

  if (!(await pageRequestAllowed())) return <Notice tone="warning">{t("entity.rateLimited")}</Notice>;

  const result = await cachedResolve(address);
  if (result.status === "bad-checksum") {
    return (
      <Notice tone="danger">
        {t("entity.address.badChecksum")}{" "}
        <Link
          href={localePath(locale, `/address/${address.toLowerCase()}`)}
          prefetch={false}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("entity.address.lookupAnyway")}
        </Link>
      </Notice>
    );
  }
  if (result.status === "unavailable") return <Notice tone="warning">{t("search.result.unavailable")}</Notice>;
  if (result.status !== "address") notFound();
  const overview = await cachedAddressOverview(result.address);

  const views = buildViews(result.lookups, overview);
  const active = views.filter((view) => view.active);
  const inactive = views.filter((view) => !view.active);
  const unavailable = [...new Set([...overview.unavailable, ...result.unavailable])];
  const total = views.length + unavailable.filter((chain) => !views.some((view) => view.chain === chain)).length;

  // ?chain=bsc focuses one chain; anything else shows all.
  const filterParam = typeof query.chain === "string" ? query.chain : undefined;
  const focused =
    active.find((view) => view.chain === filterParam)?.chain ?? views.find((v) => v.chain === filterParam)?.chain;
  const shown = focused ? views.filter((view) => view.chain === focused) : active.length > 0 ? active : views;

  const links = result.lookups.flatMap((lookup) => {
    const chain = getChain(lookup.chain);
    const href = explorerLink(lookup.chain, "address", result.address);
    return chain && href ? [{ href, label: t("entity.viewOn", { explorer: chain.explorer.name }) }] : [];
  });
  const basePath = localePath(locale, `/address/${result.address}`);
  const shownOverview: AddressOverview = {
    ...overview,
    chains: overview.chains.filter((c) => shown.some((view) => view.chain === c.chain)),
    totalUsd: overview.chains
      .filter((c) => shown.some((view) => view.chain === c.chain))
      .reduce((sum, c) => sum + c.totalUsd, 0),
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("entity.address.title") },
          { label: shortenId(result.address), mono: true },
        ]}
      />
      <RecordVisit path={`/address/${result.address}`} kind="address" value={result.address} />
      <EntityHeader
        title={t("entity.address.title")}
        id={result.address}
        copyLabel={t("entity.copy")}
        copiedLabel={t("entity.copied")}
        links={links}
      />
      <AddressTabs
        basePath={basePath}
        current="overview"
        labels={t.raw("entity.tabs") as { label: string; overview: string; approvals: string; activity: string }}
      />

      <section aria-labelledby="identity" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="identity" className="font-sans text-base font-semibold">
            {active.length > 0
              ? t("entity.address.identity.title", { count: active.length, total })
              : t("entity.address.identity.noneTitle")}
          </h2>
          <span className="text-sm text-muted-foreground">{t("entity.address.identity.subtitle")}</span>
        </div>
        {active.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((view) => (
              <li key={view.chain}>
                <IdentityCard
                  view={view}
                  address={result.address}
                  locale={locale}
                  selected={focused === view.chain}
                  pricesAvailable={overview.pricesAvailable}
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
        {inactive.length > 0 && active.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("entity.address.identity.inactive", {
              chains: inactive.map((view) => t(`chains.${view.chain}`)).join(", "),
            })}
          </p>
        )}
        {unavailable.map((chain) => (
          <p key={chain} className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("entity.unavailableChain", { chain: t(`chains.${chain}`) })}
          </p>
        ))}
      </section>

      {active.length > 1 && (
        <nav aria-label={t("entity.address.identity.filter")} className="flex gap-2 overflow-x-auto border-b pb-3">
          <FilterPill href={basePath} current={!focused}>
            {t("entity.address.identity.all")}
            {overview.pricesAvailable && ` · ${formatUsd(overview.totalUsd, locale)}`}
          </FilterPill>
          {active.map((view) => (
            <FilterPill key={view.chain} href={`${basePath}?chain=${view.chain}`} current={focused === view.chain}>
              <ChainIcon chain={view.chain} className="me-1.5" />
              {t(`chains.${view.chain}`)}
              {overview.pricesAvailable && view.holdings && ` · ${formatUsd(view.holdings.totalUsd, locale)}`}
            </FilterPill>
          ))}
        </nav>
      )}

      {shown
        .filter((view) => view.lookup?.kind === "token" && view.lookup.token)
        .map((view) => (
          <Notice key={`token-${view.chain}`}>
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {t("entity.address.identity.tokenNote", {
                  chain: t(`chains.${view.chain}`),
                  token: `${view.lookup!.token!.name || view.lookup!.token!.symbol} · ${view.lookup!.token!.symbol}`,
                })}
              </span>
              <Link
                href={localePath(locale, `/token/${view.chain}/${result.address}`)}
                className="rounded-lg border px-3 py-2 text-sm font-semibold hover:border-primary"
              >
                {t("entity.address.identity.openToken")}
              </Link>
            </span>
          </Notice>
        ))}

      {shownOverview.chains.length > 0 && (
        <TotalValue
          overview={shownOverview}
          locale={locale}
          label={
            focused
              ? t("entity.address.balances.totalChain", { chain: t(`chains.${focused}`) })
              : t("entity.address.balances.totalAll")
          }
        />
      )}

      {shown.map((view) =>
        view.holdings ? (
          <ChainHoldingsSection
            key={view.chain}
            holdings={view.holdings}
            kindLabel={view.lookup ? kindText(view.lookup, t) : undefined}
            pricesAvailable={overview.pricesAvailable}
            locale={locale}
          />
        ) : null,
      )}

      <Notice title={t("entity.comingSoonTitle")}>{t("entity.address.comingSoon")}</Notice>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;

function kindText(lookup: AddressLookup, t: T): string {
  const kind = t(`entity.kinds.${lookup.delegated ? "delegated" : lookup.kind}`);
  return lookup.kind === "account"
    ? `${kind} · ${lookup.hasActivity ? t("entity.address.active") : t("entity.address.inactive")}`
    : kind;
}

const badgeTone: Record<string, string> = {
  token: "bg-primary/14 text-primary",
  account: "bg-low/14 text-low",
  delegated: "bg-low/14 text-low",
  contract: "bg-high/14 text-high",
};

function IdentityCard({
  view,
  address,
  locale,
  selected,
  pricesAvailable,
  t,
}: {
  view: ChainView;
  address: string;
  locale: Locale;
  selected: boolean;
  pricesAvailable: boolean;
  t: T;
}) {
  const lookup = view.lookup;
  const kind = lookup ? (lookup.delegated ? "delegated" : lookup.kind) : "account";
  const isToken = lookup?.kind === "token" && lookup.token;
  const holdings = view.holdings;
  const tokenCount = holdings ? holdings.visible.filter((h) => h.kind === "token").length : 0;
  const nativeBalance = holdings?.visible.find((h) => h.kind === "native");

  let fact: string;
  if (isToken) fact = `${lookup.token!.name || lookup.token!.symbol} (${lookup.token!.symbol})`;
  else if (holdings && pricesAvailable && holdings.totalUsd > 0)
    fact = `${formatUsd(holdings.totalUsd, locale)}${tokenCount ? ` · ${t("entity.address.identity.tokens", { count: tokenCount })}` : ""}`;
  else if (nativeBalance && nativeBalance.amount.raw !== "0")
    fact = `${formatAmount(nativeBalance.amount.raw, nativeBalance.amount.decimals, locale, 4)} ${nativeBalance.symbol}`;
  else fact = t("entity.address.balances.empty", { chain: t(`chains.${view.chain}`) });

  const href = isToken
    ? localePath(locale, `/token/${view.chain}/${address}`)
    : localePath(locale, `/address/${address}?chain=${view.chain}`);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary",
        selected && "border-2 border-primary",
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        <ChainIcon chain={view.chain} size={20} />
        {t(`chains.${view.chain}`)}
      </span>
      <span className={cn("self-start rounded-md px-2 py-0.5 text-xs font-semibold", badgeTone[kind])}>
        {t(`entity.kinds.${kind}`)}
      </span>
      <span className="text-sm">{fact}</span>
      <span className="mt-auto text-sm font-semibold text-primary">
        {isToken
          ? `${t("entity.address.identity.openToken")} →`
          : selected
            ? t("entity.address.identity.shownBelow")
            : `${t("entity.address.identity.viewChain")} →`}
      </span>
    </Link>
  );
}

function FilterPill({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={current ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap tabular-nums",
        current ? "border-transparent bg-primary/14 font-semibold" : "hover:border-primary",
      )}
    >
      {children}
    </Link>
  );
}
