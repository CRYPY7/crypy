import "server-only";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { type TimestampStrings, TimestampConverter } from "./widget";

export async function TimestampWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <TimestampConverter
      strings={t.raw("utilities.timestamp-block") as TimestampStrings}
      locale={locale}
      chains={liveChains.map((c) => ({ key: c.key, name: t(`chains.${c.key}`) }))}
    />
  );
}
