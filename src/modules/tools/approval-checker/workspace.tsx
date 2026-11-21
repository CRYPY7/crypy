import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { type ApprovalCheckerStrings, ApprovalCheckerForm } from "./widget";

export async function ApprovalCheckerWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <ApprovalCheckerForm
      strings={t.raw("utilities.approval-checker") as ApprovalCheckerStrings}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
      searchPath={localePath(locale, "/search")}
    />
  );
}
