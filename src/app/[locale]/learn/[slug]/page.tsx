import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { CircleAlert, Lightbulb } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ApprovalFigure } from "@/components/learn/approval-figure";
import { guideCards } from "@/components/learn/cards";
import { GuideCard, TopicTag } from "@/components/learn/guide-card";
import { InlineText, plainText } from "@/components/learn/inline-text";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button-variants";
import { siteUrl } from "@/config/env";
import { getGuide } from "@/content/learn";
import { guideSlugs } from "@/content/learn/slugs";
import type { LearnBlock } from "@/content/learn/types";
import { isLocale, type Locale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { learnPath, localePath, toolPath } from "@/lib/routes";

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/learn/[slug]">): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, localeParam()]);
  if (!isLocale(locale)) return {};
  const guide = getGuide(slug, locale);
  if (!guide) return {};
  const alternates = pageAlternates(locale, `/learn/${slug}`);
  return {
    title: { absolute: guide.seoTitle },
    description: guide.description,
    ...alternates,
    // An English fallback on another language's address stays out of search (the English page is the one to index).
    robots: guide.translated ? alternates.robots : { index: false, follow: true },
    openGraph: { type: "article", publishedTime: guide.published, modifiedTime: guide.updated },
  };
}

export default async function GuidePage({ params }: PageProps<"/[locale]/learn/[slug]">) {
  const [{ slug }, locale] = await Promise.all([params, localeParam()]);
  if (!isLocale(locale)) notFound();
  const guide = getGuide(slug, locale);
  if (!guide) notFound();
  const t = await getTranslations();
  const cards = await guideCards(locale);
  const related = guide.related.map((other) => cards.find((card) => card.slug === other)).filter((card) => !!card);
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(guide.updated),
  );
  const toolName = guide.tool ? t(`tools.${guide.tool}.name`) : null;
  const toolHref = guide.tool ? toolPath(locale, guide.tool) : localePath(locale, "/tools");
  const toc = [...guide.sections.map((section) => ({ id: section.id, label: section.heading }))];
  if (guide.faq.length > 0) toc.push({ id: "questions", label: t("learn.questions") });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            datePublished: guide.published,
            dateModified: guide.updated,
            inLanguage: guide.translated ? locale : "en",
            mainEntityOfPage: url(`/learn/${slug}`),
            image: url(`/learn/${slug}/opengraph-image`),
            author: { "@type": "Organization", name: t("meta.siteName"), url: siteUrl.toString() },
            publisher: {
              "@type": "Organization",
              name: t("meta.siteName"),
              logo: { "@type": "ImageObject", url: new URL("/icons/icon-512.png", siteUrl).toString() },
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
              { "@type": "ListItem", position: 2, name: t("nav.learn"), item: url("/learn") },
              { "@type": "ListItem", position: 3, name: guide.title, item: url(`/learn/${slug}`) },
            ],
          },
          ...(guide.faq.length > 0
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: guide.faq.map((item) => ({
                    "@type": "Question",
                    name: plainText(item.q),
                    acceptedAnswer: { "@type": "Answer", text: plainText(item.a) },
                  })),
                },
              ]
            : []),
        ]}
      />
      <Breadcrumbs
        label={t("nav.breadcrumb")}
        items={[
          { label: t("nav.home"), href: localePath(locale) },
          { label: t("nav.learn"), href: learnPath(locale) },
          { label: guide.title },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,46rem)_18rem] lg:gap-14">
        <article className="flex min-w-0 flex-col gap-4" lang={guide.translated ? undefined : "en"}>
          {!guide.translated && (
            <p role="note" className="rounded-lg border border-high/40 p-3 text-sm">
              {t("learn.notTranslated")}
            </p>
          )}
          <TopicTag topic={guide.topic} label={t(`learn.topics.${guide.topic}`)} />
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{guide.title}</h1>
          <p className="text-lg text-muted-foreground">{guide.description}</p>
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span>{t("learn.byline")}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={guide.updated}>{t("learn.updated", { date: updated })}</time>
            <span aria-hidden="true">·</span>
            <span>{t("learn.readTime", { minutes: guide.minutes })}</span>
          </p>

          <section aria-labelledby="in-short" className="rounded-2xl border border-border-strong bg-card p-5">
            <h2 id="in-short" className="font-sans text-sm font-bold tracking-wider text-primary uppercase">
              {t("learn.inShort")}
            </h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5">
              {guide.inShort.map((point) => (
                <li key={point}>
                  <InlineText text={point} locale={locale} guides={guideSlugs} />
                </li>
              ))}
            </ul>
          </section>

          <details className="rounded-xl border bg-card px-4 py-3 lg:hidden">
            <summary className="cursor-pointer font-semibold">{t("learn.onThisPage")}</summary>
            <TableOfContents items={toc} label={t("learn.onThisPage")} />
          </details>

          {guide.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="flex flex-col gap-4">
              <h2 id={section.id} className="mt-6 scroll-mt-24 text-2xl font-bold">
                {section.heading}
              </h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} locale={locale} />
              ))}
            </section>
          ))}

          {guide.faq.length > 0 && (
            <section aria-labelledby="questions" className="flex flex-col gap-2">
              <h2 id="questions" className="mt-6 mb-2 scroll-mt-24 text-2xl font-bold">
                {t("learn.questions")}
              </h2>
              {guide.faq.map((item) => (
                <details key={item.q} className="rounded-xl border bg-card px-4 py-3">
                  <summary className="cursor-pointer font-medium">{item.q}</summary>
                  <p className="mt-2 text-muted-foreground">
                    <InlineText text={item.a} locale={locale} guides={guideSlugs} />
                  </p>
                </details>
              ))}
            </section>
          )}

          <section
            aria-labelledby="guide-cta"
            className="mt-6 flex flex-col gap-4 rounded-2xl border border-primary/40 bg-primary/8 p-5 sm:flex-row sm:items-center"
          >
            <div className="flex flex-1 flex-col gap-1">
              <h2 id="guide-cta" className="font-sans text-lg font-semibold">
                {toolName ? t("learn.ctaTitle", { tool: toolName }) : t("learn.ctaAllTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {guide.tool ? t(`tools.${guide.tool}.description`) : t("learn.ctaAllText")}
              </p>
            </div>
            <Link href={toolHref} className={buttonVariants({ size: "xl" })}>
              {toolName ? t("learn.ctaButton", { tool: toolName }) : t("learn.ctaAllButton")}
            </Link>
          </section>

          {related.length > 0 && (
            <section aria-labelledby="related-guides" className="mt-6">
              <h2 id="related-guides" className="mb-4 text-xl font-semibold">
                {t("learn.relatedGuides")}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {related.map((card) => (
                  <li key={card.slug}>
                    <GuideCard guide={card} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <div className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-6">
            <nav aria-label={t("learn.onThisPage")}>
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t("learn.onThisPage")}
              </p>
              <TableOfContents items={toc} label={t("learn.onThisPage")} bare />
            </nav>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <p className="font-semibold">{toolName ?? t("learn.ctaAllTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {guide.tool ? t(`tools.${guide.tool}.description`) : t("learn.ctaAllText")}
              </p>
              <Link href={toolHref} className={buttonVariants({ size: "md" })}>
                {toolName ? t("learn.ctaButton", { tool: toolName }) : t("learn.ctaAllButton")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableOfContents({
  items,
  label,
  bare = false,
}: {
  items: { id: string; label: string }[];
  label: string;
  bare?: boolean;
}) {
  const list = (
    <ol className="flex flex-col border-s">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="-ms-px block border-s-2 border-transparent py-1.5 ps-3 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );
  return bare ? (
    list
  ) : (
    <nav aria-label={label} className="mt-3">
      {list}
    </nav>
  );
}

function Block({ block, locale }: { block: LearnBlock; locale: Locale }) {
  const inline = (text: string) => <InlineText text={text} locale={locale} guides={guideSlugs} />;
  switch (block.type) {
    case "p":
      return <p className="text-base leading-relaxed sm:text-[1.0625rem]">{inline(block.text)}</p>;
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed">
          {block.items.map((item) => (
            <li key={item}>{inline(item)}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {block.items.map((item, index) => (
            <li key={item} className="flex items-start gap-3 leading-relaxed">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/14 text-sm font-bold text-primary"
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{inline(item)}</span>
            </li>
          ))}
        </ol>
      );
    case "warning":
      return (
        <p role="note" className="flex gap-3 rounded-xl border border-high/40 bg-high/8 p-4 leading-relaxed">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-high" aria-hidden="true" />
          <span>{inline(block.text)}</span>
        </p>
      );
    case "tip":
      return (
        <p className="flex gap-3 rounded-xl border bg-card p-4 leading-relaxed">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <span>{inline(block.text)}</span>
        </p>
      );
    case "figure":
      return (
        <figure className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <ApprovalFigure labels={block.labels} alt={block.alt} />
          <figcaption className="text-sm text-muted-foreground">{block.caption}</figcaption>
        </figure>
      );
  }
}
