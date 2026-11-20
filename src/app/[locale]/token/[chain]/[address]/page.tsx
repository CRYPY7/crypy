import { shortenId } from "@/lib/format/amount";
import type { Metadata } from "next";
import { RecordVisit } from "@/components/recent/recent";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ChainIcon } from "@/components/chain-icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getAddress } from "viem";
import { EntityHeader, EntitySkeleton, FactList, Notice } from "@/components/entity/entity-parts";
import { getChain } from "@/config/chains";
import { isLocale } from "@/i18n/locales";
import { looksLikeLink } from "@/lib/chains/sanitize";
import { formatAmount } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { OtherChains } from "@/components/entity/other-chains";
import { pageRequestAllowed } from "@/server/page-guard";
import { cachedTokenLookup, explorerLink } from "@/server/services/lookups";

type Props = PageProps<"/[locale]/token/[chain]/[address]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chain: chainKey, address } = await params;
  const chain = getChain(chainKey);
  const t = await getTranslations();
  const lookup = chain ? await cachedTokenLookup(chain.key, address).catch(() => null) : null;
  const symbol = lookup?.token?.symbol || t("entity.token.unnamed");
  // Token pages become indexable for curated tokens in M5; until then none are indexed.
  return {
    title: t("entity.token.metaTitle", { symbol, chain: chain ? t(`chains.${chain.key}`) : chainKey }),
    robots: { index: false, follow: false },
  };
}

export default function TokenPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <TokenContent params={params} />
      </Suspense>
    </div>
  );
}

async function TokenContent({ params }: { params: Props["params"] }) {
  const [{ chain: chainKey, address }, locale] = await Promise.all([params, localeParam()]);
  const chain = getChain(chainKey);
  if (!isLocale(locale) || !chain) notFound();
  const t = await getTranslations();

  if (!(await pageRequestAllowed())) return <Notice tone="warning">{t("entity.rateLimited")}</Notice>;

  let lookup;
  try {
    lookup = await cachedTokenLookup(chain.key, address);
  } catch {
    return <Notice tone="warning">{t("search.result.unavailable")}</Notice>;
  }
  if (!lookup) notFound();

  const chainName = t(`chains.${chain.key}`);
  if (lookup.kind !== "token" || !lookup.token) {
    return (
      <Notice tone="warning">
        {t("entity.token.notToken", { chain: chainName })}{" "}
        <Link href={localePath(locale, `/address/${address}`)} className="font-semibold text-primary hover:underline">
          {t("entity.token.viewAsAddress")}
        </Link>
      </Notice>
    );
  }

  const token = lookup.token;
  const checksummed = getAddress(address.toLowerCase());
  const explorer = explorerLink(chain.key, "token", checksummed);
  const suspiciousName = looksLikeLink(token.name) || looksLikeLink(token.symbol);

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: chainName },
          { label: token.symbol || shortenId(checksummed) },
        ]}
      />
      <RecordVisit
        path={`/token/${chain.key}/${checksummed}`}
        kind="token"
        value={checksummed}
        chain={chain.key}
        label={token.symbol ? token.symbol.slice(0, 12) : undefined}
      />
      <EntityHeader
        eyebrow={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 font-medium text-foreground">
              <ChainIcon chain={chain.key} size={14} />
              {chainName}
            </span>
            <span>{t("entity.kinds.token")}</span>
          </>
        }
        title={
          <>
            <bdi>{token.name || t("entity.token.unnamed")}</bdi>{" "}
            <span className="text-muted-foreground">
              (<bdi>{token.symbol}</bdi>)
            </span>
          </>
        }
        id={checksummed}
        copyLabel={t("entity.copy")}
        copiedLabel={t("entity.copied")}
        links={explorer ? [{ href: explorer, label: t("entity.viewOn", { explorer: chain.explorer.name }) }] : []}
      />

      <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-muted" />}>
        <OtherChains address={checksummed} current={chain.key} locale={locale} />
      </Suspense>

      {suspiciousName && (
        <Notice tone="danger" title={t("entity.token.linkWarningTitle")}>
          {t("entity.token.linkWarning")}
        </Notice>
      )}

      <section aria-labelledby="facts" className="rounded-xl border bg-card p-5">
        <h2 id="facts" className="mb-4 font-sans text-lg font-semibold">
          {t("entity.token.facts")}
        </h2>
        <FactList
          items={[
            {
              label: t("entity.token.totalSupply"),
              value: (
                <span className="technical">
                  {formatAmount(token.totalSupply.raw, token.decimals, locale, 2)} <bdi>{token.symbol}</bdi>
                </span>
              ),
            },
            { label: t("entity.token.decimals"), value: <span className="technical">{token.decimals}</span> },
            { label: t("entity.token.contract"), value: <span className="technical text-sm">{checksummed}</span> },
          ]}
        />
        <Link
          href={localePath(locale, `/address/${checksummed}`)}
          className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
        >
          {t("entity.token.viewAsAddress")}
        </Link>
      </section>

      <Notice title={t("entity.comingSoonTitle")}>{t("entity.token.comingSoon")}</Notice>
    </div>
  );
}
