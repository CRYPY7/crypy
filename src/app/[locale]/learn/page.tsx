import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GuideCard } from "@/components/learn/guide-card";
import { guideCards } from "@/components/learn/cards";
import { GuideGrid } from "@/components/learn/guide-grid";
import { UniversalSearch } from "@/components/search/universal-search";
import { getSearchStrings } from "@/components/search/search-strings";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/config/env";
import { featuredGuide, learnTopics } from "@/content/learn";
import { isLocale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { localePath } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("learn");
  return { title: { absolute: t("seoTitle") }, description: t("seoDescription"), ...pageAlternates(locale, "/learn") };
}

export default async function LearnPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const [cards, searchStrings] = await Promise.all([guideCards(locale), getSearchStrings()]);
  const featured = cards.find((card) => card.slug === featuredGuide);
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: t("learn.seoTitle"),
            description: t("learn.seoDescription"),
            url: url("/learn"),
            inLanguage: locale,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: cards.length,
              itemListElement: cards.map((card, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: card.title,
                url: url(`/learn/${card.slug}`),
              })),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
              { "@type": "ListItem", position: 2, name: t("nav.learn"), item: url("/learn") },
            ],
          },
        ]}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[{ label: t("nav.home"), href: localePath(locale) }, { label: t("nav.learn") }]}
      />
      <header className="mt-5 max-w-3xl">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{t("learn.title")}</h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">{t("learn.intro")}</p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {featured && (
          <section aria-labelledby="start-here" className="flex flex-col gap-2">
            <h2 id="start-here" className="text-xs font-bold tracking-wider text-primary uppercase">
              {t("learn.startHere")}
            </h2>
            <GuideCard guide={featured} large />
          </section>
        )}
        <section aria-labelledby="check-now" className="flex flex-col gap-3 self-end rounded-2xl border bg-card p-5">
          <h2 id="check-now" className="font-sans text-base font-semibold">
            {t("learn.checkNowTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("learn.checkNowText")}</p>
          <UniversalSearch
            locale={locale}
            variant="compact"
            formLabel={t("learn.checkNowTitle")}
            strings={{ ...searchStrings, placeholder: t("search.compactPlaceholder") }}
          />
          <p className="text-xs text-muted-foreground">{t("learn.guideCount", { count: cards.length })}</p>
        </section>
      </div>

      <section aria-labelledby="all-guides" className="mt-10">
        <h2 id="all-guides" className="mb-4 text-xl font-semibold">
          {t("learn.allGuidesHeading")}
        </h2>
        <GuideGrid
          // The "Start here" guide is already shown above; the topic filter still finds it.
          guides={cards}
          featured={featuredGuide}
          topics={learnTopics.map((id) => ({ id, label: t(`learn.topics.${id}`) }))}
          allLabel={t("learn.allTopics")}
          groupLabel={t("learn.topicsLabel")}
        />
      </section>
    </div>
  );
}
