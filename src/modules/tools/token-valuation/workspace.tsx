import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { TokenValuationCalculator, type TokenValuationStrings } from "./widget";

export async function TokenValuationWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <TokenValuationCalculator
      strings={t.raw("tokenValuation") as TokenValuationStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
