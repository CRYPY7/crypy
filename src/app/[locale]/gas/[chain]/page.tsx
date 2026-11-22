import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ChainIcon } from "@/components/chain-icon";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { getChain, liveChains } from "@/config/chains";
import { siteUrl } from "@/config/env";
import { chainKeyFromSlug, chainSlugs } from "@/config/seo-pages";
import { isLocale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { learnPath, localePath, toolPath } from "@/lib/routes";
import { GasTrackerWorkspace } from "@/modules/tools/gas-tracker/workspace";

/** Gas price pages per chain (SEO Phase 3, boards 46–47): /gas/ethereum, /gas/bnb-chain, … */
const gasChains = () => liveChains.filter((chain) => chain.capabilities.fees && chainSlugs[chain.key]);

export function generateStaticParams() {
  return gasChains().map((chain) => ({ chain: chainSlugs[chain.key]! }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/gas/[chain]">): Promise<Metadata> {
  const [{ chain: slug }, locale] = await Promise.all([params, localeParam()]);
  const key = chainKeyFromSlug(slug);
  if (!isLocale(locale) || !key) return {};
  const t = await getTranslations();
  return {
    title: { absolute: t("gasChain.seoTitle", { chain: t(`chains.${key}`) }) },
    description: t(`gasChain.chains.${key}.description`),
    ...pageAlternates(locale, `/gas/${slug}`),
  };
}

export default async function GasChainPage({ params }: PageProps<"/[locale]/gas/[chain]">) {
  const [{ chain: slug }, locale] = await Promise.all([params, localeParam()]);
  const key = chainKeyFromSlug(slug);
  const chain = key ? getChain(key) : undefined;
  if (!isLocale(locale) || !key || !chain?.capabilities.fees) notFound();
  const t = await getTranslations();
  const name = t(`chains.${key}`);
  const how = t.raw(`gasChain.chains.${key}.how`) as string[];
  const faq = t.raw(`gasChain.chains.${key}.faq`) as { q: string; a: string }[];
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();
  const others = gasChains().filter((other) => other.key !== key);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
              { "@type": "ListItem", position: 2, name: t("tools.gas-tracker.name"), item: url("/tools/gas-tracker") },
              { "@type": "ListItem", position: 3, name, item: url(`/gas/${slug}`) },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          },
        ]}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("tools.gas-tracker.name"), href: toolPath(locale, "gas-tracker") },
          { label: name },
        ]}
      />
      <header className="mt-4 flex items-center gap-4">
        <ChainIcon chain={key} size={48} className="shrink-0" />
        <div>
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{t("gasChain.title", { chain: name })}</h1>
          <p className="mt-1 text-muted-foreground">{t("gasChain.intro")}</p>
        </div>
      </header>

      <section className="mt-6" aria-label={t("gasChain.title", { chain: name })}>
        <Suspense fallback={<div aria-hidden="true" className="min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
          <GasTrackerWorkspace locale={locale} only={key} />
        </Suspense>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="how-gas" className="flex flex-col gap-3">
            <h2 id="how-gas" className="text-2xl font-bold">
              {t("gasChain.howTitle", { chain: name })}
            </h2>
            {how.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
            <Link href={learnPath(locale, "gas-fees")} className="font-semibold text-primary hover:underline">
              {t("gasChain.guideLink")} <span aria-hidden="true">→</span>
            </Link>
          </section>
          <section aria-labelledby="gas-questions" className="mt-4 flex flex-col gap-2">
            <h2 id="gas-questions" className="mb-2 text-2xl font-bold">
              {t("gasChain.questions")}
            </h2>
            {faq.map((item) => (
              <details key={item.q} className="rounded-xl border bg-card px-4 py-3">
                <summary className="cursor-pointer font-medium">{item.q}</summary>
                <p className="mt-2 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </section>
        </div>
        <section aria-labelledby="other-chains" className="flex flex-col gap-2">
          <h2 id="other-chains" className="mb-1 font-sans text-base font-semibold">
            {t("gasChain.otherChains")}
          </h2>
          <ul className="flex flex-col gap-2">
            {others.map((other) => (
              <li key={other.key}>
                <Link
                  href={localePath(locale, `/gas/${chainSlugs[other.key]}`)}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:border-border-strong"
                >
                  <ChainIcon chain={other.key} size={24} className="shrink-0" />
                  <span className="font-medium">{t("gasChain.title", { chain: t(`chains.${other.key}`) })}</span>
                  <span aria-hidden="true" className="ms-auto text-muted-foreground rtl:-scale-x-100">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={toolPath(locale, "gas-tracker")}
            className="mt-2 rounded-xl border px-4 py-3 text-center font-semibold hover:border-border-strong"
          >
            {t("gasChain.compareAll")}
          </Link>
        </section>
      </div>
    </div>
  );
}
