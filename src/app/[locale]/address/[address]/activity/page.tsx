import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { type ActivityStrings, ActivityView } from "@/components/entity/activity-view";
import { AddressTabs } from "@/components/entity/address-tabs";
import { ChainScopeBar } from "@/components/entity/chain-scope";
import { EntityHeader, EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { RecordVisit } from "@/components/recent/recent";
import { getChain, liveChains } from "@/config/chains";
import { knownContract, knownContractsFor } from "@/config/known-contracts";
import { isLocale } from "@/i18n/locales";
import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { pageAccess } from "@/server/page-guard";
import { AddressQrButton } from "@/components/entity/address-qr";
import { addressQrProps } from "@/components/entity/address-qr-props";
import { cachedActivity, formatCursor } from "@/server/services/activity";
import { chainScopeFor } from "@/server/services/chain-scope";
import { explorerLink, resolveAddressPage } from "@/server/services/lookups";
import { observe } from "@/server/outcomes/record";
import { classifyActivity } from "@/lib/outcomes/classify";

type Props = PageProps<"/[locale]/address/[address]/activity">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const t = await getTranslations("entity.activity");
  return { title: t("metaTitle", { short: shortenId(address) }), robots: { index: false, follow: false } };
}

export default function ActivityPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <ActivityContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ActivityContent({
  params,
  searchParams,
}: {
  params: Props["params"];
  searchParams: Props["searchParams"];
}) {
  const [{ address }, query, locale] = await Promise.all([params, searchParams, localeParam()]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const access = await pageAccess();
  if (access !== "ok")
    return <Notice tone="warning">{t(access === "crawler" ? "entity.crawler" : "entity.rateLimited")}</Notice>;

  const result = await resolveAddressPage(address);
  if (result.status === "bad-checksum") {
    return (
      <Notice tone="danger">
        {t("entity.address.badChecksum")}{" "}
        <Link
          href={localePath(locale, `/address/${address.toLowerCase()}/activity`)}
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

  const scope = await chainScopeFor(result.address, "activity", query.chains);
  const report = await observe("activity", () => cachedActivity(result.address, null, scope.scan), classifyActivity);
  const basePath = localePath(locale, `/address/${result.address}`);
  const links = result.lookups.flatMap((lookup) => {
    const chain = getChain(lookup.chain);
    const href = explorerLink(lookup.chain, "address", result.address);
    return chain && href ? [{ href, label: t("entity.viewOn", { explorer: chain.explorer.name }) }] : [];
  });
  const active = liveChains.filter((c) => c.capabilities.activity);
  // Names for counterparties that appear on this page only (CRYPY's own list).
  const names: Record<string, Record<string, string>> = {};
  for (const c of active) {
    const listed = new Set(knownContractsFor(c.key));
    names[c.key] = {};
    for (const tr of report.transfers.filter((x) => x.chain === c.key))
      for (const a of [tr.from, tr.to]) {
        const key = a.toLowerCase();
        if (listed.has(key)) names[c.key]![key] = knownContract(c.key, key)!.name;
      }
  }

  const qr = await addressQrProps();
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("entity.address.title"), href: basePath },
          { label: shortenId(result.address), mono: true, href: basePath },
          { label: t("entity.activity.title") },
        ]}
      />
      <RecordVisit path={`/address/${result.address}`} kind="address" value={result.address} />
      <EntityHeader
        title={t("entity.activity.title")}
        id={result.address}
        copyLabel={t("entity.copy")}
        copiedLabel={t("entity.copied")}
        idActions={<AddressQrButton address={result.address} {...qr} />}
        links={links}
      >
        <p className="max-w-3xl text-sm text-muted-foreground">{t("entity.activity.intro")}</p>
      </EntityHeader>
      <AddressTabs
        basePath={basePath}
        current="activity"
        chains={typeof query.chains === "string" ? query.chains : undefined}
        labels={t.raw("entity.tabs") as { label: string; overview: string; approvals: string; activity: string }}
      />
      <ChainScopeBar scope={scope} path={`${basePath}/activity`} />
      <ActivityView
        owner={result.address}
        initial={{
          chains: report.chains,
          transfers: report.transfers,
          next: formatCursor(report.chains),
          checkedAt: report.checkedAt,
          saved: report.saved,
          refreshing: report.refreshing,
        }}
        fresh={t.raw("entity.freshness") as Record<string, string>}
        hiddenTokens={report.hiddenTokens}
        names={names}
        strings={t.raw("entity.activity.ui") as ActivityStrings}
        locale={locale}
        chains={active.map((c) => ({
          key: c.key,
          id: c.evmChainId,
          name: t(`chains.${c.key}`),
          coin: c.nativeSymbol,
        }))}
        paths={{
          address: localePath(locale, "/address"),
          token: localePath(locale, "/token"),
          tx: localePath(locale, "/tx"),
        }}
      />
    </div>
  );
}
