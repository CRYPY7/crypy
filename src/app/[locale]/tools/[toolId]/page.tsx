import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { locale as localeParam } from "next/root-params";
import { ToolPage, toolMetadata } from "@/components/tools/tool-page";
import { getTool, toolIds } from "@/config/tools";
import { isLocale } from "@/i18n/locales";
import { ownRouteTools } from "@/modules/tools/own-route";

/** Landing pages for tools that aren't live yet. Working tools have their own folders next to this one. */
export function generateStaticParams() {
  const soon = toolIds.filter((id) => !ownRouteTools.includes(id)).map((toolId) => ({ toolId }));
  // Every tool has its own page now; keep one placeholder so the route stays valid for future tools (it 404s).
  return soon.length ? soon : [{ toolId: "upcoming" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/tools/[toolId]">): Promise<Metadata> {
  const [{ toolId }, locale] = await Promise.all([params, localeParam()]);
  if (!isLocale(locale)) return {};
  return toolMetadata(toolId, locale);
}

// Params are read inside a Suspense boundary so navigation can show the page shell at once (Next.js instant
// navigation check); every known tool id is still prerendered by generateStaticParams.
export default function ToolLandingPage({ params }: PageProps<"/[locale]/tools/[toolId]">) {
  return (
    <Suspense>
      <Landing params={params} />
    </Suspense>
  );
}

async function Landing({ params }: { params: PageProps<"/[locale]/tools/[toolId]">["params"] }) {
  const [{ toolId }, locale] = await Promise.all([params, localeParam()]);
  const tool = getTool(toolId);
  if (!tool || !isLocale(locale) || ownRouteTools.includes(tool.id)) notFound();
  return <ToolPage tool={tool} locale={locale} />;
}
