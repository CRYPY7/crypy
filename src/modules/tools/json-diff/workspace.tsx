import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import type { CommonStrings } from "../shared/ui";
import { JsonDiff, type JsonDiffStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <JsonDiff
      strings={t.raw("jsonDiff") as JsonDiffStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
