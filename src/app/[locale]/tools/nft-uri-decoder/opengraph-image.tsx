import { toolOgImage } from "@/components/tools/tool-page";
import { builtLocales } from "@/i18n/locales";
import { ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "CRYPY tool";

export function generateStaticParams() {
  return builtLocales.map((locale) => ({ locale }));
}

export default function Image() {
  return toolOgImage("nft-uri-decoder");
}
