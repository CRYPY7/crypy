import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { ImpermanentLossCalculator, type IlStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <ImpermanentLossCalculator
      strings={t.raw("impermanentLoss") as IlStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
