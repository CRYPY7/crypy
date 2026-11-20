import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/locales";
import { ogImage, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "CRYPY";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Preview images use English for every language until reviewed non-Latin fonts ship (M9).
export default async function Image() {
  const t = await getTranslations({ locale: "en", namespace: "home" });
  return ogImage({ eyebrow: t("eyebrow"), title: t("title"), subtitle: t("subtitle") });
}
