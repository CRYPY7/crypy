import "server-only";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { cachedGas } from "@/server/services/gas";
import { type GasStrings, GasTracker } from "./widget";

export async function GasTrackerWorkspace({ locale }: { locale: Locale }) {
  // Live numbers: render per request (inside the page's Suspense boundary), never at build time.
  await connection();
  const t = await getTranslations();
  const report = await cachedGas().catch(() => ({
    chains: [],
    unavailable: liveChains.filter((c) => c.capabilities.fees).map((c) => c.key),
  }));
  return (
    <GasTracker
      initial={report}
      strings={t.raw("utilities.gas-tracker") as GasStrings}
      locale={locale}
      chains={liveChains
        .filter((c) => c.capabilities.fees)
        .map((c) => ({ key: c.key, name: t(`chains.${c.key}`), coin: c.nativeSymbol }))}
    />
  );
}
