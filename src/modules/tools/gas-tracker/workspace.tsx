import "server-only";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { cachedGas } from "@/server/services/gas";
import type { CommonStrings } from "../shared/ui";
import { ManualFeeCalculator, type ManualFeeStrings } from "./manual-fee-widget";
import { type GasStrings, GasTracker } from "./widget";

export async function GasTrackerWorkspace({ locale, only }: { locale: Locale; only?: string }) {
  // Live numbers: render per request (inside the page's Suspense boundary), never at build time.
  await connection();
  const t = await getTranslations();
  const report = await cachedGas().catch(() => ({
    chains: [],
    unavailable: liveChains.filter((c) => c.capabilities.fees).map((c) => c.key),
  }));
  const gasStrings = t.raw("utilities.gas-tracker") as GasStrings;
  const onlyChain = only ? liveChains.find((c) => c.key === only) : undefined;
  return (
    <>
      <GasTracker
        initial={report}
        strings={gasStrings}
        locale={locale}
        only={only}
        chains={liveChains
          .filter((c) => c.capabilities.fees)
          .map((c) => ({ key: c.key, name: t(`chains.${c.key}`), coin: c.nativeSymbol }))}
      />
      <ManualFeeCalculator
        strings={t.raw("utilities.manualFee") as ManualFeeStrings}
        common={t.raw("utilities.common") as CommonStrings}
        actions={{
          sendCoin: gasStrings.action_sendCoin!,
          sendToken: gasStrings.action_sendToken!,
          approve: gasStrings.action_approve!,
          swap: gasStrings.action_swap!,
          sendNft: gasStrings.action_sendNft!,
        }}
        coin={onlyChain?.nativeSymbol ?? t("utilities.manualFee.anyCoin")}
        locale={locale}
      />
    </>
  );
}
