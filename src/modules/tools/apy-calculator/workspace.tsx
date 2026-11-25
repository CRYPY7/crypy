import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { ApyCalculator, type ApyStrings } from "./widget";

export async function ApyCalculatorWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <ApyCalculator
      strings={t.raw("apyCalculator") as ApyStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
