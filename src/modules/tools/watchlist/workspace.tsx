import "server-only";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { Watchlist } from "./widget";

/** Server wrapper: translated strings and chain names. Everything personal is loaded in the browser after sign-in. */
export async function WatchlistWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <Watchlist
      strings={t.raw("utilities.watchlist") as Record<string, string>}
      chainNames={Object.fromEntries(liveChains.map((c) => [c.key, t(`chains.${c.key}`)]))}
      tokenChains={liveChains.filter((c) => c.capabilities.tokenSecurity).map((c) => c.key)}
      locale={locale}
      addressPrefix={`${localePath(locale, "/address")}/`}
      tokenPrefix={`${localePath(locale, "/token")}/`}
    />
  );
}
