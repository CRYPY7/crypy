import "server-only";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { PortfolioTracker, type PortfolioStrings } from "./widget";

/** Server wrapper: translated strings and chain names. The portfolio itself lives in the visitor's browser. */
export async function PortfolioWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  const strings = t.raw("utilities.portfolio") as PortfolioStrings;
  const chainNames = Object.fromEntries(liveChains.map((c) => [c.key, t(`chains.${c.key}`)]));
  return (
    <PortfolioTracker
      strings={strings}
      locale={locale}
      chainNames={chainNames}
      addressPrefix={`${localePath(locale, "/address")}/`}
      tokenPrefix={`${localePath(locale, "/token")}/`}
    />
  );
}
