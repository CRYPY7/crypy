import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import { chainSlugs } from "@/config/seo-pages";
import { localePath } from "@/lib/routes";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { ToolPage, toolMetadata } from "@/components/tools/tool-page";
import { getTool } from "@/config/tools";
import { isLocale } from "@/i18n/locales";
import { GasTrackerWorkspace } from "@/modules/tools/gas-tracker/workspace";

const ID = "gas-tracker";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  return isLocale(locale) ? toolMetadata(ID, locale) : {};
}

export default async function Page() {
  const locale = await localeParam();
  const tool = getTool(ID);
  if (!tool || !isLocale(locale)) notFound();
  const t = await getTranslations();
  return (
    <ToolPage tool={tool} locale={locale} wide>
      {/* Live fees: rendered per request (cached ~10 s), so the static page never shows old numbers. */}
      {/* At least one screen tall, so the text below doesn't jump when the fees arrive. */}
      <Suspense fallback={<div aria-hidden="true" className="min-h-[100svh] animate-pulse rounded-xl bg-muted" />}>
        <GasTrackerWorkspace locale={locale} />
      </Suspense>
      <nav aria-label={t("gasChain.byChain")} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{t("gasChain.byChain")}</span>
        {liveChains
          .filter((chain) => chain.capabilities.fees && chainSlugs[chain.key])
          .map((chain) => (
            <Link
              prefetch={false}
              data-intent-prefetch=""
              key={chain.key}
              href={localePath(locale, `/gas/${chainSlugs[chain.key]}`)}
              className="font-medium text-primary hover:underline"
            >
              {t(`chains.${chain.key}`)}
            </Link>
          ))}
      </nav>
    </ToolPage>
  );
}
