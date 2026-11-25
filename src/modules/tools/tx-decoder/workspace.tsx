import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localePath, toolPath } from "@/lib/routes";
import type { CommonStrings } from "../shared/ui";
import { knownSignatureCount } from "./decode";
import { TxDecoder, type TxDecoderStrings } from "./widget";

/** Server wrapper: translations are resolved here, so no i18n code is sent to the browser. */
export async function TxDecoderWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  const common = t.raw("common") as CommonStrings;
  return (
    <TxDecoder
      strings={t.raw("tx-decoder") as TxDecoderStrings}
      common={common}
      locale={locale}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
      searchPath={localePath(locale, "/search")}
      abiPath={toolPath(locale, "abi-encoder")}
      knownCount={knownSignatureCount}
    />
  );
}
