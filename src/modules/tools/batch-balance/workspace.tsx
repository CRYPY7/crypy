import "server-only";
import { getTranslations } from "next-intl/server";
import { batchAssets } from "@/config/batch-assets";
import { chains } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { BatchBalanceScanner, type BatchStrings } from "./widget";

/** Server wrapper: translated strings and the chains that can be scanned (live EVM chains with balances). */
export async function BatchBalanceWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  const strings = t.raw("utilities.batch-balance") as BatchStrings;
  const scannable = chains
    .filter((chain) => chain.family === "evm" && chain.status === "live" && chain.capabilities.tokenBalances)
    .map((chain) => ({
      key: chain.key,
      name: t(`chains.${chain.key}`),
      nativeSymbol: chain.nativeSymbol,
      // Keyless public nodes, for "Scan in my browser".
      publicRpcUrls: chain.publicRpcUrls,
    }));
  return (
    <BatchBalanceScanner
      strings={strings}
      chains={scannable}
      knownAssets={[...batchAssets]}
      locale={locale}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
    />
  );
}
