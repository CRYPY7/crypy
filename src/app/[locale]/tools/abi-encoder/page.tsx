import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { ToolPage, toolMetadata } from "@/components/tools/tool-page";
import { getTool } from "@/config/tools";
import { isLocale } from "@/i18n/locales";
import { Workspace } from "@/modules/tools/abi-encoder/workspace";

const ID = "abi-encoder";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  return isLocale(locale) ? toolMetadata(ID, locale) : {};
}

export default async function Page() {
  const locale = await localeParam();
  const tool = getTool(ID);
  if (!tool || !isLocale(locale)) notFound();
  return (
    <ToolPage tool={tool} locale={locale}>
      <Workspace />
    </ToolPage>
  );
}
