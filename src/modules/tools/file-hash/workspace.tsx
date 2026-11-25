import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";

import type { CommonStrings } from "../shared/ui";
import { FileHash, type FileHashStrings } from "./widget";

export async function Workspace({ locale }: { locale: Locale }) {
  const t = await getTranslations("utilities");
  return (
    <FileHash
      strings={t.raw("fileHash") as FileHashStrings}
      common={t.raw("common") as CommonStrings}
      locale={locale}
    />
  );
}
