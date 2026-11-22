import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/config/env";
import { localePath } from "@/lib/routes";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { ToolsGrid } from "@/components/tools/tools-grid";
import { isLocale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { getCategoryLabels, getToolViews } from "@/lib/tools-view";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("seo");
  return {
    title: { absolute: t("toolsTitle") },
    description: t("toolsDescription"),
    ...pageAlternates(locale, "/tools"),
  };
}

export default async function ToolsPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const [tools, categories] = await Promise.all([getToolViews(locale), getCategoryLabels()]);
  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: t("seo.toolsTitle"),
          description: t("seo.toolsDescription"),
          url: url("/tools"),
          inLanguage: locale,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: tools.length,
            itemListElement: tools.map((tool, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: t(`tools.${tool.id}.name`),
              url: url(`/tools/${tool.id}`),
            })),
          },
        }}
      />
      <h1 className="text-3xl font-bold sm:text-4xl">{t("toolsDialog.title")}</h1>
      <p className="mt-2 mb-8 text-muted-foreground">{t("toolsDialog.description")}</p>
      <ToolsGrid
        tools={tools}
        categories={categories}
        strings={{
          all: t("categories.all"),
          filterLabel: t("home.allTools.filterLabel"),
          youNeed: t("common.youNeed"),
          open: t("common.open"),
        }}
      />
    </div>
  );
}
