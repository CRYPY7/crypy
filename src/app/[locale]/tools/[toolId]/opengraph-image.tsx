import { toolOgImage } from "@/components/tools/tool-page";
import { toolIds } from "@/config/tools";
import { locales } from "@/i18n/locales";
import { ogSize } from "@/lib/og";
import { ownRouteTools } from "@/modules/tools/own-route";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "CRYPY tool";

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    toolIds.filter((id) => !ownRouteTools.includes(id)).map((toolId) => ({ locale, toolId })),
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string; toolId: string }> }) {
  const { toolId } = await params;
  return toolOgImage(toolId);
}
