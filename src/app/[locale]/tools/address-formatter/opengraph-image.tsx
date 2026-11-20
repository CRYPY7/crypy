import { toolOgImage } from "@/components/tools/tool-page";
import { locales } from "@/i18n/locales";
import { ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "CRYPY tool";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function Image() {
  return toolOgImage("address-formatter");
}
