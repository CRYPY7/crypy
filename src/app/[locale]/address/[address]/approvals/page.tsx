import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { AddressTabs } from "@/components/entity/address-tabs";
import type { ApprovalsStrings } from "@/components/entity/approvals-shared";
import { ApprovalsView } from "@/components/entity/approvals-view";
import { ChainScopeBar } from "@/components/entity/chain-scope";
import { EntityHeader, EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { RecordVisit } from "@/components/recent/recent";
import { getChain, liveChains } from "@/config/chains";
import { isLocale } from "@/i18n/locales";
import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { pageRequestAllowed } from "@/server/page-guard";
import { cachedApprovals } from "@/server/services/approvals";
import { chainScopeFor } from "@/server/services/chain-scope";
import { cachedResolve, explorerLink } from "@/server/services/lookups";

type Props = PageProps<"/[locale]/address/[address]/approvals">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const t = await getTranslations("entity.approvals");
  return { title: t("metaTitle", { short: shortenId(address) }), robots: { index: false, follow: false } };
}

export default function ApprovalsPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <ApprovalsContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ApprovalsContent({
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
          href={localePath(locale, `/address/${address.toLowerCase()}/approvals`)}
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

  const scope = await chainScopeFor(result.address, "approvals", query.chains);
  const report = await cachedApprovals(result.address, scope.scan);
  const basePath = localePath(locale, `/address/${result.address}`);
  const links = result.lookups.flatMap((lookup) => {
    const chain = getChain(lookup.chain);
    const href = explorerLink(lookup.chain, "address", result.address);
    return chain && href ? [{ href, label: t("entity.viewOn", { explorer: chain.explorer.name }) }] : [];
  });

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("entity.address.title"), href: basePath },
          { label: shortenId(result.address), mono: true, href: basePath },
          { label: t("entity.approvals.title") },
        ]}
      />
      <RecordVisit path={`/address/${result.address}`} kind="address" value={result.address} />
      <EntityHeader
        title={t("entity.approvals.title")}
        id={result.address}
        copyLabel={t("entity.copy")}
        copiedLabel={t("entity.copied")}
        links={links}
      >
        <p className="max-w-3xl text-sm text-muted-foreground">{t("entity.approvals.intro")}</p>
      </EntityHeader>
      <AddressTabs
        basePath={basePath}
        current="approvals"
        chains={typeof query.chains === "string" ? query.chains : undefined}
        labels={t.raw("entity.tabs") as { label: string; overview: string; approvals: string; activity: string }}
        approvalsCount={report.summary.total}
      />
      <ChainScopeBar scope={scope} path={`${basePath}/approvals`} safety />
      <ApprovalsView
        report={report}
        strings={t.raw("entity.approvals.ui") as ApprovalsStrings}
        locale={locale}
        chains={liveChains
          .filter((c) => c.capabilities.approvals)
          .map((c) => ({
            key: c.key,
            id: Number(c.caip2.split(":")[1]),
            name: t(`chains.${c.key}`),
            coin: c.nativeSymbol,
          }))}
        tokenPath={localePath(locale, "/token")}
        addressPath={localePath(locale, "/address")}
      />
    </div>
  );
}
