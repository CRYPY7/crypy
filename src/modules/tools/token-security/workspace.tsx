import "server-only";
import { getTranslations } from "next-intl/server";
import { chains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { TokenSecurityForm, type TokenSecurityStrings } from "./widget";

export async function TokenSecurityWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <TokenSecurityForm
      strings={t.raw("utilities.token-security") as TokenSecurityStrings}
      chains={chains
        .filter((c) => c.status === "live" && c.capabilities.tokenSecurity)
        .map((c) => ({ key: c.key, name: t(`chains.${c.key}`) }))}
      tokenPathPrefix={`${localePath(locale, "/token")}/`}
      searchPath={localePath(locale, "/search")}
    />
  );
}
