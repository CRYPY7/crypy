import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { SignatureDecoder, type SignatureStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <SignatureDecoder
      strings={t.raw("signatureDecoder") as SignatureStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
