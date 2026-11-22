import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ChainIcon } from "@/components/chain-icon";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { UniversalSearch } from "@/components/search/universal-search";
import { getSearchStrings } from "@/components/search/search-strings";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/config/env";
import { chainSlugs, curatedTokens } from "@/config/seo-pages";
import { isLocale, type Locale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { localePath } from "@/lib/routes";
import { formatTax, levelTone, measuredTaxes, sellStatus } from "@/lib/token-checks/summary";
import { cn } from "@/lib/utils";
import { allSavedChecks, checkId, type SavedCheck } from "@/server/services/token-checks";

/** The list of daily token checks (SEO Phase 3, board 48). */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("tokenChecks");
  return { title: { absolute: t("seoTitle") }, description: t("seoDescription"), ...pageAlternates(locale, "/tokens") };
}

export default async function TokenChecksPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const searchStrings = await getSearchStrings();
  const chains = Object.keys(curatedTokens);
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
            { "@type": "ListItem", position: 2, name: t("tokenChecks.title"), item: url("/tokens") },
          ],
        }}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[{ label: t("nav.home"), href: localePath(locale) }, { label: t("tokenChecks.title") }]}
      />
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-end">
        <header>
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{t("tokenChecks.title")}</h1>
          <p className="mt-3 text-muted-foreground sm:text-lg">{t("tokenChecks.intro")}</p>
        </header>
        <section aria-labelledby="check-any" className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 id="check-any" className="font-sans text-sm font-semibold">
            {t("tokenChecks.checkAny")}
          </h2>
          <UniversalSearch
            locale={locale}
            variant="compact"
            formLabel={t("tokenChecks.checkAny")}
            strings={{ ...searchStrings, placeholder: t("search.compactPlaceholder") }}
          />
        </section>
      </div>
      <nav aria-label={t("tokenChecks.chainsLabel")} className="mt-6 flex flex-wrap gap-2">
        {chains.map((chain) => (
          <a
            key={chain}
            href={`#${chainSlugs[chain]}`}
            className="flex min-h-10 items-center gap-2 rounded-full border bg-card px-4 text-sm hover:border-border-strong"
          >
            <ChainIcon chain={chain} size={18} />
            {t(`chains.${chain}`)}
          </a>
        ))}
      </nav>
      <Suspense fallback={<div aria-hidden="true" className="mt-6 min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
        <ChecksTables locale={locale} />
      </Suspense>
      <p className="mt-6 text-sm text-muted-foreground">{t("tokenChecks.selection")}</p>
    </div>
  );
}

async function ChecksTables({ locale }: { locale: Locale }) {
  // Saved checks change during the day: read them per request (a quick database read; nothing is checked here).
  await connection();
  const t = await getTranslations();
  const saved = new Map<string, SavedCheck>();
  for (const check of await allSavedChecks().catch(() => [])) {
    saved.set(checkId(check.chain, check.report.facts.address), check);
  }
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  return (
    <div className="mt-6 flex flex-col gap-8">
      {Object.entries(curatedTokens).map(([chain, tokens]) => (
        <section key={chain} id={chainSlugs[chain]} aria-labelledby={`chain-${chain}`} className="scroll-mt-24">
          <h2 id={`chain-${chain}`} className="mb-3 flex items-center gap-2 text-xl font-semibold">
            <ChainIcon chain={chain} size={22} />
            {t(`chains.${chain}`)}
          </h2>
          <div
            role="group"
            aria-labelledby={`chain-${chain}`}
            tabIndex={0}
            className="overflow-x-auto rounded-xl border bg-card"
          >
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t("tokenChecks.colToken")}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t("tokenChecks.colResult")}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t("tokenChecks.colSell")}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t("tokenChecks.colTax")}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                    {t("tokenChecks.colChecked")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => {
                  const check = saved.get(checkId(chain, token.address));
                  const href = localePath(locale, `/tokens/${chainSlugs[chain]}/${token.slug}`);
                  const taxes = check ? measuredTaxes(check.report) : null;
                  const sell = check ? sellStatus(check.report) : null;
                  return (
                    <tr key={token.slug} className="border-t">
                      <td className="px-4 py-3">
                        <Link href={href} className="flex flex-col hover:text-primary">
                          <span className="font-semibold">{token.symbol}</span>
                          {check && (
                            <span className="text-xs text-muted-foreground">{check.report.facts.token.name}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {check ? (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
                              levelTone[check.report.level],
                            )}
                          >
                            {t(`entity.tokenSecurity.level.${check.report.level}`)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("tokenChecks.pending")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {sell === null
                          ? "—"
                          : t(
                              {
                                yes: "tokenChecks.sellYes",
                                no: "tokenChecks.sellNo",
                                "no-pool": "tokenChecks.sellNoPool",
                                unchecked: "tokenChecks.sellUnchecked",
                              }[sell],
                            )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {!check
                          ? "—"
                          : taxes
                            ? t("tokenChecks.tax", {
                                buy: formatTax(taxes.buy, locale),
                                sell: formatTax(taxes.sell, locale),
                              })
                            : t("tokenChecks.notMeasured")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {check ? time.format(check.checkedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
