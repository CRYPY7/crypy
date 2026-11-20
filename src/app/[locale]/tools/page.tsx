import type { Metadata } from "next";
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
  const t = await getTranslations("toolsDialog");
  return { title: t("title"), description: t("description"), ...pageAlternates(locale, "/tools") };
}

export default async function ToolsPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const [tools, categories] = await Promise.all([getToolViews(locale), getCategoryLabels()]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
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
