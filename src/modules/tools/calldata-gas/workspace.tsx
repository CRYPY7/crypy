import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { toolPath } from "@/lib/routes";
import type { CommonStrings } from "../shared/ui";
import { CalldataGas, type CalldataStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <CalldataGas
      strings={t.raw("calldataGas") as CalldataStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
      decoderPath={toolPath(locale, "tx-decoder")}
    />
  );
}
