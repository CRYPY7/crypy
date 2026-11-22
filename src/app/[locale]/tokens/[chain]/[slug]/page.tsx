import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ChainIcon } from "@/components/chain-icon";
import { CopyButton } from "@/components/entity/copy-button";
import { TokenSecurityReportView } from "@/components/entity/token-security";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button-variants";
import { siteUrl } from "@/config/env";
import { getGuide } from "@/content/learn";
import { allCuratedTokens, chainKeyFromSlug, chainSlugs, curatedTokens, findCuratedToken } from "@/config/seo-pages";
import { isLocale, type Locale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { learnPath, localePath } from "@/lib/routes";
import { formatTax, measuredTaxes, sellStatus } from "@/lib/token-checks/summary";
import { savedCheck } from "@/server/services/token-checks";

/** One curated token's saved daily security check (SEO Phase 3, boards 49–50). */
export function generateStaticParams() {
  return allCuratedTokens().map((token) => ({ chain: chainSlugs[token.chain]!, slug: token.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tokens/[chain]/[slug]">): Promise<Metadata> {
  const [{ chain: chainSlug, slug }, locale] = await Promise.all([params, localeParam()]);
  const chain = chainKeyFromSlug(chainSlug);
  const token = chain ? findCuratedToken(chain, slug) : undefined;
  if (!isLocale(locale) || !chain || !token) return {};
  const t = await getTranslations();
  const values = { symbol: token.symbol, chain: t(`chains.${chain}`) };
  return {
    title: { absolute: t("tokenChecks.page.seoTitle", values) },
    description: t("tokenChecks.page.seoDescription", values),
    ...pageAlternates(locale, `/tokens/${chainSlug}/${slug}`),
  };
}

export default async function TokenCheckPage({ params }: PageProps<"/[locale]/tokens/[chain]/[slug]">) {
  const [{ chain: chainSlug, slug }, locale] = await Promise.all([params, localeParam()]);
  const chain = chainKeyFromSlug(chainSlug);
  const token = chain ? findCuratedToken(chain, slug) : undefined;
  if (!isLocale(locale) || !chain || !token) notFound();
  const t = await getTranslations();
  const chainName = t(`chains.${chain}`);
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
            { "@type": "ListItem", position: 2, name: t("tokenChecks.title"), item: url("/tokens") },
            {
              "@type": "ListItem",
              position: 3,
              name: `${token.symbol} · ${chainName}`,
              item: url(`/tokens/${chainSlug}/${slug}`),
            },
          ],
        }}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("tokenChecks.title"), href: localePath(locale, "/tokens") },
          { label: `${token.symbol} · ${chainName}` },
        ]}
      />
      <Suspense fallback={<div aria-hidden="true" className="min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
        <SavedReport locale={locale} chain={chain} address={token.address} symbol={token.symbol} />
      </Suspense>
    </div>
  );
}

async function SavedReport({
  locale,
  chain,
  address,
  symbol,
}: {
  locale: Locale;
  chain: string;
  address: string;
  symbol: string;
}) {
  // The saved check changes once a day: read per request (a quick database read; nothing is checked here).
  await connection();
  const t = await getTranslations();
  const chainName = t(`chains.${chain}`);
  const live = localePath(locale, `/token/${chain}/${address}`);
  const check = await savedCheck(chain, address).catch(() => null);

  if (!check) {
    return (
      <>
        {/* Nothing saved yet: kept out of search until the first check exists (React moves this tag into <head>). */}
        <meta name="robots" content="noindex, follow" />
        <h1 className="mt-4 text-3xl font-bold">{t("tokenChecks.page.pendingTitle", { symbol, chain: chainName })}</h1>
        <div role="status" className="mt-6 flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <h2 className="font-sans text-lg font-semibold">{t("tokenChecks.page.preparingTitle")}</h2>
          <p className="text-muted-foreground">{t("tokenChecks.page.preparingText", { symbol, chain: chainName })}</p>
          <Link href={live} className={buttonVariants({ size: "md", className: "self-start" })}>
            {t("tokenChecks.page.fresh")}
          </Link>
        </div>
      </>
    );
  }

  const { report } = check;
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const taxes = measuredTaxes(report);
  const sell = sellStatus(report);
  const values = { symbol };
  const faq = [
    {
      q: t("tokenChecks.page.sellQ", values),
      a:
        sell === "yes"
          ? t("tokenChecks.page.sellOk", values)
          : sell === "no"
            ? t("tokenChecks.page.sellNo")
            : t("tokenChecks.page.sellUnchecked", values),
    },
    {
      q: t("tokenChecks.page.taxQ", values),
      a: taxes
        ? t("tokenChecks.page.taxA", {
            buy: formatTax(taxes.buy, locale),
            sell: formatTax(taxes.sell, locale),
            transfer: formatTax(taxes.transfer, locale),
          })
        : t("tokenChecks.page.taxNone"),
    },
    {
      q: t("tokenChecks.page.safeQ", values),
      a: t("tokenChecks.page.safeA", {
        level: t(`entity.tokenSecurity.level.${report.level}`),
        high: report.counts.high + report.counts.critical,
        medium: report.counts.medium,
      }),
    },
  ];
  const others = (curatedTokens[chain] ?? [])
    .filter((other) => other.address !== check.report.facts.address)
    .slice(0, 4);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">
            {t("tokenChecks.page.title", { name: report.facts.token.name, symbol })}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <ChainIcon chain={chain} size={18} />
            <span>{chainName}</span>
            <span aria-hidden="true">·</span>
            <span className="technical" dir="ltr">
              {report.facts.address}
            </span>
            <CopyButton value={report.facts.address} label={t("entity.copy")} copiedLabel={t("entity.copied")} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("tokenChecks.page.checked", { time: time.format(check.checkedAt) })}
          </p>
        </div>
        <Link href={live} className={buttonVariants({ size: "xl", className: "shrink-0" })}>
          {t("tokenChecks.page.fresh")}
        </Link>
      </header>

      <div className="mt-6">
        <TokenSecurityReportView report={report} chainKey={chain} locale={locale} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="about-check" className="flex flex-col gap-2">
            <h2 id="about-check" className="text-2xl font-bold">
              {t("tokenChecks.page.aboutTitle")}
            </h2>
            <p className="leading-relaxed">{t("tokenChecks.page.about", { symbol, chain: chainName })}</p>
          </section>
          <section aria-labelledby="check-questions" className="flex flex-col gap-2">
            <h2 id="check-questions" className="mt-4 mb-2 text-2xl font-bold">
              {t("tokenChecks.page.questions")}
            </h2>
            {faq.map((item) => (
              <details key={item.q} className="rounded-xl border bg-card px-4 py-3">
                <summary className="cursor-pointer font-medium">{item.q}</summary>
                <p className="mt-2 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </section>
        </div>
        <div className="flex flex-col gap-6">
          <section aria-labelledby="check-learn" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
            <h2 id="check-learn" className="font-sans text-base font-semibold">
              {t("tokenChecks.page.learn")}
            </h2>
            {(["check-token-scam", "liquidity-lock"] as const).map((guide) => (
              <Link key={guide} href={learnPath(locale, guide)} className="text-sm text-primary hover:underline">
                {getGuide(guide, locale)?.title} <span aria-hidden="true">→</span>
              </Link>
            ))}
          </section>
          <section aria-labelledby="check-related" className="flex flex-col gap-2">
            <h2 id="check-related" className="font-sans text-base font-semibold">
              {t("tokenChecks.page.related", { chain: chainName })}
            </h2>
            <ul className="flex flex-col gap-2">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={localePath(locale, `/tokens/${chainSlugs[chain]}/${other.slug}`)}
                    className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 font-medium hover:border-border-strong"
                  >
                    {other.symbol}
                    <span aria-hidden="true" className="ms-auto text-muted-foreground rtl:-scale-x-100">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={localePath(locale, "/tokens")} className="text-sm text-primary hover:underline">
              {t("tokenChecks.page.allChecks")} <span aria-hidden="true">→</span>
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
