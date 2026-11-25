import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { NftUriDecoder, type NftUriStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <NftUriDecoder
      strings={t.raw("nftUriDecoder") as NftUriStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
