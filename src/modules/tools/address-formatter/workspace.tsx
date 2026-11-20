import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import type { CommonStrings } from "../shared/ui";
import { AddressFormatter, type AddressFormatterStrings } from "./widget";

/** Server wrapper: translations are resolved here, so no i18n code is sent to the browser. */
export async function AddressFormatterWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  const common = t.raw("common") as CommonStrings;
  return (
    <AddressFormatter
      strings={t.raw("address-formatter") as AddressFormatterStrings}
      common={common}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
    />
  );
}
