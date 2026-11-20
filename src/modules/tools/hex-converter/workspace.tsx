import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { HexConverter, type HexConverterStrings } from "./widget";

/** Server wrapper: translations are resolved here, so no i18n code is sent to the browser. */
export async function HexConverterWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  const common = t.raw("common") as CommonStrings;
  return <HexConverter strings={t.raw("hex-converter") as HexConverterStrings} common={common} locale={locale} />;
}
