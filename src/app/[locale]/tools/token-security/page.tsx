import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localePath } from "@/lib/routes";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { ToolPage, toolMetadata } from "@/components/tools/tool-page";
import { getTool } from "@/config/tools";
import { isLocale } from "@/i18n/locales";
import { TokenSecurityWorkspace } from "@/modules/tools/token-security/workspace";

const ID = "token-security";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  return isLocale(locale) ? toolMetadata(ID, locale) : {};
}

export default async function Page() {
  const locale = await localeParam();
  const tool = getTool(ID);
  if (!tool || !isLocale(locale)) notFound();
  const t = await getTranslations("tokenChecks");
  return (
    <ToolPage tool={tool} locale={locale}>
      <TokenSecurityWorkspace locale={locale} />
      <p className="mt-4 text-sm">
        <Link href={localePath(locale, "/tokens")} className="font-medium text-primary hover:underline">
          {t("fromToolPage")} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </ToolPage>
  );
}
