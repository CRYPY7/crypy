import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { toolPath } from "@/lib/routes";
import type { CommonStrings } from "../shared/ui";
import { RawTxDecoder, type RawTxStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <RawTxDecoder
      strings={t.raw("rawTxDecoder") as RawTxStrings}
      common={t.raw("common") as CommonStrings}
      decoderPath={toolPath(locale, "tx-decoder")}
    />
  );
}
