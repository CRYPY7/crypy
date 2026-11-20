import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { UnitConverter, type UnitConverterStrings } from "./widget";

/** Server wrapper: translations are resolved here, so no i18n code is sent to the browser. */
export async function UnitConverterWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  const common = t.raw("common") as CommonStrings;
  void locale;
  return <UnitConverter strings={t.raw("unit-converter") as UnitConverterStrings} common={common} />;
}
