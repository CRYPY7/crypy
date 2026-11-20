import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { ToolPage, toolMetadata } from "@/components/tools/tool-page";
import { getTool, toolIds } from "@/config/tools";
import { isLocale } from "@/i18n/locales";
import { ownRouteTools } from "@/modules/tools/own-route";

/** Landing pages for tools that aren't live yet. Working tools have their own folders next to this one. */
export function generateStaticParams() {
  return toolIds.filter((id) => !ownRouteTools.includes(id)).map((toolId) => ({ toolId }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tools/[toolId]">): Promise<Metadata> {
  const [{ toolId }, locale] = await Promise.all([params, localeParam()]);
  if (!isLocale(locale)) return {};
  return toolMetadata(toolId, locale);
}

export default async function ToolLandingPage({ params }: PageProps<"/[locale]/tools/[toolId]">) {
  const [{ toolId }, locale] = await Promise.all([params, localeParam()]);
  const tool = getTool(toolId);
  if (!tool || !isLocale(locale) || ownRouteTools.includes(tool.id)) notFound();
  return <ToolPage tool={tool} locale={locale} />;
}
