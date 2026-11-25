import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";

import type { CommonStrings } from "../shared/ui";
import { BitcoinFee, type BitcoinFeeStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <BitcoinFee
      strings={t.raw("bitcoinFee") as BitcoinFeeStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
