import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { ProfitCalculator, type ProfitStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <ProfitCalculator
      strings={t.raw("profitCalculator") as ProfitStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
