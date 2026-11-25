import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { SlippageCalculator, type SlippageStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <SlippageCalculator
      strings={t.raw("slippage") as SlippageStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
