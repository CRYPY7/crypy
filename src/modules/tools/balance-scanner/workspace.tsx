import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { BalanceScanner, type BalanceScannerStrings } from "./widget";

export async function BalanceScannerWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <BalanceScanner
      strings={t.raw("balance-scanner") as BalanceScannerStrings}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
      searchPath={localePath(locale, "/search")}
    />
  );
}
